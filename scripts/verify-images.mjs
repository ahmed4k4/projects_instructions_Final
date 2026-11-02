/** Measure image extraction across every retailer's live listings. */
import { RETAILERS, extractImage } from '../supabase/functions/retailer-sync/parsers.ts';

const UA = 'NexusPCBuilderBot/1.0 (+https://nexus-pc-builder.example/bot)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('extractImage unit cases:');
const CASES = [
  ['<img src="https://x/a.png">', 'https://x/a.png'],
  ['<img data-src="https://x/lazy.png" src="/placeholder.gif">', 'https://x/lazy.png'],
  ['<img src="https://x/p.jpg" srcset="https://x/s1.jpg 250w, https://x/s2.jpg 500w">', 'https://x/p.jpg'],
  [
    '<img src="/wp-content/uploads/woocommerce-placeholder.png" data-src="https://x/real.jpg">',
    'https://x/real.jpg',
  ],
  ['<img src="data:image/gif;base64,R0lGOD">', null],
  ['<div>no image</div>', null],
];
let bad = 0;
for (const [html, expected] of CASES) {
  const got = extractImage(html);
  const ok = got === expected;
  if (!ok) bad += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(got)} (want ${JSON.stringify(expected)})`);
}

console.log('\nlive coverage per retailer:');
for (const retailer of RETAILERS.filter((r) => r.id !== 'sigma')) {
  let total = 0;
  let withImage = 0;
  for (const target of retailer.targets) {
    try {
      const res = await fetch(target.url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(25000),
      });
      const products = retailer.parse(await res.text(), res.url);
      total += products.length;
      withImage += products.filter((p) => p.imageUrl).length;
    } catch {
      /* skip */
    }
    await sleep(2000);
  }
  const pct = total ? ((withImage / total) * 100).toFixed(0) : '0';
  console.log(`  ${retailer.id.padEnd(11)} ${withImage}/${total} (${pct}%)`);
}

console.log(bad ? `\n✗ ${bad} extractor failure(s)` : '\n✓ extractor cases pass');
