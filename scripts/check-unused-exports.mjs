#!/usr/bin/env node
/**
 * Unused-export detector.
 *
 *   node scripts/check-unused-exports.mjs
 *   node scripts/check-unused-exports.mjs --json
 *
 * A file can be imported and still carry dead exports — the Phase 11 brief calls
 * these out ("components installed but never imported", "unused exports"). This
 * reports an export whose name appears nowhere outside its own file.
 *
 * Value exports (functions, consts, classes) are REPORTED — dead code.
 * Type-only exports (interface, type) are NOT: a props interface used by the
 * component below it is a legitimate local declaration, and flagging it produced
 * a 60-line false-positive list that buried the real findings.
 *
 * Correctness notes (each is a bug found by running it against this repo):
 *   · Pure barrels (`export { a } from './x'`) declare no local names — skipped.
 *     Counting them flagged `services/geminiService.ts`, the module every agent
 *     imports.
 *   · A false "used" is harmless; a false "unused" deletes working code, so ANY
 *     mention in any other file counts.
 *
 * Exit 1 when anything is unused, so it can gate a release.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
};

const files = walk(SRC);
const sources = new Map(files.map((file) => [file, readFileSync(join(ROOT, file), 'utf8')]));

/**
 * Server entry points live OUTSIDE src/ (`api/ai/[...route].ts`, `vite.config.ts`)
 * and import `src/server/*`. Without them every export there looks unused.
 */
const SERVER_SOURCES = [];
for (const file of ['api/ai/[...route].ts', 'vite.config.ts']) {
  try {
    SERVER_SOURCES.push(readFileSync(join(ROOT, file), 'utf8'));
  } catch {
    /* file absent in this checkout */
  }
}

/** Value exports only. Types are declarations, not runtime surface. */
const VALUE_EXPORT_RE = /^export\s+(?:async\s+)?(?:function|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/gm;

const REEXPORT_RE = /^export\s*(?:type\s*)?\{[^}]*\}/m;

const exported = new Map();
for (const file of files) {
  if (file.endsWith('.d.ts')) continue;
  const source = sources.get(file);
  if (REEXPORT_RE.test(source)) continue; // pure barrel
  const names = [...source.matchAll(VALUE_EXPORT_RE)].map((m) => m[1]);
  if (names.length) exported.set(file, names);
}

const WORD = (name) => new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);

const unused = [];
for (const [file, names] of exported) {
  for (const name of names) {
    const pattern = WORD(name);
    let used = false;
    for (const [other, source] of sources) {
      if (other === file) continue;
      if (pattern.test(source)) {
        used = true;
        break;
      }
    }
    if (!used && SERVER_SOURCES.some((source) => pattern.test(source))) used = true;
    if (!used) unused.push({ file, name });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(unused, null, 2));
} else if (unused.length === 0) {
  console.log(`✔ no unused exports (${exported.size} files with exports scanned)`);
} else {
  const byFile = new Map();
  for (const item of unused) byFile.set(item.file, [...(byFile.get(item.file) ?? []), item.name]);
  for (const [file, names] of [...byFile].sort()) console.log(`${file}: ${names.join(', ')}`);
  console.log(`\n${unused.length} unused export(s) in ${byFile.size} file(s)`);
}

process.exit(unused.length ? 1 : 0);
