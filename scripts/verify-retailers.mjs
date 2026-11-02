/**
 * Validate the retailer parsers against LIVE pages.
 *
 *   node scripts/verify-retailers.mjs
 *
 * Fetches each real category page (with the same UA and 2 s spacing the Edge
 * Function uses), runs the production parser, and prints what it extracted.
 * No database, no writes — this only proves the parsing contract holds today.
 */
import { RETAILERS, isAllowed, parseJsonLd } from '../supabase/functions/retailer-sync/parsers.ts';

const UA = 'NexusPCBuilderBot/1.0 (+https://nexus-pc-builder.example/bot)';
const DELAY = 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    return { status: res.status, body: await res.text(), finalUrl: res.url };
  } catch (error) {
    return { status: 0, body: '', finalUrl: url, error: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

const summary = [];

for (const retailer of RETAILERS) {
  console.log(`\n════ ${retailer.name} (${retailer.id}) ════`);

  const origin = new URL(retailer.home).origin;
  const robots = await get(`${origin}/robots.txt`);
  const allowed =
    robots.status === 200 ? isAllowed(robots.body, new URL(retailer.targets[0].url).pathname) : true;
  console.log(`robots: ${robots.status} · allowed=${allowed}`);
  await sleep(DELAY);

  let total = 0;
  for (const target of retailer.targets) {
    const res = await get(target.url);
    let products = [];
    if (res.status === 200) {
      try {
        products = retailer.parse(res.body, res.finalUrl);
      } catch (error) {
        console.log(`  parse threw: ${error.message}`);
      }
    }
    console.log(
      `  ${target.category.padEnd(12)} ${String(res.status).padEnd(4)} len=${String(res.body.length).padStart(7)} → ${products.length} products`,
    );
    total += products.length;

    for (const p of products.slice(0, 3)) {
      console.log(
        `     • ${p.name.slice(0, 62).padEnd(62)} ${String(p.priceEgp).padStart(9)} EGP` +
          `${p.originalPriceEgp ? ` (was ${p.originalPriceEgp})` : ''} ${p.stockStatus}`,
      );
    }
    if (products[0]) {
      console.log(`       url: ${products[0].productUrl.slice(0, 90)}`);
      console.log(`       img: ${String(products[0].imageUrl).slice(0, 90)}`);
    }
    await sleep(DELAY);
  }

  summary.push({ id: retailer.id, name: retailer.name, products: total });
}

console.log('\n════ SUMMARY ════');
for (const row of summary) {
  console.log(
    `${row.id.padEnd(11)} ${String(row.products).padStart(4)} products  ${row.products > 0 ? 'OK' : 'ZERO — needs fallback'}`,
  );
}
