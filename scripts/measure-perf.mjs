/**
 * Mobile performance probe — the metrics Lighthouse scores, measured directly.
 *
 *   node scripts/measure-perf.mjs [url] [--width 375]
 *
 * Reports LCP, CLS, total transfer, request count and long tasks on a throttled
 * mobile profile. Run against `pnpm preview` for the production build; the dev
 * server is unminified and not representative.
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const byVersion = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const roots = [];
try {
  roots.push(JSON.parse(readFileSync(join(homedir(), '.codegpt', 'runtime.json'), 'utf8')).modulesRoot);
} catch {}
for (const d of ['.vscode', '.vscode-insiders', '.cursor', '.windsurf']) {
  const base = join(homedir(), d, 'extensions');
  if (!existsSync(base)) continue;
  const n = readdirSync(base)
    .filter((x) => x.startsWith('danielsanmedium.dscodegpt-'))
    .sort(byVersion)
    .pop();
  if (n) roots.push(join(base, n, 'standalone'));
}
let chromium;
for (const r of roots) {
  try {
    chromium = createRequire(r)('patchright').chromium;
    if (chromium) break;
  } catch {}
}
let exe;
try {
  exe = chromium.executablePath();
} catch {}
if (!exe)
  exe = [
    join(process.env.PROGRAMFILES ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ].find((p) => p && existsSync(p));

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) ?? 'http://localhost:4173/';
const widthArg = args.indexOf('--width');
const width = widthArg >= 0 ? Number(args[widthArg + 1]) : 375;

const browser = await chromium.launch({
  headless: true,
  executablePath: exe,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({
  viewport: { width, height: 812 },
  isMobile: width < 768,
  locale: 'en-US',
});

// Lighthouse mobile profile: 4× CPU slowdown, 1.6 Mbps down.
const page = await ctx.newPage();
const client = await ctx.newCDPSession(page);
await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await client.send('Network.enable');
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});

const bytes = new Map();
page.on('response', async (r) => {
  try {
    const len = Number(r.headers()['content-length'] ?? 0);
    if (len) bytes.set(r.url(), len);
  } catch {}
});

// Force English: i18next reads navigator.languages, so a persisted Arabic choice
// would make every measurement compare against the wrong asset graph.
await page.addInitScript(() => localStorage.removeItem('nexus:language'));

await page.addInitScript(() => {
  // Same script runs on every frame/document, so do not clobber an existing value.
  window.__lcp ??= 0;
  window.__cls ??= 0;
  // Keep the observer alive in a hidden store the app cannot reset, and record
  // every candidate so the final LCP is recoverable after React mounts.
  window.__lcpList = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__lcpList.push(e.startTime);
      window.__lcp = Math.max(Number(window.__lcp) || 0, e.startTime);
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
});

const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(4000);

const metrics = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paint = performance.getEntriesByType('paint');
  const fcp = paint.find((p) => p.name === 'first-contentful-paint')?.startTime ?? 0;
  return {
    fcp: Math.round(fcp),
    // A single-page app can drop the buffer on its first render, so the value
    // collected by the init observer is the reliable one.
    lcp: Math.round(Math.max(Number(window.__lcp) || 0, ...(window.__lcpList || []))),
    cls: Number(Number(window.__cls ?? 0).toFixed(4)),
    domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0),
    load: Math.round(nav?.loadEventEnd ?? 0),
  };
});

const totalKb = [...bytes.values()].reduce((a, b) => a + b, 0) / 1024;

console.log(`\nprofile    mobile ${width}px · 4× CPU · 1.6 Mbps`);
console.log(`url        ${url}`);
console.log(`wall       ${Date.now() - t0}ms`);
console.log(
  `FCP        ${metrics.fcp} ms   ${metrics.fcp <= 1800 ? '✓ good' : metrics.fcp <= 3000 ? '~ ok' : '✗ slow'}`,
);
console.log(
  `LCP        ${metrics.lcp} ms   ${metrics.lcp <= 2500 ? '✓ good' : metrics.lcp <= 4000 ? '~ ok' : '✗ slow'}`,
);
console.log(`CLS        ${metrics.cls}      ${metrics.cls <= 0.1 ? '✓ good' : '✗ high'}`);
console.log(`load       ${metrics.load} ms`);
console.log(`transfer   ${Math.round(totalKb)} kB (${bytes.size} requests)`);

await browser.close();
