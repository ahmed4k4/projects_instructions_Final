/**
 * src/ reachability audit.
 *
 *   node scripts/audit-unused.mjs
 *
 * Walks import/require/dynamic-import/vi.mock edges from the app entry points and
 * reports any src file nothing reaches. Also flags console.* left in prod paths.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const ENTRIES = ['src/main.tsx', 'src/App.tsx', 'src/router.tsx'];
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.json'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const all = walk(SRC).map((p) => relative(ROOT, p).replace(/\\/g, '/'));
const IMPORTS =
  /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)|vi\.mock\(\s*['"]([^'"]+)['"]/g;

function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;

  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, `index${e}`))];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return relative(ROOT, c).replace(/\\/g, '/');
    } catch {
      /* not this one */
    }
  }
  return null;
}

const graph = new Map();
for (const file of all) {
  if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
  const source = readFileSync(join(ROOT, file), 'utf8');
  const deps = new Set();
  for (const m of source.matchAll(IMPORTS)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (!spec) continue;
    const resolved = resolveSpec(spec, join(ROOT, file));
    if (resolved) deps.add(resolved);
  }
  graph.set(file, deps);
}

const seen = new Set();
const queue = [...ENTRIES];
while (queue.length) {
  const file = queue.pop();
  if (!file || seen.has(file)) continue;
  seen.add(file);
  for (const dep of graph.get(file) ?? []) queue.push(dep);
}

// Test files are entry points for themselves.
const tests = all.filter((f) => f.includes('__tests__') || f.endsWith('.test.ts') || f.endsWith('.test.tsx'));
for (const t of tests) {
  const queue2 = [t];
  while (queue2.length) {
    const file = queue2.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    for (const dep of graph.get(file) ?? []) queue2.push(dep);
  }
}

const orphans = all.filter((f) => /\.(ts|tsx)$/.test(f) && !seen.has(f));

console.log(`\n=== UNREACHABLE FILES (${orphans.length}) ===`);
for (const f of orphans) console.log('  ' + f);

console.log('\n=== console.* IN src/ (excluding tests) ===');
for (const file of all) {
  if (!/\.(ts|tsx)$/.test(file) || file.includes('__tests__')) continue;
  const lines = readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/\bconsole\.(log|debug|info|warn|error)\b/.test(line) && !line.trim().startsWith('*')) {
      console.log(`  ${file}:${i + 1}  ${line.trim().slice(0, 110)}`);
    }
  });
}

console.log('\n=== COMMENTED-OUT CODE BLOCKS ===');
for (const file of all) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const lines = readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/);
  let run = [];
  const flush = () => {
    const code = run.filter((l) => /[;{=()]/.test(l) && !/^\s*\*/.test(l));
    if (code.length >= 2) {
      console.log(`  ${file}:${run[0].line}  (${code.length} lines)`);
      code.slice(0, 3).forEach((l) => console.log('      ' + l.text.trim().slice(0, 100)));
    }
    run = [];
  };
  lines.forEach((text, i) => {
    const isComment = /^\s*\/\//.test(text);
    if (isComment) run.push({ line: i + 1, text });
    else flush();
  });
  flush();
}

console.log(
  `\nTotal src files: ${all.length} · reachable: ${all.length - orphans.length} · orphans: ${orphans.length}`,
);

// `vite-env.d.ts` is ambient types: never imported, always required. Anything
// beyond it is real dead weight and fails the gate.
const AMBIENT = new Set(['src/vite-env.d.ts']);
const realOrphans = orphans.filter((file) => !AMBIENT.has(file));

if (realOrphans.length > 0) {
  console.error(`\n✖ ${realOrphans.length} unreachable file(s) that are not ambient types.`);
  process.exit(1);
}
