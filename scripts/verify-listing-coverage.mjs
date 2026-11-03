/**
 * Measure listing coverage and image availability per retailer, from the live
 * snapshot. Reports per-retailer product counts and the share with a usable
 * image URL, plus the total — the Phase 10 acceptance numbers.
 *
 *   node scripts/verify-listing-coverage.mjs
 */
import { readFileSync } from 'node:fs';

const SNAPSHOT = JSON.parse(readFileSync('public/data/retailer_snapshot.json', 'utf8'));
const products = SNAPSHOT.products ?? [];

const PLACEHOLDER = /(placeholder|no_image|noimage|spacer|blank|warranty|badge|logo|flag|payment)/i;

const usable = (url) => Boolean(url) && url.startsWith('http') && !PLACEHOLDER.test(url);

const byRetailer = new Map();
for (const p of products) {
  const row = byRetailer.get(p.retailerId) ?? { total: 0, images: 0, categories: new Set() };
  row.total += 1;
  if (usable(p.imageUrl)) row.images += 1;
  if (p.category) row.categories.add(p.category);
  byRetailer.set(p.retailerId, row);
}

let failures = 0;
const TARGET = { minImages: 0.9, minProducts: 400 };

console.log(`capturedAt ${SNAPSHOT.capturedAt}`);
console.log('retailer     products   images   share   categories');

let total = 0;
let imageTotal = 0;
for (const [id, row] of [...byRetailer].sort((a, b) => b[1].total - a[1].total)) {
  const share = row.total ? row.images / row.total : 0;
  total += row.total;
  imageTotal += row.images;
  const mark = share >= TARGET.minImages ? ' ' : '!';
  console.log(
    `${mark}${id.padEnd(11)} ${String(row.total).padStart(6)} ${String(row.images).padStart(8)} ${(share * 100).toFixed(0).padStart(6)}%   ${row.categories.size}`,
  );
}

const overall = total ? imageTotal / total : 0;
console.log(
  `\ntotal        ${String(total).padStart(6)} ${String(imageTotal).padStart(8)} ${(overall * 100).toFixed(0).padStart(6)}%`,
);

if (overall < TARGET.minImages) {
  console.error(
    `✖ only ${(overall * 100).toFixed(0)}% of listings have an image (target â‰¥ ${TARGET.minImages * 100}%)`,
  );
  failures += 1;
}
if (total < TARGET.minProducts) {
  console.error(`✖ only ${total} listings (target > ${TARGET.minProducts})`);
  failures += 1;
}

if (failures) process.exit(1);
console.log('✔ coverage targets met');
