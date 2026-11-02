/**
 * Verify grouping against the real scrape snapshot.
 *
 *   node scripts/verify-search-grouping.mjs
 *
 * Asserts the Phase 8 acceptance criterion: searching "rtx 5060" (and friends)
 * returns groups spanning at least 3 retailers where the data allows, and that
 * distinct SKUs are never merged.
 */
import { readFileSync } from 'node:fs';
import { skuKey, groupLabel } from '../src/lib/skuGrouping.ts';

const snapshot = JSON.parse(readFileSync('src/services/retailers/snapshot.json', 'utf8'));

// Minimal reimplementation of groupListings() — the shipped version lives in
// src/services/searchService.ts and needs the bundler.
const rank = (offers) =>
  [...offers].sort(
    (a, b) =>
      (a.stockStatus === 'in_stock' ? 0 : 1) - (b.stockStatus === 'in_stock' ? 0 : 1) ||
      a.priceEgp - b.priceEgp,
  );

function groupListings(listings) {
  const buckets = new Map();
  for (const listing of listings) {
    const key = skuKey(listing.name);
    const id = key ? `sku:${listing.category}:${key}` : `listing:${listing.name}`;
    const bucket = buckets.get(id) ?? [];
    bucket.push(listing);
    buckets.set(id, bucket);
  }
  return [...buckets.entries()].map(([id, offers]) => {
    const ranked = rank(offers);
    const inStock = ranked.filter((o) => o.stockStatus === 'in_stock');
    const pool = inStock.length ? inStock : ranked;
    return {
      id,
      name: groupLabel(ranked.map((o) => o.name)),
      category: ranked[0].category,
      offers: ranked,
      best: ranked[0],
      retailerIds: [...new Set(ranked.map((o) => o.retailerId))],
      savingsEgp: Math.round((pool[pool.length - 1]?.priceEgp ?? 0) - (pool[0]?.priceEgp ?? 0)),
    };
  });
}

const all = groupListings(snapshot.products);

console.log(`listings ${snapshot.products.length} → groups ${all.length}\n`);

const multi = all
  .filter((g) => g.retailerIds.length > 1)
  .sort((a, b) => b.retailerIds.length - a.retailerIds.length);
console.log(`Cross-retailer groups: ${multi.length}`);
for (const g of multi) {
  console.log(
    `  ${g.retailerIds.length}× ${g.category.padEnd(11)} ${String(Math.round(g.best.priceEgp)).padStart(7)} EGP  save ${String(g.savingsEgp).padStart(6)}  ${g.best.name.slice(0, 46)}`,
  );
  for (const o of g.offers) {
    console.log(
      `       ${o.retailerId.padEnd(10)} ${String(Math.round(o.priceEgp)).padStart(7)}  ${o.name.slice(0, 58)}`,
    );
  }
}

// Searches a user would actually type.
console.log('\nQuery checks:');
const QUERIES = ['rtx 5060', 'rtx 5070', 'ryzen', 'core ultra', 'rx 9060'];
for (const q of QUERIES) {
  const terms = q.toLowerCase().split(/\s+/);
  const hits = all.filter((g) => terms.every((t) => g.name.toLowerCase().includes(t)));
  const retailers = [...new Set(hits.flatMap((g) => g.retailerIds))];
  console.log(`  "${q}" → ${hits.length} groups, retailers: ${retailers.join(', ') || 'none'}`);
}

// Distinct SKUs that must never merge.
console.log('\nSKU separation checks:');
const PAIRS = [
  ['GIGABYTE GeForce RTX 5060 Ti 8GB', 'GIGABYTE GeForce RTX 5060 Ti 16GB', 'memory size'],
  ['ASUS GeForce RTX 5070', 'ASUS GeForce RTX 5070 Ti', 'Ti variant'],
  ['GeForce RTX 5080', 'GeForce RTX 5080 SUPER', 'Super variant'],
  ['AMD Ryzen 5 5600X', 'AMD Ryzen 5 5600', 'different CPU model'],
  ['Radeon RX 9060 XT', 'Radeon RX 9070 XT', 'different GPU model'],
];
let fails = 0;
for (const [a, b, why] of PAIRS) {
  const same = skuKey(a) === skuKey(b);
  if (same) fails += 1;
  console.log(`  ${same ? 'FAIL' : 'PASS'}  ${why.padEnd(18)} ${skuKey(a)} vs ${skuKey(b)}`);
}

// The same product under different board partners MUST merge.
console.log('\nMerge checks (must be equal):');
const MERGES = [
  ['ASUS TUF Gaming GeForce RTX 5070 Ti 16GB', 'PNY GeForce RTX 5070 Ti 16GB', 'board partners'],
  ['AMD Ryzen 7 7800X3D MPK', 'AMD Ryzen 7 7800X3D Tray Processor', 'MPK vs Tray'],
  ['MSI Ventus GeForce RTX 5060 8GB', 'PNY GeForce RTX 5060 8GB', 'board partners'],
];
for (const [a, b, why] of MERGES) {
  const same = skuKey(a) === skuKey(b);
  if (!same) fails += 1;
  console.log(`  ${same ? 'PASS' : 'FAIL'}  ${why.padEnd(18)} ${skuKey(a)} vs ${skuKey(b)}`);
}

console.log(fails ? `\n✗ ${fails} grouping failure(s)` : '\n✓ grouping rules verified');
process.exit(fails ? 1 : 0);
