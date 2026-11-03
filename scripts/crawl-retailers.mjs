#!/usr/bin/env node
/**
 * Full-catalogue crawl, one category at a time — resumable.
 *
 *   node scripts/crawl-retailers.mjs                # every retailer, every category
 *   node scripts/crawl-retailers.mjs elbadr gpu,cpu
 *
 * Writes each category to `.qa/crawl/<retailer>__<category>.json` and then MERGES
 * every file into the snapshot. Because each category finishes independently, a
 * crawl interrupted by a command timeout or a flaky page loses at most one
 * category — re-running resumes rather than restarting, which matters when a
 * single retailer takes minutes at a polite request rate.
 *
 * Politeness is unchanged: sequential requests, 1.5–3 s jitter, browser headers.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { RETAILERS, headersFor, pageUrl } from '../supabase/functions/retailer-sync/parsers.ts';

const OUT_DIR = '.qa/crawl';
/**
 * Written to `public/`, not `src/`.
 *
 * The full catalogue is ~1.9 MB. As a bundled import it became a 1.5 MB JS
 * chunk that every visitor downloaded; as a static JSON file the app fetches it
 * once and the entry bundle stays small (`bootstrap.json` covers first paint).
 */
const SNAPSHOT_PATH = 'public/data/retailer_snapshot.json';
/** A small bundled subset so the app has real data before the fetch resolves. */
const BOOTSTRAP_PATH = 'src/services/retailers/bootstrap.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const polite = () => sleep(1500 + Math.random() * 1500);

const [retailerFilter, categoryFilter] = process.argv.slice(2);
const wantedCategories = categoryFilter ? new Set(categoryFilter.split(',')) : null;

mkdirSync(OUT_DIR, { recursive: true });

const retailers = RETAILERS.filter((r) => r.id !== 'sigma' && (!retailerFilter || r.id === retailerFilter));

const rowKey = (r) => `${r.retailerId}:${r.externalId}`;

const uniqueRows = (rows) => {
  const map = new Map();
  for (const row of rows) map.set(rowKey(row), row);
  return [...map.values()];
};

for (const retailer of retailers) {
  for (const target of retailer.targets) {
    if (wantedCategories && !wantedCategories.has(target.category)) continue;

    const file = `${OUT_DIR}/${retailer.id}__${target.category}.json`;
    let rows = [];
    let startPage = 1;

    // Resume a partial category from the page it stopped on, keeping the rows
    // already collected. Without this, one dropped request discarded minutes of
    // polite crawling.
    if (existsSync(file)) {
      const existing = JSON.parse(readFileSync(file, 'utf8'));
      if (existing.complete) {
        console.log(`skip  ${retailer.id}/${target.category} (${existing.products.length} cached)`);
        continue;
      }
      rows = existing.products ?? [];
      // `lastPage` is the last page SUCCESSFULLY folded into `products`, so the
      // next page is lastPage + 1. (Resuming ON lastPage re-fetched the same page
      // forever and never reached `complete`.)
      startPage = Math.max(1, (existing.lastPage ?? 0) + 1);
      console.log(`resume ${retailer.id}/${target.category} from page ${startPage} (${rows.length} kept)`);
    }

    let complete = false;

    for (let page = startPage; page <= (target.pages ?? 1); page += 1) {
      const url = pageUrl(target, page);
      let products = [];
      try {
        // Two attempts with a longer back-off. A single dropped connection used
        // to end the category silently — that is how Elbadr's 500-product GPU
        // listing was recorded as 367.
        let res;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          res = await fetch(url, {
            headers: headersFor(url),
            redirect: 'follow',
            signal: AbortSignal.timeout(45000),
          });
          if (res.ok) break;
          console.log(
            `  ${retailer.id}/${target.category} p${page}: HTTP ${res.status} (attempt ${attempt})`,
          );
          if (attempt < 2) await sleep(4000);
        }
        if (!res?.ok) break;
        products = retailer.parse(await res.text(), res.url);
      } catch (error) {
        console.log(`  ${retailer.id}/${target.category} p${page}: ${String(error).slice(0, 60)}`);
        break;
      }

      if (products.length === 0) {
        complete = true; // past the last page
        break;
      }
      rows.push(...products);
      // Persist after EVERY page so an interrupted run loses at most one page.
      writeFileSync(
        file,
        JSON.stringify(
          {
            retailerId: retailer.id,
            category: target.category,
            complete: false,
            lastPage: page,
            products: uniqueRows(rows),
          },
          null,
          1,
        ),
      );
      await polite();
    }

    const products = uniqueRows(rows);
    writeFileSync(
      file,
      JSON.stringify(
        { retailerId: retailer.id, category: target.category, complete, lastPage: 0, products },
        null,
        1,
      ),
    );
    console.log(
      `${retailer.id}/${target.category}: ${products.length} products${complete ? '' : ' (partial)'}`,
    );
  }
}

/* ── Merge every crawl file into the snapshot ──────────────────────────────── */
const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.json'));
const crawled = new Map();
for (const file of files) {
  const payload = JSON.parse(readFileSync(`${OUT_DIR}/${file}`, 'utf8'));
  for (const product of payload.products) crawled.set(rowKey(product), product);
}

const previous = existsSync(SNAPSHOT_PATH)
  ? (JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')).products ?? [])
  : [];

// Anything not covered by the crawl files is kept (e.g. retailers not crawled).
const crawledRetailers = new Set([...crawled.values()].map((r) => r.retailerId));
const kept = previous.filter((p) => !crawledRetailers.has(p.retailerId));
const products = uniqueRows([...kept, ...crawled.values()]);

const snapshot = {
  capturedAt: new Date().toISOString(),
  source: 'scripts/crawl-retailers.mjs',
  retailers: [...new Set(products.map((p) => p.retailerId))].sort(),
  products,
};

writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

/**
 * Regenerate the bundled subset: two products per (retailer, category), so the
 * builder and search have a real, representative answer before the feed loads.
 */
const buckets = new Map();
for (const product of products) {
  const key = `${product.retailerId}:${product.category}`;
  buckets.set(key, [...(buckets.get(key) ?? []), product]);
}
const bootstrapProducts = [...buckets.values()].flatMap((rows) => rows.slice(0, 2));

writeFileSync(
  BOOTSTRAP_PATH,
  `${JSON.stringify(
    {
      capturedAt: snapshot.capturedAt,
      source: 'bootstrap subset of retailer_snapshot.json',
      retailers: [...new Set(bootstrapProducts.map((p) => p.retailerId))].sort(),
      products: bootstrapProducts,
    },
    null,
    1,
  )}\n`,
  'utf8',
);

console.log(`\n${products.length} products → ${SNAPSHOT_PATH}`);
console.log(`${bootstrapProducts.length} products → ${BOOTSTRAP_PATH} (first paint)`);
for (const id of snapshot.retailers) {
  const list = products.filter((p) => p.retailerId === id);
  const withImages = list.filter((p) => p.imageUrl).length;
  console.log(
    `  ${id.padEnd(11)} ${String(list.length).padStart(5)} · ${Math.round((withImages / list.length) * 100)}% images`,
  );
}
