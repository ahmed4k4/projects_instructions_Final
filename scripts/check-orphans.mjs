#!/usr/bin/env node
/**
 * Orphan checker — fails when a file in `src/` is not imported by anything.
 *
 *   node scripts/check-orphans.mjs
 *   node scripts/check-orphans.mjs --json     (machine-readable, for CI artefacts)
 *
 * Why a second audit when `audit-unused.mjs` exists
 *   `audit-unused` reports consoles, commented codepaths and a rough reachability
 *   figure but always exits 0. This one is the release gate: it resolves imports
 *   the way Vite does (`@/`, relative, extension and `index` candidates), treats
 *   the app entries + server entries + tests as roots, and EXITS 1 on any orphan.
 *
 * Rules
 *   · `src/main.tsx`, `src/App.tsx`, `src/router.tsx`, `vite-env.d.ts` and every
 *     `__tests__` file are roots — never orphans.
 *   · `api/**` and `src/server/**` are server roots (Vercel + the dev proxy).
 *   · A dynamic `import('…')` counts as an edge (route-level code splitting).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css'];

/** Files that are entry points by definition. */
const ROOT_FILES = new Set([
  'src/main.tsx',
  'src/App.tsx',
  'src/router.tsx',
  'src/vite-env.d.ts',
  'src/index.css',
]);

/** Environment declarations are ambient: nothing imports them, by design. */
const AMBIENT = /\.d\.ts$/;

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
};

const IMPORT_PATTERNS = [
  /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g,
  /import\s+['"]([^'"]+)['"]/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /vi\.mock\s*\(\s*['"]([^'"]+)['"]/g,
];

/** Resolve a specifier to a project file, mirroring Vite's resolution order. */
function resolveSpecifier(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(join(ROOT, fromFile)), spec);
  else return null;

  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, `index${e}`))];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return relative(ROOT, candidate).replace(/\\/g, '/');
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

const allSrc = walk(SRC);
const graph = new Map();
const unresolved = [];

for (const file of allSrc) {
  if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
  const source = readFileSync(join(ROOT, file), 'utf8');
  const deps = new Set();

  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const spec = match[1];
      if (!spec) continue;
      const resolved = resolveSpecifier(spec, file);
      if (resolved) deps.add(resolved);
      else if (spec.startsWith('@/')) unresolved.push(`${file} -> ${spec}`);
    }
  }
  graph.set(file, deps);
}

/* ── Roots ─────────────────────────────────────────────────────────────────── */
const roots = new Set();
for (const file of allSrc) {
  if (ROOT_FILES.has(file)) roots.add(file);
  if (AMBIENT.test(file)) roots.add(file);
  if (file.includes('__tests__') || /\.test\.tsx?$/.test(file)) roots.add(file);
}
try {
  for (const file of walk(join(ROOT, 'api'))) roots.add(file);
} catch {
  /* no server directory */
}
for (const file of allSrc) if (file.startsWith('src/server/')) roots.add(file);
if (readFileSync('vite.config.ts', 'utf8').includes('src/server')) roots.add('vite.config.ts');

/* ── Reachability ──────────────────────────────────────────────────────────── */
const reached = new Set();
const queue = [...roots];
while (queue.length) {
  const file = queue.pop();
  if (!file || reached.has(file)) continue;
  reached.add(file);
  for (const dep of graph.get(file) ?? []) queue.push(dep);
}

const orphans = allSrc.filter((file) => /\.(ts|tsx|js|jsx)$/.test(file) && !reached.has(file));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total: allSrc.length, reached: reached.size, orphans, unresolved }, null, 2));
  process.exit(orphans.length ? 1 : 0);
}

console.log(`src files: ${allSrc.length} · reached: ${reached.size} · orphans: ${orphans.length}`);

if (unresolved.length) {
  console.log('\nUnresolvable @/ imports (a real build error):');
  for (const entry of [...new Set(unresolved)]) console.log(`  ${entry}`);
}

if (orphans.length) {
  console.log('\nORPHANS — nothing imports these:');
  for (const orphan of orphans) console.log(`  ${orphan}`);
  console.log('\nDelete them, import them, or make them a root in this script with a reason.');
  process.exit(1);
}

if (unresolved.length) process.exit(1);

console.log('✔ every src file is reachable');
