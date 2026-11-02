/**
 * Matcher regression cases.
 *
 *   node scripts/verify-matching-rules.mjs
 *
 * Every case here was a real bug found against live Egyptian listings. The
 * matcher decides whether a retailer price is attached to a catalogue part, so a
 * wrong match publishes a wrong price — it is the highest-risk logic in Phase 7.
 *
 * Mirrors `scoreNameMatch` in src/lib/retailerParsing.ts.
 */
const STOPWORDS = new Set([
  'the',
  'and',
  'with',
  'for',
  'gaming',
  'edition',
  'new',
  'original',
  'lhr',
  'graphics',
  'card',
  'processor',
  'tray',
  'box',
  'retail',
  'gt',
  'series',
  'super',
  'ti',
  'xt',
  'xtx',
  'oc',
  'mb',
  'gb',
  'khz',
  'mhz',
  'core',
  'thread',
  'threads',
  'desktop',
  'unlocked',
  'mpk',
  'ddr4',
  'ddr5',
  'ddr6',
  'gddr6',
  'gddr7',
  'rgb',
  'argb',
  'white',
  'black',
  'fan',
  'fans',
]);

const tokenise = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));

const models = (name) => tokenise(name).filter((t) => /\d/.test(t));

function scoreNameMatch(productName, catalogueName) {
  const productTokens = new Set(tokenise(productName));
  const catalogueTokens = tokenise(catalogueName);
  if (!catalogueTokens.length) return 0;

  let covered = 0;
  for (const token of catalogueTokens) if (productTokens.has(token)) covered += 1;
  const coverage = covered / catalogueTokens.length;

  const catalogueModels = models(catalogueName);
  const productModels = new Set(models(productName));

  const modelMatch = catalogueModels.every((m) => productModels.has(m));
  const variant = catalogueModels.some((m) => [...productModels].some((p) => p !== m && p.startsWith(m)));

  return modelMatch && !variant ? coverage : coverage * 0.3;
}

const CASES = [
  // [scraped name, catalogue name, should match, note]
  ['AMD Ryzen 7 7800X3D MPK — 8-Core, 16-Thread 4.2 GHz', 'AMD Ryzen 7 7800X3D', true, 'real listing'],
  ['AMD Ryzen 5 7600X MPK 6-Core 12-Thread Desktop Processor', 'AMD Ryzen 5 7600X', true, 'real listing'],
  ['Intel Core i9-14900K 24-Core LGA1700', 'Intel Core i9-14900K', true, 'real listing'],
  ['ASUS Dual GeForce RTX 4090 OC Edition 24GB', 'NVIDIA GeForce RTX 4090', true, 'board partner'],
  ['AMD Ryzen 7 7800X3D', 'AMD Radeon RX 7800 XT', false, 'substring bug: CPU vs GPU'],
  ['Intel Core i9-14900KF 24-Core', 'Intel Core i9-14900K', false, 'variant bug: KF has no iGPU'],
  ['AORUS GeForce RTX 5070 MASTER 12GB', 'NVIDIA GeForce RTX 4090', false, 'different model'],
  ['ASUS Dual GeForce RTX 3050 OC 6GB', 'NVIDIA GeForce RTX 4090', false, 'different model'],
];

let failed = 0;
for (const [product, catalogue, expected, note] of CASES) {
  const score = scoreNameMatch(product, catalogue);
  const matched = score >= 0.5;
  const ok = matched === expected;
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${String(matched).padEnd(5)} ${score.toFixed(2)}  ${note.padEnd(26)} ${product.slice(0, 38)}`,
  );
}

console.log(`\n${CASES.length - failed}/${CASES.length} correct`);
process.exit(failed ? 1 : 0);
