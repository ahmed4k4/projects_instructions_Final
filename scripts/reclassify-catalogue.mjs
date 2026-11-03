#!/usr/bin/env node
/**
 * Rebuild the category buckets from what each listing IS.
 *
 *   node scripts/reclassify-catalogue.mjs            # rewrite the snapshot
 *   node scripts/reclassify-catalogue.mjs --dry-run  # report only
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The scrapers filed rows with a keyword classifier over the product NAME. A
 * cooler called "Corsair iCUE H100i Elite CPU Liquid Cooler" contains "CPU", so
 * it landed in the CPU bucket; a chassis that advertises its GPU clearance
 * landed in GPUs. Selecting CPU showed fans, selecting GPU showed cases.
 *
 * ── Signals, strongest first ────────────────────────────────────────────────
 *   1. The listing URL's COLLECTION — the store's own classification
 *      (`/product-category/processor/`, `/graphics-card/…`, `/vga`).
 *   2. The product title — every Egyptian retailer puts the category in it
 *      ("… Mid Tower Case", "… CPU Air Cooler", "… Desktop Processor").
 *   3. The listing page the row was crawled from (`specs.pageCategory`).
 *
 * The old `category` field is never used as input: it is the keyword
 * classifier's answer, and keeping it would keep its mistakes.
 *
 * Each candidate is checked against a post-condition — the rule that actually
 * matters to a user: "does the CPU filter show fans?". If the URL, the title and
 * the page disagree, the title wins when the title is not the thing that would
 * violate that post-condition. The script prints every change with the source
 * that decided it, so the outcome is reviewable rather than mysterious.
 *
 * The same rules ship in `src/lib/categoryRules.ts`, applied at read time, so a
 * stale snapshot or a database row written by the old scraper is corrected
 * before it reaches a filter.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SNAPSHOT_PATH = 'public/data/retailer_snapshot.json';
const BOOTSTRAP_PATH = 'src/services/retailers/bootstrap.json';
const dryRun = process.argv.includes('--dry-run');

const GRAPHICS_CARD = /\b(graphics card|geforce (?:rtx|gtx)|radeon (?:rx|pro)|intel arc|arc a\d{3})\b/i;
const PROCESSOR = /\bprocessor\b|\bryzen\b|\bthreadripper\b|\bcore (?:i[3579]|ultra)\b/i;
const COOLER =
  /\bcpu (?:liquid |air )?cooler\b|\bliquid (?:freezer|cooler|cooled)\b|\b(?:aio|liquid|air) (?:cpu )?cooler\b/i;
const CHASSIS =
  /\b(cases?|chassis|mid[- ]?tower|full[- ]?tower|mini[- ]?tower)\b|\bpc case\b|\bMMA\b|\b(?:e[- ]?atx|mini[- ]?itx|micro[- ]?atx|EATX)\b[^,]{0,48}?\b(?:chassis|case|tower)\b|\b\d+(?:\.\d+)?\s?L\b[^,]*\b(?:case|chassis)\b/i;

/**
 * Path rules, ordered. Anchored on separators so a BRAND word cannot win:
 * "cooler-master-…" is a chassis when `/cases/` matches, not a cooler.
 */
const PATH_RULES = [
  [
    /(?:^|\/)chassis(?:\/|$)|(?:^|\/)pc[-_]?cases?(?:\/|$)|(?:^|\/)cases?(?:\/|$)/,
    'case',
  ],
  [
    /cpu[-_]?coolers?(?:\/|$)|(?:^|\/)cooling(?:\/|$)|(?:^|\/)coolers?(?:\/|$)|water[-_]?cooling|liquid[-_]?cool(?:ing)?|(?:^|\/)aio(?:\/|$)|(?:^|\/)fans?(?:\/|$)|fans[-_]?coolers(?:\/|$)|heatsinks?(?:\/|$)|air[-_]?cooling/,
    'cooling',
  ],
  [
    /(?:^|\/)graphics?[-_]?cards?(?:\/|$)|(?:^|\/)graphics?(?:\/|$)|(?:^|\/)vga(?:\/|$)|(?:^|\/)gpus?(?:\/|$)|video[-_]?cards?(?:\/|$)/,
    'gpu',
  ],
  [
    /(?:^|\/)processors?(?:\/|$)|(?:^|\/)cpus?(?:\/|$)|cpu[-_]?processor(?:\/|$)|microprocessor(?:\/|$)/,
    'cpu',
  ],
  [/(?:^|\/)motherboards?(?:\/|$)|mainboards?(?:\/|$)/, 'motherboard'],
  [/(?:^|\/)ram(?:\/|$)|desktop[-_]?memory(?:\/|$)|(?:^|\/)memory(?:\/|$)/, 'ram'],
  [
    /(?:^|\/)storage(?:\/|$)|(?:^|\/)ssds?(?:\/|$)|(?:^|\/)hdd(?:\/|$)|hard[-_]?drives?(?:\/|$)|(?:^|\/)nvme(?:\/|$)/,
    'storage',
  ],
  [/power[-_]?suppl(?:y|ies)(?:\/|$)|(?:^|\/)psus?(?:\/|$)/, 'psu'],
];

/**
 * Noun rules for the title, ordered by specificity.
 *
 * Measured on the live catalogue:
 *   · CPU before GPU — "AMD Ryzen 5 3400G … with Radeon RX Vega 11 Graphics"
 *     is a processor that mentions a Radeon.
 *   · STORAGE before cooling — "WD_BLACK SN850X 2TB with Heatsink" is a drive.
 *   · GPU before cooling — "RTX 5090 LIGHTNING Z Liquid Cooled GPU" is a card.
 *   · CASE before cooling — a chassis is described by its cooling.
 *   · "SSD" alone is NOT a rule: "Blue Yeti SSD" does not exist, but "SSD
 *     heatsink" does, and the generic storage words are enough.
 */
const NAME_RULES = [
  [CHASSIS, 'case'],
  // Cooling before the chipset check: an AIO or heatsink names itself.
  [
    /\b(cpu )?(air |liquid )?cooler\b|\bheatsink\b|\bheatpipe\b|\bdual tower\b|\bsingle tower\b|\d+\s?mm (?:pwm |rgb |argb )?fan\b|\brgb fan\b/i,
    'cooling',
  ],
  [/\b(nvme|solid state drive|hard drive|hdd)\b/i, 'storage'],
  [PROCESSOR, 'cpu'],
  [GRAPHICS_CARD, 'gpu'],
  [COOLER, 'cooling'],
  [
    /\bmainboards?\b|\bmotherboards?\b|\b(?:socket|chipset)\s+(?:am[45]|lga\s?\d{3,4})\b/i,
    'motherboard',
  ],
  [
    /\b(?:micro[- ]?atx|mini[- ]?itx|e[- ]?atx|mATX)\b|\bLGA\s?\d{3,4}\b/i,
    'motherboard',
  ],
  [/\b(thermal paste|thermal grease|thermal pad)\b/i, 'cooling'],
  [/\b(power supply|psu)\b|\b80 ?plus\b|\b\d{3,4}\s?w\b[^,]*\bmodular\b/i, 'psu'],
  [/\bddr[345]\b/i, 'ram'],
];

/**
 * The post-condition, in code: what a bucket must NO LONGER contain once a
 * listing is filed into it. A candidate that breaks its own bucket is rejected
 * in favour of the next signal.
 */
const FORBIDDEN_IN = {
  cpu: [COOLER, CHASSIS],
  gpu: [CHASSIS, /\b(processor)\b|\bryzen\b|\bcore (?:i[3579]|ultra)\b/i],
  case: [GRAPHICS_CARD, /\bprocessor\b|\bryzen\b/i],
  cooling: [GRAPHICS_CARD, CHASSIS],
};

function violates(category, name) {
  return (FORBIDDEN_IN[category] ?? []).some((pattern) => pattern.test(name));
}

/**
 * Accessories are not components.
 *
 * Mirrors `ACCESSORY` in src/lib/categoryRules.ts. Without it the snapshot kept
 * an "ID-COOLING ABF-1851 Anti Bending Frame … Cpu Bracket" because "1851"
 * matched the LGA1851 socket pattern and "CPU" matched the processor rule — a
 * mounting frame then appeared under Motherboards.
 */
const ACCESSORY =
  /\b(holder|anti-?bend(?:ing)?|bend(?:ing)? frame|contact frame|riser cable|support bracket|vertical (?:gpu )?(?:mount|holder|bracket)|mounting kit|thermal (?:pad|paste|grease)|cleaning kit|screwdriver|thumb screws?)\b/i;

/** Category named by the collection part of a listing URL ('' when none). */
export function categoryFromUrl(url) {
  if (!url) return '';
  let pathname = String(url);
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = String(url).split('?')[0] ?? '';
  }

  const segments = pathname.toLowerCase().split('/').filter(Boolean);
  if (segments.length === 0) return '';

  const collectionAt = segments.findIndex((segment) => /^product-category$/.test(segment));
  if (collectionAt >= 0) {
    const slug = segments[collectionAt + 1] ?? '';
    for (const [pattern, category] of PATH_RULES) {
      if (pattern.test(`/${slug}/`)) return category;
    }
    return '';
  }

  const productAt = segments.findIndex((segment) => /^(product|products|item|items)$/.test(segment));
  for (let index = 0; index < segments.length; index += 1) {
    if (segments.length > 1 && index === segments.length - 1) break; // the slug
    if (productAt >= 0 && index > productAt) break;
    const segment = segments[index];
    for (const [pattern, category] of PATH_RULES) {
      if (pattern.test(`/${segment}/`)) return category;
    }
  }
  return '';
}

/**
 * Category named by a product title ('' when the name says nothing usable).
 *
 * The FIRST named noun decides. Measured against the live catalogue, that is the
 * product itself:
 *
 *   "Tortox Zion ATX/ITX Gaming PC Case – Includes 350W Power Supply"  → case
 *   "AMD Ryzen 5 5600X Tray Processor … No Cooler"                     → cpu
 *   "Kingston FURY Beast 32GB (2x16GB) DDR5 6000MT/s CL30"             → ram
 *   "ANTEC GSK850 ATX3.1 850W Full Modular PSU, 80 Plus Gold"          → psu
 *
 * Rule order only matches at the SAME position. "Mainboards" is matched
 * separately and earlier because the plural is a typo — "Gigabyte
 * B850M Mainboards" — that the singular `\b` cannot see.
 */
export function categoryFromName(name) {
  const text = String(name ?? '').trim();
  if (!text) return '';

  if (/\bmainboards?\b/i.test(text) && !CHASSIS.test(text)) return 'motherboard';

  /**
   * CHIPSETS BEFORE CPUs, by an explicit rule rather than by match position.
   *
   * A board is named by the CPU it supports — "GIGABYTE Z890 AORUS Master Intel
   * Core Ultra (Series 2) LGA 1851 Motherboard" — so the position-based match
   * below picked `cpu` from the marketing copy and three boards were filed as
   * processors. A chipset (letter set + three digits + optional suffix) is
   * unambiguous, so it is tested first.
   */
  if (
    /\b(?:x870|b850|x670|b650|a620|x570|b550|a520|z890|b860|h810|z790|b760|h770|h710|z690|b660|h610|wrx80|trx40|x399|b840)[a-z]{0,2}\b/i.test(
      text,
    ) &&
    !CHASSIS.test(text) &&
    // A cooler's model number is not a chipset: "FROZN A620 PRO" is a heatsink.
    !/\b(cooler|heatsink|heatpipe|fan)\b/i.test(text)
  ) {
    return 'motherboard';
  }

  let best = { index: Number.POSITIVE_INFINITY, category: '' };
  for (const [pattern, category] of NAME_RULES) {
    const match = pattern.exec(text);
    if (!match) continue;
    const index = match.index;
    // Strict `<`: an earlier rule wins a tie, which is the documented order.
    if (index < best.index) best = { index, category };
  }
  return best.category;
}

/**
 * The best answer plus where it came from.
 *
 * A candidate is accepted only when it survives its own post-condition, which is
 * what stops "… Mid-Tower PC Case" from being filed as storage because the case
 * ships with a 350 W power supply, and stops a Ryzen with an iGPU from becoming
 * a graphics card.
 */
export function categoryForProduct(product) {
  const name = product.name ?? '';
  const page = typeof product.specs?.pageCategory === 'string' ? product.specs.pageCategory : '';

  // A mounting frame or thermal paste is not a component at all.
  if (ACCESSORY.test(name)) return { category: '', source: 'accessory' };

  /**
   * The stored `category` is NOT a candidate.
   *
   * It is the output of an earlier run of this same classifier, so feeding it
   * back makes every fix unreachable: a board filed as RAM stays RAM forever
   * because its stored category says "ram". Candidates are derived fresh from
   * the title, the page and the URL only.
   */
  const candidates = [
    { category: categoryFromName(name), source: 'name' },
    { category: page, source: 'page' },
    { category: categoryFromUrl(product.productUrl ?? product.product_url), source: 'url' },
  ];

  for (const candidate of candidates) {
    if (candidate.category && !violates(candidate.category, name)) return candidate;
  }

  return { category: '', source: '' };
}

/* -------------------------------------------------------------------------- */

const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
const products = (snapshot.products ?? []).filter((product) => !ACCESSORY.test(product.name ?? ''));
const droppedAccessories = (snapshot.products ?? []).length - products.length;
const counts = { before: {}, after: {}, changes: [], unknown: [] };

for (const product of products) {
  const before = product.category ?? 'null';
  counts.before[before] = (counts.before[before] ?? 0) + 1;

  const { category: target, source } = categoryForProduct(product);

  if (!target) {
    counts.unknown.push(product.name);
    if (source === 'accessory') {
      /**
       * An accessory is REMOVED, not left in its old bucket.
       *
       * Keeping it "in place" is how the anti-bend frame survived on
       * Motherboards: the row was written before this rule existed and nothing
       * ever moved it out. Dropping it is the honest outcome — it is not a PC
       * component, and the catalogue is eight component categories.
       */
      counts.removed = (counts.removed ?? 0) + 1;
      continue;
    }
    counts.after[before] = (counts.after[before] ?? 0) + 1;
    continue;
  }

  product.specs = { ...(product.specs ?? {}), categorySource: source };

  if (target !== before) {
    counts.changes.push({ name: product.name, before, after: target, source });
    product.category = target;
  }
  counts.after[product.category] = (counts.after[product.category] ?? 0) + 1;
}

const changed = counts.changes.length;
console.log(
  `catalogue: ${products.length} listings · ${changed} re-categorised · ${droppedAccessories} accessories dropped\n`,
);
console.log('category      before   after');
for (const category of Object.keys(counts.after).sort()) {
  console.log(
    `  ${category.padEnd(12)} ${String(counts.before[category] ?? 0).padStart(6)}  ${String(
      counts.after[category] ?? 0,
    ).padStart(6)}`,
  );
}

const bySource = {};
for (const change of counts.changes) bySource[change.source] = (bySource[change.source] ?? 0) + 1;
console.log(
  `\ndecided by: ${
    Object.entries(bySource)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ') || 'nothing'
  }`,
);

if (changed) {
  console.log('\nre-classified (first 20):');
  for (const change of counts.changes.slice(0, 20)) {
    console.log(
      `  ${change.before.padEnd(12)} → ${change.after.padEnd(12)} ${change.source.padEnd(5)} ${change.name.slice(0, 62)}`,
    );
  }
}

if (dryRun) {
  console.log('\n~ dry run: snapshot not written');
  process.exit(0);
}

writeFileSync(SNAPSHOT_PATH, `${JSON.stringify({ ...snapshot, products }, null, 2)}\n`, 'utf8');

/* The bundled first-paint subset is rebuilt from the same rows. */
const buckets = new Map();
for (const product of products) {
  const key = `${product.retailerId}:${product.category}`;
  buckets.set(key, [...(buckets.get(key) ?? []), product]);
}
const bootstrap = [...buckets.values()].flatMap((rows) => rows.slice(0, 2));
writeFileSync(
  BOOTSTRAP_PATH,
  `${JSON.stringify(
    {
      capturedAt: snapshot.capturedAt,
      source: 'bootstrap subset of retailer_snapshot.json',
      retailers: [...new Set(bootstrap.map((p) => p.retailerId))].sort(),
      products: bootstrap,
    },
    null,
    1,
  )}\n`,
  'utf8',
);

console.log(`\n${products.length} products → ${SNAPSHOT_PATH}`);
console.log(`${bootstrap.length} products → ${BOOTSTRAP_PATH} (first paint)`);
