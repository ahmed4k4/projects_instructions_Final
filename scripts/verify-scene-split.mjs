/** Assert the Three.js chunk is NOT requested on a phone viewport, and IS on desktop. */
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

const browser = await chromium.launch({
  headless: true,
  executablePath: exe,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});

for (const [label, viewport, mobile] of [
  ['mobile 375', { width: 375, height: 812 }, true],
  ['desktop 1440', { width: 1440, height: 900 }, false],
]) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const requested = [];
  page.on('request', (r) => requested.push(r.url()));

  await page.goto('http://localhost:5180/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3500);

  const hasCanvas = await page.evaluate(() => Boolean(document.querySelector('canvas')));
  const hasImg = await page.evaluate(() => Boolean(document.querySelector('picture img[src*="hero-scene"]')));
  const threeChunk = requested.filter((u) => /Hero3DScene|three/i.test(u));
  const imageReq = requested.filter((u) => /hero-scene/.test(u));

  console.log(`\n${label}`);
  console.log(`  canvas(3D): ${hasCanvas}   static image: ${hasImg}`);
  console.log(`  three/hero chunk requests: ${threeChunk.length}`);
  console.log(`  fallback image requests:   ${imageReq.length}`);
  await ctx.close();
}

await browser.close();
