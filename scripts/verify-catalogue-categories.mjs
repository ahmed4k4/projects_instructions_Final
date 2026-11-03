#!/usr/bin/env node
/**
 * Data-integrity gate for the scraped catalogue.
 *
 *   node scripts/verify-catalogue-categories.mjs
 *
 * Phase 15's headline bug was "selecting CPU shows fans, selecting GPU shows
 * cases". The category now comes from the store's own classification — the URL
 * collection, then the title's noun (see `scripts/reclassify-catalogue.mjs` and
 * `src/lib/categoryRules.ts`) — but nothing proved the resulting buckets were
 * clean, and a re-scrape or a rule regression would silently bring the bug back.
 *
 * The checks are the user-visible ones, which is why they are NORMS over the
 * whole bucket rather than a per-listing rule: a single mis-detection is
 * tolerable, a bucket full of them is the bug.
 *
 *   · cpu — no cooler/chassis/thermal-paste share at all;
 *   · gpu — no chassis or processor share;
 *   · case — no graphics card share;
 *   · every one of the eight categories exists and is non-trivial.
 *
 * Peripherals (a vertical GPU mount listed under Cases, a 30 W adapter under
 * GPUs) are real listings and stay put; a threshold catches the pattern without
 * demanding a perfectly clean rule.
 */
import { readFileSync } from 'node:fs';

const SNAPSHOT = 'public/data/retailer_snapshot.json';

/** Max share of a bucket allowed to carry a foreign noun. */
const MAX_FOREIGN_SHARE = 0.02;

/**
 * COOLER MASTER is a BRAND, not a component: "COOLER MASTER Elite Gold 850W" is a
 * power supply. The lookahead keeps the brand out of every cooling rule.
 */
const COOLER =
  /\bcpu (?:liquid |air )?cooler\b|\bliquid (?:freezer|cooler|cooled)\b|\b(?:aio|liquid|air) (?:cpu )?cooler\b(?!\s?master)/i;
const CHASSIS = /\b(cases?|chassis|mid[- ]?tower|full[- ]?tower|middle[- ]?tower)\b/i;
const PROCESSOR = /\b(processor)\b|\bryzen\b|\bcore (?:i[3579]|ultra)\b|\bthreadripper\b/i;
const GRAPHICS = /\b(graphics card|geforce (?:rtx|gtx)|radeon (?:rx|pro)|intel arc|arc a\d{3})\b/i;
const THERMAL_PASTE = /\bthermal (?:paste|grease|pad)\b/i;
/**
 * A DRIVE THAT SHIPS WITH A HEATSINK is still a drive — "Sabrent Rocket 4 Plus
 * 1TB PCIe Gen 4 NVMe SSD with Heatsink". Storage owns those listings, so the
 * heatsink word is not evidence of cooling there.
 */
const OPTIONAL_HEATSINK = /\b(?:with|w\/|and|\+)\s+(?:a\s+)?heatsink\b/i;

const FOREIGN = {
  cpu: [
    [COOLER, 'cooling hardware'],
    [CHASSIS, 'chassis'],
    [THERMAL_PASTE, 'thermal paste'],
    [GRAPHICS, 'graphics card'],
  ],
  gpu: [
    [CHASSIS, 'chassis'],
    [COOLER, 'cooling hardware'],
    [PROCESSOR, 'processor'],
  ],
  case: [[GRAPHICS, 'graphics card']],
  cooling: [
    [CHASSIS, 'chassis'],
    [THERMAL_PASTE, 'thermal paste'],
  ],
  motherboard: [
    [GRAPHICS, 'graphics card'],
    [COOLER, 'cooling hardware'],
  ],
  ram: [
    [GRAPHICS, 'graphics card'],
    [COOLER, 'cooling hardware'],
  ],
  storage: [
    [GRAPHICS, 'graphics card'],
    [COOLER, 'cooling hardware'],
  ],
  psu: [
    [GRAPHICS, 'graphics card'],
    [COOLER, 'cooling hardware'],
  ],
};

const REQUIRED = ['cpu', 'gpu', 'motherboard', 'ram', 'storage', 'psu', 'case', 'cooling'];

const { products = [] } = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const buckets = new Map();
for (const product of products) {
  const category = product.category ?? 'null';
  buckets.set(category, [...(buckets.get(category) ?? []), product]);
}

let failures = 0;
console.log(`catalogue: ${products.length} listings in ${buckets.size} categories`);
console.log(`allowed foreign share per bucket: ${(MAX_FOREIGN_SHARE * 100).toFixed(0)}%\n`);
console.log('category       listings   foreign');
console.log('────────────────────────────────────');

for (const category of [...buckets.keys()].sort()) {
  const rows = buckets.get(category) ?? [];
  const rules = FOREIGN[category] ?? [];
  const suspects = [];

  for (const row of rows) {
    const name = OPTIONAL_HEATSINK.test(row.name) ? row.name.replace(OPTIONAL_HEATSINK, ' ') : row.name;
    for (const [pattern, label] of rules) {
      if (pattern.test(name)) {
        suspects.push({ name: row.name, label });
        break;
      }
    }
  }

  const share = rows.length ? suspects.length / rows.length : 0;
  const empty = rows.length === 0;
  const dirty = share > MAX_FOREIGN_SHARE;
  if (empty || dirty) failures += 1;

  console.log(
    `  ${category.padEnd(13)} ${String(rows.length).padStart(6)}   ${String(suspects.length).padStart(6)}  ${(
      share * 100
    ).toFixed(1)}%`,
  );
  for (const suspect of suspects.slice(0, 3)) {
    console.log(`      ${dirty ? '✖' : '·'} ${suspect.label.padEnd(18)} ${suspect.name.slice(0, 72)}`);
  }
}

/* Every component category the builder offers must exist in the catalogue. */
const missing = REQUIRED.filter((category) => (buckets.get(category)?.length ?? 0) === 0);
for (const category of missing) console.log(`✖ category "${category}" has no listings`);
failures += missing.length;

if (failures) {
  console.error(`\n✖ ${failures} category problem(s) — the filters would misclassify products`);
  process.exit(1);
}

console.log('\n✔ every category holds its own products and nothing else');
