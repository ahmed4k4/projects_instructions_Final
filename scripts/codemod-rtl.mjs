/**
 * One-off codemod: physical → logical direction utilities.
 *
 * Kept in scripts/ (not run automatically) so the transformation is auditable.
 * Word-boundary matching avoids touching substrings like `transform` or
 * `overflow-`.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const RULES = [
  // Spacing — negative values included (`-ml-2` → `-ms-2`).
  [/(?<![\w-])ml-(\d+(?:\.\d+)?)/g, 'ms-$1'],
  [/(?<![\w-])mr-(\d+(?:\.\d+)?)/g, 'me-$1'],
  [/(?<![\w-])pl-(\d+(?:\.\d+)?)/g, 'ps-$1'],
  [/(?<![\w-])pr-(\d+(?:\.\d+)?)/g, 'pe-$1'],
  [/(?<![\w-])-ml-(\d+(?:\.\d+)?)/g, '-ms-$1'],
  [/(?<![\w-])-mr-(\d+(?:\.\d+)?)/g, '-me-$1'],
  // Inset — only concrete offsets, never `left-1/2`-style fractions are skipped
  // (they are handled too: the fraction is preserved).
  [/(?<![\w-])left-(\d+(?:\.\d+)?|1\/2|full|auto)/g, 'start-$1'],
  [/(?<![\w-])right-(\d+(?:\.\d+)?|1\/2|full|auto)/g, 'end-$1'],
  [/(?<![\w-])-left-(\d+(?:\.\d+)?|1\/2|full)/g, '-start-$1'],
  [/(?<![\w-])-right-(\d+(?:\.\d+)?|1\/2|full)/g, '-end-$1'],
  // Text alignment.
  [/(?<![\w-])text-left(?![\w-])/g, 'text-start'],
  [/(?<![\w-])text-right(?![\w-])/g, 'text-end'],
];

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(tsx?|css)$/.test(entry) ? [full] : [];
  });

let changed = 0;

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (rel.includes('/i18n/locales/')) continue;

  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [re, replacement] of RULES) after = after.replace(re, replacement);

  if (after !== before) {
    writeFileSync(file, after);
    changed += 1;
    console.log('✎', rel);
  }
}

console.log(`\n${changed} file(s) updated`);
