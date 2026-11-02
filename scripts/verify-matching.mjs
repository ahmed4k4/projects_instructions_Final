/**
 * Prove the fuzzy matcher links real scraped names to catalogue parts.
 *
 *   node scripts/verify-matching.mjs
 */
import { RETAILERS } from '../supabase/functions/retailer-sync/parsers.ts';

const UA = 'NexusPCBuilderBot/1.0 (+https://nexus-pc-builder.example/bot)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Same algorithm as supabase/functions/retailer-sync/index.ts scoreMatch().
import { scoreMatch } from './_matcher-v2.mjs';

// Real catalogue names (from src/lib/sampleData.ts)
const CATALOGUE = [
  { id: 'cpu-7800x3d', name: 'AMD Ryzen 7 7800X3D', category: 'cpu' },
  { id: 'cpu-7950x', name: 'AMD Ryzen 9 7950X', category: 'cpu' },
  { id: 'cpu-7600x', name: 'AMD Ryzen 5 7600X', category: 'cpu' },
  { id: 'cpu-14900k', name: 'Intel Core i9-14900K', category: 'cpu' },
  { id: 'cpu-14700k', name: 'Intel Core i7-14700K', category: 'cpu' },
  { id: 'gpu-4090', name: 'NVIDIA GeForce RTX 4090', category: 'gpu' },
  { id: 'gpu-4080s', name: 'NVIDIA GeForce RTX 4080 SUPER', category: 'gpu' },
  { id: 'gpu-4070ti-s', name: 'NVIDIA GeForce RTX 4070 Ti SUPER', category: 'gpu' },
  { id: 'gpu-4070', name: 'NVIDIA GeForce RTX 4070', category: 'gpu' },
  { id: 'gpu-7900xtx', name: 'AMD Radeon RX 7900 XTX', category: 'gpu' },
  { id: 'gpu-7800xt', name: 'AMD Radeon RX 7800 XT', category: 'gpu' },
];

function match(name, category) {
  let best = null;
  for (const e of CATALOGUE) {
    if (e.category !== category) continue;
    const { score } = scoreMatch(name, e.name);
    if (!best || score > best.confidence) best = { id: e.id, name: e.name, confidence: score };
  }
  return best && best.confidence >= 0.5 ? best : null;
}

// --- scrape live and report match quality ---
let checked = 0;
let matched = 0;

for (const retailer of RETAILERS.filter((r) => r.id !== 'sigma')) {
  // EVERY target, not just the first: the interesting defects (a CPU page
  // returning monitors) only show up on the second target.
  for (const target of retailer.targets) {
    const res = await fetch(target.url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(25000),
    });
    const html = await res.text();
    const products = retailer.parse(html, res.url);
    const byCategory = products.reduce(
      (acc, p) => ({ ...acc, [p.category]: (acc[p.category] ?? 0) + 1 }),
      {},
    );

    console.log(
      `\n=== ${retailer.name} · ${target.category} (${products.length} products) ${JSON.stringify(byCategory)} ===`,
    );
    for (const p of products.slice(0, 6)) {
      const m = match(p.name, p.category);
      checked += 1;
      if (m) matched += 1;
      console.log(
        `  [${p.category}] ${p.name.slice(0, 48).padEnd(48)} → ${m ? `${m.name} (${m.confidence.toFixed(2)})` : 'no match'}`,
      );
    }
    await sleep(2200);
  }
}

console.log(`\nmatched ${matched}/${checked} sample products to the catalogue`);
