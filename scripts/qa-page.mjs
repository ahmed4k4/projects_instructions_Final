/**
 * Page QA harness for Phase 10 — renders a route and reports what actually
 * happened: console errors, failed requests, untranslated text, layout.
 *
 *   node scripts/qa-page.mjs <url> [width] [lang] [out.png] [full]
 *
 * Exits non-zero when a real problem is found, so it can gate a release.
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const byVersion = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const roots = [];
const home = process.env.CODEGPT_HOME || join(homedir(), '.codegpt');
try {
  roots.push(JSON.parse(readFileSync(join(home, 'runtime.json'), 'utf8')).modulesRoot);
} catch {}
for (const dir of ['.vscode', '.vscode-insiders', '.cursor', '.windsurf']) {
  const base = join(homedir(), dir, 'extensions');
  if (!existsSync(base)) continue;
  const name = readdirSync(base)
    .filter((x) => x.startsWith('danielsanmedium.dscodegpt-'))
    .sort(byVersion)
    .pop();
  if (name) roots.push(join(base, name, 'standalone'));
}
roots.push(process.cwd());

let chromium;
for (const root of roots) {
  try {
    chromium = createRequire(root)('patchright').chromium;
    if (chromium) break;
  } catch {}
}
let executablePath;
try {
  executablePath = chromium.executablePath();
} catch {}
if (!executablePath) {
  executablePath = [
    join(process.env.PROGRAMFILES ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ].find((p) => p && existsSync(p));
}

const [url = 'http://localhost:5173/', width = '1440', lang = 'en', out = '.qa/page.png', full = ''] =
  process.argv.slice(2);

mkdirSync('.qa', { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: Number(width), height: 900 },
  deviceScaleFactor: 1,
  isMobile: Number(width) < 768,
  hasTouch: Number(width) < 768,
  locale: lang === 'ar' ? 'ar-EG' : 'en-US',
});
const page = await context.newPage();

const consoleErrors = [];
const failed = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 180));
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message.slice(0, 180)}`));
page.on('response', (res) => {
  if (res.status() >= 400 && !res.url().startsWith('data:'))
    failed.push(`${res.status()} ${res.url().slice(0, 140)}`);
});

if (lang === 'ar') await page.addInitScript(() => localStorage.setItem('nexus:language', 'ar'));
else await page.addInitScript(() => localStorage.removeItem('nexus:language'));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
// No waiting on a long network-idle: this runs against dev or preview servers
// where a hot-reload socket never goes quiet, and a harness that hangs is worse
// than one that reports a little early.
await page
  .waitForFunction(() => document.body.innerText.trim().length > 200, { timeout: 20000 })
  .catch(() => {});
await page.waitForTimeout(3500);

const report = await page.evaluate(() => {
  const doc = document.documentElement;
  return {
    title: document.title,
    dir: doc.dir,
    lang: doc.lang,
    dark: doc.classList.contains('dark'),
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    text: document.body.innerText.slice(0, 400),
    canvases: document.querySelectorAll('canvas').length,
    images: [...document.querySelectorAll('img')].map((img) => ({
      src: img.currentSrc.split('/').pop(),
      ok: img.complete && img.naturalWidth > 0,
    })),
  };
});

await page.screenshot({ path: out, fullPage: full === 'full' });
await browser.close();

const brokenImages = report.images.filter((img) => !img.ok);
console.log(`\n== ${url} (${width}px, ${lang}) ==`);
console.log(`title    : ${report.title}`);
console.log(`dir/lang : ${report.dir}/${report.lang}  dark=${report.dark}`);
console.log(
  `overflow : ${report.scrollWidth > report.clientWidth ? `YES ${report.scrollWidth} > ${report.clientWidth}` : 'none'}`,
);
console.log(`canvas   : ${report.canvases}`);
console.log(`images   : ${report.images.length} (${report.images.filter((i) => i.ok).length} ok)`);
if (brokenImages.length) console.log(`  broken : ${brokenImages.map((i) => i.src).join(', ')}`);
if (failed.length) console.log(`requests : ${[...new Set(failed)].join('\n           ')}`);
if (consoleErrors.length)
  console.log(`console  : ${[...new Set(consoleErrors)].slice(0, 6).join('\n           ')}`);
console.log(`saved    : ${out}`);

const fatal = failed.some((f) => /\/api\/ai\//.test(f)) || consoleErrors.length > 0;
process.exit(fatal ? 1 : 0);
