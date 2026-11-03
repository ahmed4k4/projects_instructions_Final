/**
 * Responsive audit at real device widths.
 *
 *   node scripts/audit-mobile.mjs [url] [--width 375] [--lang ar]
 *
 * Reports, per width:
 *   · horizontal overflow (the #1 mobile symptom)
 *   · interactive targets under 44×44px (WCAG 2.5.5)
 *   · any element wider than the viewport
 *   · console errors
 *
 * Uses the patchright install that ships with the CodeGPT extension.
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const byVersion = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function resolveChromium() {
  const roots = [];
  const home = process.env.CODEGPT_HOME || join(homedir(), '.codegpt');
  try {
    roots.push(JSON.parse(readFileSync(join(home, 'runtime.json'), 'utf8')).modulesRoot);
  } catch {}
  for (const d of ['.vscode', '.vscode-insiders', '.vscode-oss', '.cursor', '.windsurf']) {
    const base = join(homedir(), d, 'extensions');
    if (!existsSync(base)) continue;
    const newest = readdirSync(base)
      .filter((x) => x.startsWith('danielsanmedium.dscodegpt-'))
      .sort(byVersion)
      .pop();
    if (newest) roots.push(join(base, newest, 'standalone'));
  }
  roots.push(process.cwd());

  for (const root of roots) {
    try {
      const mod = createRequire(root)('patchright');
      const chromium = mod?.chromium ?? mod?.default?.chromium;
      if (chromium) return { chromium, root };
    } catch {}
  }
  throw new Error('patchright not found');
}

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(n);
  return i === -1 ? d : args[i + 1];
};
const url =
  args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? 'http://localhost:5180/';
const lang = flag('--lang', 'en');
const widths = (flag('--width') ?? '375,390,414,768').split(',').map(Number);

const { chromium, root } = resolveChromium();

// Prefer a system browser: the pinned build is often absent.
const candidates =
  process.platform === 'win32'
    ? [
        join(process.env.PROGRAMFILES ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft\\Edge\\Application\\msedge.exe'),
        join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium'];

let executablePath;
try {
  executablePath = chromium.executablePath();
} catch {
  executablePath = undefined;
}
if (!executablePath) executablePath = candidates.find((p) => p && existsSync(p));

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});

for (const width of widths) {
  const ctx = await browser.newContext({
    viewport: { width, height: 812 },
    deviceScaleFactor: 2,
    // 768px IS a touch width: tablets are the devices this check exists for.
    // Gating on `< 768` made the 768 pass a mouse context, so `pointer: coarse`
    // never matched and the harness reported "8 sub-44px targets" on a layout
    // where the rule was working exactly as designed.
    isMobile: width < 1024,
    hasTouch: width < 1024,
    locale: lang === 'ar' ? 'ar-EG' : 'en-US',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 120));
  });
  page.on('pageerror', (e) => errors.push('uncaught: ' + String(e).slice(0, 120)));

  if (lang === 'ar') await page.addInitScript(() => localStorage.setItem('nexus:language', 'ar'));

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page
    .waitForFunction(() => (document.body?.innerText || '').trim().length > 200, { timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(1200);

  const report = await page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;

    const small = [...document.querySelectorAll('button, a[href], input, select, textarea, [role=button]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && (r.height < 44 || r.width < 44);
      })
      .slice(0, 10)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 18)}" ${Math.round(r.width)}x${Math.round(r.height)}`;
      });

    // Only elements that can actually create a scrollbar: skip anything inside
    // an `overflow: hidden` ancestor (decorative blur blobs are routinely wider
    // than the viewport on purpose and never scroll).
    const clippedByAncestor = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'hidden' || ox === 'clip' || ox === 'auto' || ox === 'scroll') return true;
      }
      return false;
    };

    const wide = [...document.querySelectorAll('body *')]
      .filter(
        (el) =>
          el.getBoundingClientRect().width > vw + 1 &&
          getComputedStyle(el).position !== 'fixed' &&
          !clippedByAncestor(el),
      )
      .slice(0, 6)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 34)} w=${Math.round(el.getBoundingClientRect().width)}`,
      );

    return {
      hScroll: doc.scrollWidth > vw + 1,
      scrollWidth: doc.scrollWidth,
      clientWidth: vw,
      dir: doc.dir,
      lang: doc.lang,
      bodyFont: getComputedStyle(document.body).fontSize,
      smallTargets: small.length ? small : 0,
      overflowing: wide,
    };
  });

  console.log(`\n──── ${width}px · ${lang} ────`);
  console.log(`  dir=${report.dir} lang=${report.lang} body=${report.bodyFont}`);
  console.log(`  overflow: ${report.hScroll ? `YES (${report.scrollWidth} > ${report.clientWidth})` : 'no'}`);
  console.log(`  targets <44px: ${Array.isArray(report.smallTargets) ? report.smallTargets.length : 0}`);
  if (Array.isArray(report.smallTargets)) report.smallTargets.forEach((t) => console.log(`     ${t}`));
  if (report.overflowing.length) {
    console.log(`  elements wider than viewport:`);
    report.overflowing.forEach((w) => console.log(`     ${w}`));
  }
  if (errors.length) console.log(`  console errors: ${errors.slice(0, 3).join(' | ')}`);

  await ctx.close();
}

await browser.close();
console.log(`\n(patchright: ${root})`);
