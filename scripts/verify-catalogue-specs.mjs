#!/usr/bin/env node
/**
 * Prove the catalogue can actually be built from.
 *
 *   node scripts/verify-catalogue-specs.mjs
 *
 * Module 2 exists so the Builder can use real Egyptian listings instead of a
 * hand-written sample set. That only works if the scraped rows carry the specs
 * `lib/compatibility/engine.ts` compares — and "carry" means a value for the
 * SPECIFIC model, not for the category.
 *
 * Checks, per category:
 *
 *   1. COVERAGE — at least 50 % of listings expose the key spec the rules read
 *      (socket for CPUs, length for GPUs, …). Below that the compatibility
 *      engine skips its own rules (it treats a missing value as "not checked"),
 *      so the builder would silently claim every combination is fine.
 *   2. CONSISTENCY — no wrong value: an AM5 CPU is never DDR4, a 16 GB RTX 5070
 *      Ti is never 8 GB, a "5070" is never 300 W.
 *   3. PRICE SANITY — a listing priced at 1 EGP is a store placeholder and must
 *      not be quotable, which is what `priceIsPlaceholder` is for.
 */
import { readFileSync } from 'node:fs';

/**
 * The app's own inference, so this gate can never drift from what the Builder
 * serves.
 *
 * Loaded through the SAME resolver hook every other TypeScript gate uses
 * (`scripts/lib/esm-ts-resolve.mjs`). A bare `import('…/specInference.ts')`
 * loads the module but returns `{}` for every input in this position — it
 * reported 55 % motherboard coverage while the identical rules, run by the
 * enrichment script, reached 95 %. The probe below makes that failure mode
 * impossible to miss.
 */
import { register } from 'node:module';

register(new URL('./lib/esm-ts-resolve.mjs', import.meta.url).href, import.meta.url);

let inferSpecs;
try {
  ({ inferSpecs } = await import('../src/lib/specInference.ts'));
} catch (error) {
  console.error('✖ could not load src/lib/specInference.ts:', error.message.split('\n')[0]);
  console.error('  This gate needs Node with native TypeScript stripping (>= 22.6).');
  process.exit(1);
}
if (typeof inferSpecs !== 'function') {
  console.error('✖ src/lib/specInference.ts did not export inferSpecs');
  process.exit(1);
}

// A module that loads but classifies nothing would pass every coverage check at
// 0 % and be indistinguishable from a catalogue problem.
if (inferSpecs({ name: 'AMD Ryzen 7 8700G', category: 'cpu' })?.socket !== 'AM5') {
  console.error('✖ src/lib/specInference.ts loaded but did not classify a known CPU');
  process.exit(1);
}

const SNAPSHOT = 'public/data/retailer_snapshot.json';

/**
 * Minimum share of a category that must carry the rule's key spec.
 *
 * Measured AFTER read-time inference, because that is what the app serves: the
 * snapshot's stored `specs` were written by the last enrich run, while
 * `lib/retailerCatalogue` merges `inferSpecs()` over them for every listing at
 * load. Checking the raw file measured the staleness of a JSON blob, not what a
 * shopper sees.
 */
const MIN_COVERAGE = 0.5;

const REQUIRED_SPEC = {
  cpu: 'socket',
  gpu: 'length',
  motherboard: 'socket',
  ram: 'type',
  storage: 'capacity',
  psu: 'wattage',
  case: 'maxGpuLength',
  cooling: 'socketSupport',
};

const { products = [] } = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

/**
 * The specs a listing will have in the browser: stored values, then inference.
 *
 * `inferSpecs` is imported from the app's own module — not copied — so this
 * check can never drift from what `lib/retailerCatalogue` actually serves. Node
 * resolves the `.ts` file through native type stripping (Node 22.6+), which is
 * how every other gate in this repo reads TypeScript.
 */
function specsFor(product) {
  // `inferSpecs` takes ONE object. Called positionally — `inferSpecs(name,
  // category)` — it reads `input.name`/`input.category` off a string and returns
  // `{}` for every listing, which is why this gate reported 55 % motherboard
  // coverage while the same rules reached 95 %.
  const inferred = inferSpecs({ name: product.name ?? '', category: product.category ?? '' });
  return { ...(product.specs ?? {}), ...inferred };
}

const buckets = new Map();
for (const product of products) {
  const category = product.category ?? 'null';
  buckets.set(category, [...(buckets.get(category) ?? []), product]);
}

let failures = 0;
const failuresList = [];

console.log(`catalogue: ${products.length} listings\n`);
console.log('category       spec               covered');
console.log('──────────────────────────────────────────');

for (const [category, key] of Object.entries(REQUIRED_SPEC)) {
  const rows = buckets.get(category) ?? [];
  const covered = rows.filter((row) => {
    const value = specsFor(row)[key];
    return value !== undefined && value !== null && value !== '';
  }).length;

  const share = rows.length ? covered / rows.length : 0;
  const ok = share >= MIN_COVERAGE;
  if (!ok) {
    failures += 1;
    failuresList.push(`${category}: only ${(share * 100).toFixed(0)}% have "${key}"`);
  }
  console.log(
    `  ${category.padEnd(13)} ${key.padEnd(17)} ${String(covered).padStart(5)}/${String(rows.length).padEnd(5)} ${(
      share * 100
    ).toFixed(0)}%`,
  );
}

/* ── Consistency: a wrong number is worse than a missing one ──────────────── */

function check(label, rows, predicate) {
  const bad = rows.filter((row) => !predicate(row));
  if (bad.length) {
    failures += 1;
    failuresList.push(`${label}: ${bad.length} (e.g. "${bad[0].name.slice(0, 60)}")`);
  }
}

const cpus = buckets.get('cpu') ?? [];
check(
  'AM5 CPUs must be DDR5',
  cpus.filter((row) => row.specs?.socket === 'AM5'),
  (row) => row.specs?.ramType === 'DDR5',
);
check(
  'AM4 CPUs must be DDR4',
  cpus.filter((row) => row.specs?.socket === 'AM4'),
  (row) => row.specs?.ramType === 'DDR4',
);

const gpus = buckets.get('gpu') ?? [];
check(
  'a 5070 Ti is 16 GB / 300 W',
  gpus.filter((row) => /5070\s?ti/i.test(row.name)),
  (row) => row.specs?.vram === 16 && row.specs?.tdp === 300,
);
check(
  'a 5070 (non-Ti) is 250 W',
  gpus.filter((row) => /5070(?!\s?ti)/i.test(row.name)),
  (row) => row.specs?.tdp === 250,
);
check(
  'GPU lengths are plausible',
  gpus.filter((row) => typeof row.specs?.length === 'number'),
  (row) => row.specs.length >= 170 && row.specs.length <= 400,
);

const boards = buckets.get('motherboard') ?? [];
check(
  'LGA1700 boards carry DDR4 or DDR5',
  boards.filter((row) => row.specs?.socket === 'LGA1700'),
  (row) => row.specs?.ramType === 'DDR4' || row.specs?.ramType === 'DDR5',
);

const psus = buckets.get('psu') ?? [];
check(
  'PSU wattages are in range',
  psus.filter((row) => typeof row.specs?.wattage === 'number'),
  (row) => row.specs.wattage >= 250 && row.specs.wattage <= 2000,
);

/* ── Placeholder prices must never be quotable ────────────────────────────── */

const placeholderWithoutFlag = products.filter(
  (row) => typeof row.priceEgp === 'number' && row.priceEgp <= 100 && row.priceIsPlaceholder !== true,
);
if (placeholderWithoutFlag.length) {
  failures += 1;
  failuresList.push(
    `${placeholderWithoutFlag.length} listing(s) priced ≤ 100 EGP without the placeholder flag`,
  );
}

if (failures) {
  console.error('\n✖ catalogue cannot support the builder:');
  for (const line of failuresList) console.error(`   · ${line}`);
  process.exit(1);
}

console.log('\n✔ every category carries the specs the compatibility engine reads');
