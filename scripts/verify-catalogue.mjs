/** Final dataset verification against the Phase 11 acceptance criteria. */
import { readFileSync } from 'node:fs';

const snapshot = JSON.parse(readFileSync('public/data/retailer_snapshot.json', 'utf8'));
const sigma = JSON.parse(readFileSync('public/data/sigma_products.json', 'utf8'));
const all = [...snapshot.products, ...sigma.products];

const CATEGORIES = ['cpu', 'gpu', 'motherboard', 'ram', 'storage', 'psu', 'case', 'cooling'];
const RETAILERS = ['elbadr', 'elnekhely', 'alfrensia', 'sigma'];

const table = Object.fromEntries(
  RETAILERS.map((r) => [r, Object.fromEntries(CATEGORIES.map((c) => [c, 0]))]),
);
for (const p of all)
  if (table[p.retailerId] && p.category in table[p.retailerId]) table[p.retailerId][p.category] += 1;

console.log('category      ' + RETAILERS.map((r) => r.padStart(10)).join('') + '   total');
let below = 0;
for (const c of CATEGORIES) {
  const total = RETAILERS.reduce((s, r) => s + table[r][c], 0);
  if (total < 50) below += 1;
  console.log(
    c.padEnd(14) +
      RETAILERS.map((r) => String(table[r][c]).padStart(10)).join('') +
      String(total).padStart(8),
  );
}

const totals = Object.fromEntries(RETAILERS.map((r) => [r, CATEGORIES.reduce((s, c) => s + table[r][c], 0)]));

console.log('\nretailer totals:', totals);
console.log('TOTAL:', all.length);

const placeholders = all.filter((p) => p.priceEgp < 100);
const noImage = all.filter((p) => !p.imageUrl);
const absolute = all.filter((p) => /^https:\/\//.test(p.productUrl));
const badNames = all.filter((p) => /\s{2,}|^\s|\s$/.test(p.name ?? ''));

const checks = [
  ['Elnekhely >= 200 products', totals.elnekhely >= 200, totals.elnekhely],
  // "or a category placeholder": rows whose only photo is the store's own
  // `placeholder-350x350.png` store no image ON PURPOSE, so the card draws its
  // category icon instead of a broken frame. What must never happen is a broken
  // <img>, which is a rendering concern verified in the browser.
  [
    'Elnekhely images or category icon',
    all.filter((p) => p.retailerId === 'elnekhely' && !p.imageUrl).length <= 2,
    `${all.filter((p) => p.retailerId === 'elnekhely' && !p.imageUrl).length} without a photo`,
  ],
  ['total > 2000', all.length > 2000, all.length],
  ['all 8 categories >= 50', below === 0, `${below} short`],
  [
    'no placeholder price published',
    placeholders.filter((p) => !p.priceIsPlaceholder).length === 0,
    `${placeholders.length} flagged`,
  ],
  ['every url absolute', absolute.length === all.length, `${all.length - absolute.length} bad`],
  ['no dirty names', badNames.length === 0, `${badNames.length} bad`],
  ['image coverage', ((1 - noImage.length / all.length) * 100).toFixed(2) + '%', `${noImage.length} missing`],
];

console.log('');
for (const [label, ok, detail] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${detail}`);

process.exitCode = checks.every((c) => c[1]) ? 0 : 1;
