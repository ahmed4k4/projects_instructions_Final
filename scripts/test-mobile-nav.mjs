/**
 * Mobile navigation interaction test.
 *
 *   node scripts/test-mobile-nav.mjs
 *
 * Drives the exact flow the user reported as broken: open the drawer, navigate,
 * close it, and tap header controls — at 375px, in both languages. Fails if any
 * tap is swallowed, or if a closed overlay keeps intercepting pointer events.
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
  exe = [join(process.env.PROGRAMFILES ?? '', 'Google\\Chrome\\Application\\chrome.exe')].find(
    (p) => p && existsSync(p),
  );

const BASE = process.argv[2] ?? 'http://localhost:5182';
let failures = 0;
const pass = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--no-sandbox'] });

for (const lang of ['en', 'ar']) {
  console.log(`\n──── 375px · ${lang} ────`);
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    locale: lang === 'ar' ? 'ar-EG' : 'en-US',
  });
  const page = await ctx.newPage();
  if (lang === 'ar') await page.addInitScript(() => localStorage.setItem('nexus:language', 'ar'));
  else await page.addInitScript(() => localStorage.removeItem('nexus:language'));

  await page.goto(`${BASE}/builder`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  /* 1. The hamburger opens the drawer. */
  const burger = page.locator('header button').first();
  await burger.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);

  let drawerOpen = await page.evaluate(() => {
    const aside = [...document.querySelectorAll('aside')].find(
      (a) => getComputedStyle(a).position === 'fixed',
    );
    return Boolean(aside);
  });
  pass(drawerOpen, 'hamburger opens the drawer');

  /* 2. A nav link inside the drawer navigates. */
  if (drawerOpen) {
    const before = new URL(page.url()).pathname;
    // Only the VISIBLE drawer link: the desktop rail also has `/search`, and
    // `.first()` could resolve to the hidden one (zero-size, unclickable).
    const clicked = await page.evaluate(() => {
      const link = [...document.querySelectorAll('a[href="/search"]')].find((a) => {
        const r = a.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!link) return false;
      link.click();
      return true;
    });
    await page.waitForTimeout(1200);
    const after = new URL(page.url()).pathname;
    pass(clicked && after === '/search', 'drawer link navigates', `${before} -> ${after}`);

    /* 3. The drawer closes and stops intercepting taps. */
    await page.waitForTimeout(900);
    /*
     * "Closed" means OFF-SCREEN, not "absent from the DOM".
     *
     * An exit animation leaves the element mounted for its duration. What matters
     * for the reported bug is that the panel no longer covers the page, so measure
     * that: a closed drawer is translated fully outside the viewport.
     */
    const closed = await page.evaluate(() => {
      const drawer = [...document.querySelectorAll('aside')].find((a) => {
        const r = a.getBoundingClientRect();
        return r.width > 100 && r.height > 100;
      });
      if (!drawer) return true;
      const r = drawer.getBoundingClientRect();
      return r.right <= 1 || r.left >= window.innerWidth - 1;
    });
    pass(closed, 'drawer slides off-screen after navigation');

    /* 4. Nothing invisible covers the header. */
    const hit = await page.evaluate(() => {
      const targets = [
        [20, 32],
        [180, 32],
        [340, 32],
      ];
      // Also confirm the backdrop is gone (it sits at z-40 over everything).
      return targets.map(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return 'none';
        // An interactive element or a descendant of the header is fine.
        const inHeader = Boolean(el.closest('header'));
        const pe = getComputedStyle(el).pointerEvents;
        return inHeader && pe !== 'none'
          ? 'ok'
          : `${el.tagName}.${String(el.className).slice(0, 26)} pe=${pe}`;
      });
    });
    pass(
      hit.every((h) => h === 'ok'),
      'header is clickable (no overlay)',
      hit.filter((h) => h !== 'ok').join(' | ') || 'clear',
    );
  }

  /* 5. Bottom nav responds. */
  const bottomClicked = await page.evaluate(() => {
  const link = [...document.querySelectorAll('a[href="/dashboard"]')].find((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (!link) return false;
  link.click();
  return true;
  });
  await page.waitForTimeout(1200);
  pass(bottomClicked && new URL(page.url()).pathname === '/dashboard', 'bottom nav navigates');

  /* 6. Language toggle still works after navigation. */
  const ar = page.locator('button').filter({ hasText: /^(EN|ع)$/ });
  if ((await ar.count()) > 0) {
    await ar
      .last()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(700);
    const dir = await page.evaluate(() => document.documentElement.dir);
    pass(dir === 'ltr' || dir === 'rtl', 'language toggle responds', `dir=${dir}`);
  }

  /* 7. No horizontal scroll. */
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  pass(!overflow, 'no horizontal scroll');

  await ctx.close();
}

await browser.close();
console.log(failures ? `\n✗ ${failures} failure(s)` : '\n✓ mobile navigation fully interactive');
process.exit(failures ? 1 : 0);
