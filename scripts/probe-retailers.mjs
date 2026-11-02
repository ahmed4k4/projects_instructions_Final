/**
 * Reachability + robots.txt probe for the Egyptian retailer sources.
 *
 *   node scripts/probe-retailers.mjs
 *
 * Answers three questions before any scraper is written:
 *   1. Does the site answer a plain fetch (or is it behind an anti-bot wall)?
 *   2. Does robots.txt allow the category paths we intend to crawl?
 *   3. Is the listing page server-rendered (scrapeable) or JS-only?
 */
const UA = 'NexusPCBuilderBot/1.0 (+https://nexus-pc-builder.example/bot)';

const SITES = [
  {
    id: 'sigma',
    name: 'Sigma Computer',
    home: 'https://sigma-computer.com/en',
    listing: 'https://sigma-computer.com/en/category/1/vga',
  },
  {
    id: 'alfrensia',
    name: 'Alfrensia',
    home: 'https://alfrensia.com/ar/',
    listing: 'https://alfrensia.com/ar/3-graphic-cards',
  },
  {
    id: 'elnekhely',
    name: 'Elnekhely Technology',
    home: 'https://www.elnekhelytechnology.com/',
    listing: 'https://www.elnekhelytechnology.com/',
  },
  {
    id: 'elbadr',
    name: 'Elbadr Group',
    home: 'https://elbadrgroupeg.store/',
    listing: 'https://elbadrgroupeg.store/',
  },
  {
    id: 'egprices',
    name: 'EGPrices (aggregator)',
    home: 'https://egprices.com/',
    listing: 'https://egprices.com/',
  },
];

async function get(url, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    const body = await res.text();
    return { status: res.status, ms: Date.now() - started, body, finalUrl: res.url, headers: res.headers };
  } catch (error) {
    return { status: 0, ms: Date.now() - started, body: '', error: error.name + ': ' + error.message };
  } finally {
    clearTimeout(timer);
  }
}

const signal = (body) => {
  const lower = body.toLowerCase();
  return {
    len: body.length,
    cloudflare: /just a moment|cf-browser-verification|challenge-platform/.test(lower),
    nextjs: /__next_data__/.test(lower),
    jsonld: /application\/ld\+json/.test(lower),
    priceEgp: /(EGP|ج\.م|LE\b)/.test(body),
    products: (body.match(/class="[^"]*product[^"]*"/g) || []).length,
  };
};

for (const site of SITES) {
  console.log(`\n=== ${site.name} (${site.id}) ===`);

  const root = new URL(site.home);
  const robots = await get(`${root.origin}/robots.txt`);
  if (robots.status === 200) {
    const disallow = robots.body
      .split(/\r?\n/)
      .filter((l) => /^\s*Disallow:/i.test(l) && !/Disallow:\s*$/i.test(l))
      .map((l) => l.trim());
    console.log(`robots.txt  ${robots.status} · ${disallow.length} Disallow rule(s)`);
    disallow.slice(0, 6).forEach((rule) => console.log(`   ${rule}`));
  } else {
    console.log(`robots.txt  ${robots.status || robots.error} (no restrictions published)`);
  }
  await new Promise((r) => setTimeout(r, 2000));

  for (const [label, url] of [
    ['home   ', site.home],
    ['listing', site.listing],
  ]) {
    const res = await get(url);
    const s = signal(res.body);
    console.log(
      `${label} ${String(res.status).padEnd(3)} ${String(res.ms).padStart(5)}ms  len=${String(s.len).padStart(7)}` +
        `  cf=${s.cloudflare ? 'YES' : 'no'} nextjs=${s.nextjs ? 'y' : 'n'} ld+json=${s.jsonld ? 'y' : 'n'}` +
        `  EGP=${s.priceEgp ? 'y' : 'n'} productMarkup=${s.products}`,
    );
    if (res.error) console.log(`         ${res.error}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
