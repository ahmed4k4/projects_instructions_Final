/**
 * Reproduce Elnekhely's reported 503 and find the working pagination/URL forms.
 *
 *   node scripts/tmp-elnekhely-probe.mjs
 *
 * Prints, for each candidate URL and header profile, the status, the number of
 * product cards parsed, and the first image URL found — so a fix is based on
 * measurements rather than guesses.
 */
const UA_BOT = 'NexusPCBuilderBot/1.0 (+https://nexus-pc-builder.example/bot)';
const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const PROFILES = {
  bot: { 'User-Agent': UA_BOT, Accept: 'text/html' },
  browser: {
    'User-Agent': UA_BROWSER,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.elnekhelytechnology.com/graphics-card',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
  },
};

const BASE = 'https://www.elnekhelytechnology.com';

const urls = [
  `${BASE}/graphics-card`,
  `${BASE}/graphics-card?page=2`,
  `${BASE}/graphics-card&page=2`,
  `${BASE}/graphics-card/page/2`,
  `${BASE}/graphics-card?limit=100`,
  `${BASE}/graphics-card?sort=p.price&order=ASC&limit=100`,
  `${BASE}/index.php?route=product/category&path=59&page=2`,
];

const countCards = (html) => {
  const cards = html.split(/(?=<div[^>]*data-product-id=)/).length - 1;
  const img = /<img\b[^>]*src="([^"]+)"/i.exec(html)?.[1] ?? null;
  const badge = /badge|icon|sticker|watermark|warranty/i.test(img ?? '');
  return { cards, img, badge };
};

for (const [profileName, headers] of Object.entries(PROFILES)) {
  console.log(`\n=== headers: ${profileName} ===`);
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(25000) });
      const html = await res.text();
      const { cards, img, badge } = countCards(html);
      console.log(
        `${String(res.status).padEnd(4)} cards=${String(cards).padEnd(3)} ${badge ? 'BADGE ' : ''}${url.replace(BASE, '')}`,
      );
      if (img) console.log(`      img: ${img.slice(0, 110)}`);
    } catch (error) {
      console.log(`ERR  ${url.replace(BASE, '')} :: ${error.message.slice(0, 60)}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
