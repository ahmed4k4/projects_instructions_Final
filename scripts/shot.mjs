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
for (const d of ['.vscode', '.vscode-insiders', '.cursor', '.windsurf']) {
  const base = join(homedir(), d, 'extensions');
  if (!existsSync(base)) continue;
  const n = readdirSync(base)
    .filter((x) => x.startsWith('danielsanmedium.dscodegpt-'))
    .sort(byVersion)
    .pop();
  if (n) roots.push(join(base, n, 'standalone'));
}
roots.push(process.cwd());
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

const [url = 'http://localhost:5180/', width = '375', lang = 'en', out = '.qa/mobile.png', full = ''] =
  process.argv.slice(2);

mkdirSync('.qa', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: exe,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({
  viewport: { width: Number(width), height: 812 },
  deviceScaleFactor: 2,
  isMobile: Number(width) < 768,
  hasTouch: Number(width) < 768,
  locale: lang === 'ar' ? 'ar-EG' : 'en-US',
});
const page = await ctx.newPage();
// The i18next detector reads navigator.languages, so the CONTEXT locale — not
// localStorage — is what decides the language (and therefore the number
// formatting). Setting only localStorage produced an "Arabic" screenshot whose
// prices were formatted with the English locale.
if (lang === 'ar') await page.addInitScript(() => localStorage.setItem('nexus:language', 'ar'));
else await page.addInitScript(() => localStorage.removeItem('nexus:language'));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page
  .waitForFunction(() => document.body.innerText.trim().length > 200, { timeout: 15000 })
  .catch(() => {});
await page.waitForTimeout(2500);
// 5th positional arg is an optional CSS selector: screenshot only that element
// (used to capture the 3D hero for the static fallback image).
const selector = process.argv[7];
const target = selector ? page.locator(selector).first() : page;
await target.screenshot({ path: out, fullPage: !selector && full === 'full' });
console.log(`saved ${out} (${width}px, ${lang})${selector ? ` [${selector}]` : ''}`);
await browser.close();
