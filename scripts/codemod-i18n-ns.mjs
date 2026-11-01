/**
 * One-off codemod: collapse `useTranslation(['a','b'])` to `useTranslation()`.
 *
 * The locale files are merged into a single `translation` namespace at runtime
 * (see src/i18n/index.ts), so requesting namespaces by name is now invalid.
 * Kept in scripts/ so the change is auditable and repeatable.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(tsx?)$/.test(entry) ? [full] : [];
  });

let changed = 0;

for (const file of walk(SRC)) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(/useTranslation\(\[[^\]]*\]\)/g, 'useTranslation()');
  if (after !== before) {
    writeFileSync(file, after);
    changed += 1;
    console.log('✎', relative(ROOT, file).split('\\').join('/'));
  }
}

console.log(`\n${changed} file(s) updated`);
