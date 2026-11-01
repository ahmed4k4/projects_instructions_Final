#!/usr/bin/env node
/**
 * RTL safety gate.
 *
 * Physical direction utilities (ml-, mr-, pl-, pr-, left-, right-, text-left,
 * text-right) break when the layout flips to RTL. Use logical equivalents
 * (ms-, me-, ps-, pe-, start-, end-, text-start, text-end) instead.
 *
 * Deliberate exceptions are listed in ALLOW below with a reason — anything else
 * fails the check, so the list cannot silently grow.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/** Utilities that do not flip and have no logical equivalent. */
const BANNED = [
  { re: /(?<![\w-])ml-(?!auto)/, util: 'ml-*' },
  { re: /(?<![\w-])mr-(?!auto)/, util: 'mr-*' },
  { re: /(?<![\w-])pl-(?!\d*px)/, util: 'pl-*' },
  { re: /(?<![\w-])pr-/, util: 'pr-*' },
  { re: /(?<![\w-])left-\d/, util: 'left-*' },
  { re: /(?<![\w-])right-\d/, util: 'right-*' },
  { re: /(?<![\w-])text-left(?!\w)/, util: 'text-left' },
  { re: /(?<![\w-])text-right(?!\w)/, util: 'text-right' },
];

/**
 * file:line → reason. Keep this list tiny and justified.
 */
const ALLOW = new Map([
  // Absolute positioning inside an icon wrapper: centred, direction-agnostic.
  ['src/components/layout/Topbar.tsx', 'spinner offset inside a square icon button'],
]);

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(tsx?|css)$/.test(entry) ? [full] : [];
  });

let failures = 0;

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (rel.includes('/i18n/locales/')) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    // Skip comments and the allow-listed files entirely.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const rule of BANNED) {
      if (!rule.re.test(line)) continue;
      if (ALLOW.has(rel)) return;
      failures += 1;
      console.error(
        `✖ ${rel}:${index + 1} physical \`${rule.util}\` — use a logical utility (ms/me/ps/pe/start/end)`,
      );
      console.error(`    ${line.trim().slice(0, 120)}`);
      break;
    }
  });
}

if (failures > 0) {
  console.error(`\n✖ rtl check failed (${failures} finding(s)).`);
  process.exit(1);
}

console.log('✔ rtl clean — no physical direction utilities found');
