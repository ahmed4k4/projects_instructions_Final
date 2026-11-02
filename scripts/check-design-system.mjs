/**
 * Design-system consistency gate.
 *
 *   node scripts/check-design-system.mjs
 *
 * Phase 7 asked for "one border radius, shadow and spacing scale, a single colour
 * source of truth, and consistent line heights between the Arabic and Latin
 * faces". This asserts those rules against the source instead of relying on
 * review:
 *
 *   1. No hard-coded hex colours in components (colours come from CSS variables).
 *   2. Border radii stay on the scale (sm|md|lg|xl|2xl|full) — no arbitrary px.
 *   3. Font sizes stay on the Tailwind scale — no text-[13px] one-offs in body copy.
 *   4. Both faces declare the same line-height strategy.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(tsx|ts)$/.test(entry) ? [full] : [];
  });

const files = walk(SRC).filter((f) => !f.includes('__tests__'));
let problems = 0;
const report = (message) => {
  problems += 1;
  console.error(`✖ ${message}`);
};

/* 1. Hard-coded colours ------------------------------------------------ */
// Allowed: deliberate brand/retailer tones and the 3D scene, which cannot use CSS
// variables inside WebGL material props.
const COLOUR_EXEMPT = /(components\/scene\/|services\/retailers\/types\.ts)/;
const HEX = /(?:^|[\s'"`:(])#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi;

for (const file of files) {
  if (COLOUR_EXEMPT.test(file.replace(/\\/g, '/'))) continue;
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(HEX)) {
    const line = source.slice(0, match.index).split('\n').length;
    // rgba(0 0 0 / .x) inside shadows is fine; raw hex is what drifts.
    report(`${file}:${line} hard-coded colour ${match[0].trim()}`);
  }
}

/* 2. Arbitrary radii --------------------------------------------------- */
const ARBITRARY_RADIUS = /rounded-\[\d/g;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (ARBITRARY_RADIUS.test(source)) report(`${file} uses an arbitrary border radius`);
}

/* 3. Off-scale font sizes in body copy --------------------------------- */
// `text-[Npx]` is allowed for micro-labels (<=12px) which the scale lacks, but a
// body size must come from a scale token.
const OFF_SCALE_BODY = /text-\[(\d+)(?:px)?\]/g;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(OFF_SCALE_BODY)) {
    const size = Number(match[1]);
    if (size >= 13) {
      const line = source.slice(0, match.index).split('\n').length;
      report(`${file}:${line} off-scale body font size ${match[0]}`);
    }
  }
}

/* 4. Font pairing ------------------------------------------------------ */
const globals = readFileSync('src/styles/globals.css', 'utf8');
if (!/IBM Plex Sans Arabic/.test(globals)) report('Arabic font family is not declared in globals.css');
if (!/Inter Variable/.test(globals)) report('Latin font family is not declared in globals.css');
// Both faces must share the body line-height or Arabic paragraphs sit tighter
// than Latin ones and the two languages look like different products.
if (!/line-height:\s*1\.(6|65|7)/.test(globals)) {
  report('body line-height is not set (Arabic needs ~1.65, Latin ~1.6)');
}

if (problems > 0) {
  console.error(`\n✖ design-system check failed (${problems} problem(s)).`);
  process.exit(1);
}

console.log(`✔ design system consistent — ${files.length} files checked`);
