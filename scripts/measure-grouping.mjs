#!/usr/bin/env node
/**
 * How good is product grouping, on the REAL catalogue?
 *
 *   node scripts/measure-grouping.mjs
 *
 * `/search` and the Builder both present "one card per product", produced by
 * `groupListings` (services/searchService) with `skuKey` (lib/skuGrouping). Two
 * failure modes matter, and they pull in opposite directions:
 *
 *   · UNDER-grouping — the same card at two shops shows twice, so the price
 *     comparison never happens. Measured as CROSS-STORE GROUPS: groups holding
 *     offers from two or more retailers.
 *   · OVER-grouping — two different SKUs merge, so one product's price appears
 *     under another product's name. Measured as groups whose members disagree on
 *     model number or VRAM (an 8 GB card next to a 16 GB one).
 *
 * A number here, not an opinion, is what decides whether a change to the key
 * helped. Run it before and after touching `skuKey`.
 */
import { readFileSync } from 'node:fs';

const SNAPSHOT = 'public/data/retailer_snapshot.json';

/** ── The same canonical key the app uses (lib/skuGrouping.ts) ────────────── */

const VARIANT_WORDS = ['ti', 'super', 'xtx', 'xt', 'x3d', 'kf', 'ks', 'k', 'f', 'g', 'x'];

const normalise = (name) =>
  ` ${String(name)
    .toLowerCase()
    .replace(/[^a-z0-9.+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

function skuKey(name) {
  const n = normalise(name);
  const memory = /\b(\d{1,2}) ?g(?:b)?\b/.exec(n)?.[1] ?? '';

  if (/\bryzen\b/.test(n)) {
    const model = /\bryzen\s+[3579]\s+(\d{4}[a-z0-9]*)\b/.exec(n)?.[1];
    return model ? `ryzen|${model}` : null;
  }
  if (/\bcore ultra\b/.test(n)) {
    const model = /\bcore ultra\s+[3579]\s+(\d{3}[a-z0-9]*)\b/.exec(n)?.[1];
    return model ? `core-ultra|${model}` : null;
  }
  if (/\bcore i[3579]\b/.test(n)) {
    const model = /\bcore i[3579][- ](\d{4,5}[a-z]*)\b/.exec(n)?.[1];
    return model ? `core|${model}` : null;
  }

  const family = /\bgeforce\b|\brtx\b|\bgtx\b/.test(n)
    ? 'geforce'
    : /\bradeon\b|\brx\b/.test(n)
      ? 'radeon'
      : null;
  if (family) {
    const model =
      new RegExp(`\\b${family}\\s+(?:rtx|rx)?\\s*(\\d{3,4})\\b`).exec(n)?.[1] ??
      /\b(?:rtx|gtx)\s*(\d{3,4})\b/.exec(n)?.[1] ??
      /\brx\s*(\d{4})\b/.exec(n)?.[1];
    if (!model) return null;
    const tail = n.slice(n.indexOf(model)).slice(0, 24);
    const variant = VARIANT_WORDS.filter((v) => new RegExp(`\\b${v}\\b`).test(tail));
    return [family, model, ...variant, memory].filter(Boolean).join('|');
  }

  if (/\b(motherboard|mainboard|atx|matx|itx)\b/.test(n) || /\bx?[bza]\d{3}[a-z]*\b/.test(n)) {
    // A chipset + suffix is the model; "lga1700" is the socket every board shares.
    const board =
      /\b([xbza]\d{3}[a-z]{0,3}(?:[-\s][a-z0-9]{1,4})?)\b/.exec(n)?.[1] ??
      /\b([a-z]{2,5}\d{3}[a-z0-9]{0,6})\b/.exec(n)?.[1];
    if (!board || /^(lga\d{3,4}|am[45]|intel|amd|nvidia|geforce|radeon|ddr[45])$/.test(board)) return null;
    const brand = /\b(asus|msi|gigabyte|asrock|biostar|evga|nzxt|aorus)\b/.exec(n)?.[1] ?? 'generic';
    const family =
      /\b(rog strix|rog crosshair|rog maximus|tuf gaming|prime|proart|aorus|aero|master|elite|tomahawk|mag|mpg)\b/.exec(
        n,
      )?.[1];
    return ['mb', brand, board, family].filter(Boolean).join('|');
  }

  const generic = /\b([a-z]{0,3}\d{3,4}[a-z0-9]*)\b/.exec(n)?.[1];
  if (generic) return memory ? `${generic}|${memory}` : generic;
  return null;
}

const BRANDS = [
  'asus',
  'msi',
  'gigabyte',
  'aorus',
  'zotac',
  'palit',
  'pny',
  'gainward',
  'inno3d',
  'sapphire',
  'powercolor',
  'xfx',
  'asrock',
  'evga',
  'galax',
  'colorful',
  'biostar',
  'sparkle',
  'manli',
  'maxsun',
  'yeston',
  'leadtek',
  'gunnir',
  'nvidia',
  'amd',
  'intel',
  'lian li',
  'nzxt',
  'fractal design',
  'cooler master',
  'deepcool',
  'thermaltake',
  'be quiet',
  'noctua',
  'arctic',
  'id-cooling',
  'phanteks',
  'antec',
  'montech',
  'silverstone',
  'seasonic',
  'corsair',
  'kingston',
  'crucial',
  'samsung',
  'western digital',
  'seagate',
  'sandisk',
  'lexar',
  'adata',
  'teamgroup',
  'g.skill',
];
const brandOf = (name) => {
  const n = normalise(name);
  return BRANDS.find((brand) => n.includes(brand)) ?? 'unknown';
};

/* ── Group exactly as the app does ───────────────────────────────────────── */

const { products = [] } = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

const buckets = new Map();
for (const product of products) {
  const key = skuKey(product.name);
  if (!key) {
    buckets.set(`listing:${product.retailerId}:${product.productUrl}`, [product]);
    continue;
  }
  const brand = brandOf(product.name);
  const base = `sku:${product.category ?? 'misc'}:${brand}:${key}`;
  const bucket = buckets.get(base) ?? [];
  buckets.set(base, [...bucket, product]);
}

const groups = [...buckets.values()];
const crossStore = groups.filter((offers) => new Set(offers.map((o) => o.retailerId)).size > 1);
const ungrouped = groups.filter(
  (offers) => offers.length === 1 && offers[0] && skuKey(offers[0].name) === null,
);

/** Model number per listing, to detect an over-merged group. */
const modelOf = (name) => /\b(rtx|gtx|rx)\s?(\d{3,4})/i.exec(name)?.slice(1).join('') ?? null;
const vramOf = (name) => /\b(\d{1,2})\s?gb\b/i.exec(name)?.[1] ?? null;

/**
 * Chipset+code for a motherboard: "PRIME B650M-K" and "PRIME B650M-K Micro-ATX
 * Motherboard – …" describe the SAME board and must not be reported.
 */
const boardCodeOf = (name) =>
  /\b([xbza]\d{3}[a-z]{0,3}(?:-?[a-z0-9]{1,4})?)\b/i.exec(name)?.[1]?.toUpperCase() ?? null;

const suspicious = crossStore.filter((offers) => {
  const models = new Set(offers.map((o) => modelOf(o.name)).filter(Boolean));
  const vrams = new Set(offers.map((o) => vramOf(o.name)).filter(Boolean));
  const boards = new Set(offers.map((o) => boardCodeOf(o.name)).filter(Boolean));
  return models.size > 1 || vrams.size > 1 || boards.size > 1;
});

console.log(`listings:            ${products.length}`);
console.log(`groups:              ${groups.length}`);
console.log(
  `cross-store groups:  ${crossStore.length}  (${((crossStore.length / groups.length) * 100).toFixed(1)}%)`,
);
console.log(`ungrouped listings:  ${ungrouped.length}`);
console.log(`suspicious merges:   ${suspicious.length}\n`);

if (suspicious.length) {
  console.log('merged groups whose members disagree on model or VRAM:');
  for (const offers of suspicious.slice(0, 10)) {
    console.log(`  ${offers.length} listings`);
    for (const offer of offers.slice(0, 4)) console.log(`    · ${offer.name.slice(0, 84)}`);
  }
}

if (crossStore.length) {
  console.log('\nlargest cross-store groups:');
  for (const offers of [...crossStore].sort((a, b) => b.length - a.length).slice(0, 8)) {
    const shops = new Set(offers.map((o) => o.retailerId));
    console.log(`  ${shops.size} stores · ${offers.length} listings · ${offers[0].name.slice(0, 70)}`);
  }
}
