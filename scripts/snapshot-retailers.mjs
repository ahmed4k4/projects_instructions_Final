/**
 * Capture a local snapshot of real retailer listings — resumable.
 *
 *   node scripts/snapshot-retailers.mjs [retailerId ...]
 *
 * With no arguments every retailer is scraped and the snapshot is replaced.
 * With one or more ids only those retailers are refreshed and their rows are
 * MERGED into the existing snapshot, so a slow run can be split across several
 * invocations (each one finishes well inside a command timeout, and stays polite
 * to the stores).
 *
 *   node scripts/snapshot-retailers.mjs elbadr
 *   node scripts/snapshot-retailers.mjs elnekhely
 *   node scripts/snapshot-retailers.mjs alfrensia
 *
 * Writes `src/services/retailers/snapshot.json`, used as the offline fallback
 * when Supabase is unconfigured or `retailer_products` has not been synced yet.
 * Never hand-edited; always carries `capturedAt`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { RETAILERS, pageUrl } from '../supabase/functions/retailer-sync/parsers.ts';

const SNAPSHOT_PATH = 'src/services/retailers/snapshot.json';
const UA = 'NexusPCBuilderBot/1.0 (+https://nexus-pc-builder.example/bot)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const argv = process.argv.slice(2);
const fromIndex = argv.indexOf('--from');
const fromFile = fromIndex >= 0 ? argv[fromIndex + 1] : null;
const requested = argv.filter((a, i) => !a.startsWith('-') && (fromIndex < 0 || i !== fromIndex + 1));

/**
 * `--from <file>`: ingest a scraper's JSON instead of fetching.
 *
 * This is how the Playwright worker (`scripts/sigma_scraper.py`) contributes: a
 * headless browser cannot run inside a Supabase Edge Function, so it runs on cron
 * elsewhere and hands back a file in the same shape as the parser output.
 */
const externalRows = fromFile ? (JSON.parse(readFileSync(fromFile, 'utf8')).products ?? []) : null;

const retailers = externalRows
  ? []
  : requested.length
    ? RETAILERS.filter((r) => requested.includes(r.id))
    : RETAILERS;

if (!externalRows && retailers.length === 0) {
  console.error(`Unknown retailer. Known: ${RETAILERS.map((r) => r.id).join(', ')}`);
  process.exit(1);
}

const rows = externalRows ?? [];
if (externalRows) console.log(`  ingested ${externalRows.length} rows from ${fromFile}`);

for (const retailer of retailers) {
  for (const target of retailer.targets) {
    const pageCap = Math.max(1, target.pages ?? 1);
    let fetched = 0;

    for (let page = 1; page <= pageCap; page += 1) {
      const url = pageUrl(target, page);
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA, Accept: 'text/html' },
          signal: AbortSignal.timeout(25000),
          redirect: 'follow',
        });

        if (res.status !== 200) {
          if (page === 1) console.log(`  ${retailer.id}/${target.category}: HTTP ${res.status}`);
          break;
        }

        const products = retailer.parse(await res.text(), res.url);
        // Past the end of the listing: stop rather than keep requesting.
        if (products.length === 0 && page > 1) break;

        fetched += products.length;
        rows.push(...products);
      } catch (error) {
        if (page === 1) console.log(`  ${retailer.id}/${target.category}: ${String(error).slice(0, 80)}`);
        break;
      }
      await sleep(2000);
    }

    console.log(`  ${retailer.id}/${target.category}: ${fetched} products`);
  }
}

/* ── Merge into the existing snapshot ─────────────────────────────────────── */
const ids = new Set([
  ...retailers.map((r) => r.id),
  // Rows from an external scraper replace that retailer's existing entries.
  ...new Set((externalRows ?? []).map((r) => r.retailerId)),
]);
const previous = existsSync(SNAPSHOT_PATH)
  ? (JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')).products ?? [])
  : [];

// Keep retailers that were not part of this run.
const kept = previous.filter((p) => !ids.has(p.retailerId));

// De-duplicate on (retailer, externalId): a part can appear in two categories.
const unique = new Map();
for (const row of [...kept, ...rows]) unique.set(`${row.retailerId}:${row.externalId}`, row);
const products = [...unique.values()];

const snapshot = {
  capturedAt: new Date().toISOString(),
  source: 'scripts/snapshot-retailers.mjs',
  retailers: [...new Set(products.map((p) => p.retailerId))].sort(),
  products,
};

writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

console.log(`\n${products.length} products · ${snapshot.retailers.length} retailers → ${SNAPSHOT_PATH}`);
for (const id of snapshot.retailers) {
  const count = products.filter((p) => p.retailerId === id).length;
  const imgs = products.filter((p) => p.retailerId === id && p.imageUrl).length;
  console.log(
    `   ${id.padEnd(11)} ${String(count).padStart(4)} products · ${Math.round((imgs / count) * 100)}% with images`,
  );
}
