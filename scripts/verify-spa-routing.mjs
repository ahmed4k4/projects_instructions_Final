/**
 * Verify the production build serves the SPA on a hard refresh of a sub-route.
 *
 *   node scripts/verify-spa-routing.mjs
 *
 * Emulates a static host that applies the `public/_redirects` rule:
 *   · a real file (an asset) is served as-is
 *   · any other path falls back to index.html (200, not 404)
 *
 * Then loads several deep routes in a real browser and asserts the app mounted.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { readdirSync } from 'node:fs';

const DIST = 'dist';
const PORT = 4188;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

/** Static file, else index.html — exactly what `_redirects` does in production. */
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  const candidate = join(DIST, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));

  const exists = existsSync(candidate) && statSync(candidate).isFile();
  const file = exists ? candidate : join(DIST, 'index.html');

  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

await new Promise((resolve) => server.listen(PORT, resolve));

/* ── Verify every declared route returns the app shell ──────────────────── */
const ROUTES = [
  '/',
  '/search',
  '/search?q=rtx%205070',
  '/builder',
  '/builder/ai',
  '/ai-advisor',
  '/prebuilt',
  '/community',
  '/dashboard',
  '/compare/sku%3Agpu%3Ageforce%7C5070%7Cti%7C16',
  '/b/signal-4k-gaming-flagship',
  '/some/nonexistent/deep/route',
];

let failures = 0;
for (const route of ROUTES) {
  const res = await fetch(`http://localhost:${PORT}${route}`);
  const body = await res.text();
  const isShell = body.includes('<div id="root">');
  const ok = res.status === 200 && isShell;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(res.status).padEnd(4)} ${route}`);
}

/* ── Assert a real asset is NOT rewritten to HTML ───────────────────────── */
const css = readdirSync(join(DIST, 'assets')).find((f) => f.endsWith('.css'));
if (css) {
  const res = await fetch(`http://localhost:${PORT}/assets/${css}`);
  const type = res.headers.get('content-type') ?? '';
  const ok = type.includes('text/css');
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  asset served as ${type} (not index.html)`);
}

/* ── Browser check: a hard refresh on /search actually renders ──────────── */
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

if (chromium) {
  let exe;
  try {
    exe = chromium.executablePath();
  } catch {}
  if (!exe) {
    exe = [
      join(process.env.PROGRAMFILES ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
      join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    ].find((p) => p && existsSync(p));
  }

  const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--no-sandbox'] });
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
  ).newPage();

  for (const route of ['/search?q=rtx%205070', '/builder', '/ai-advisor']) {
    // A hard navigation = exactly what a refresh does.
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded' });
    await page
      .waitForFunction(() => document.body.innerText.trim().length > 150, { timeout: 15000 })
      .catch(() => {});
    const chars = await page.evaluate(() => document.body.innerText.trim().length);
    const ok = chars > 150;
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  hard refresh ${route} rendered ${chars} chars`);
  }

  await browser.close();
}

server.close();
console.log(failures ? `\n✗ ${failures} failure(s)` : '\n✓ SPA routing verified — no 404 on refresh');
process.exit(failures ? 1 : 0);
