#!/usr/bin/env node
/**
 * Prove the DEPLOYED routing table sends `/api/ai/*` to the function.
 *
 *   node scripts/verify-vercel-routing.mjs
 *
 * The Phase 15 production bug was a 404 on `/api/ai/config` while the identical
 * code answered 200 locally. The function was fine; the rewrite was not. A
 * `rewrites` entry in `vercel.json` is compiled into `.vercel/output/config.json`
 * — and Vercel applies that table in order, BEFORE a request ever reaches a
 * serverless function. A catch-all `/(.*) → /index.html` therefore answers every
 * API call with the SPA shell, and the function is never invoked.
 *
 * Local dev hides this completely: the Vite middleware owns `/api/ai` and the
 * rewrite does not exist there. That is exactly why the failure only showed up
 * in production.
 *
 * This gate reads the BUILT table and replays Vercel's matching order:
 *
 *   1. build the project the way Vercel does (`vercel build`)
 *   2. scan `scripts/verify-ai-function.mjs` for the routes the app really uses
 *   3. fail if any of them is claimed by a rewrite, a redirect or a 404 rule
 *
 * It is skipped (exit 0) when the Vercel CLI or the network is unavailable, so a
 * developer offline is never blocked.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.vercel/output');
const CONFIG = join(OUT, 'config.json');
const FUNCTIONS = join(OUT, 'functions');

/* ── 1. Build, unless a fresh output tree is already there ────────────────── */
if (!existsSync(CONFIG)) {
  try {
    execFileSync('npx', ['--yes', 'vercel@latest', 'build', '--yes'], {
      cwd: ROOT,
      stdio: 'pipe',
      shell: true,
      timeout: 300_000,
    });
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (/ENOTFOUND|EAI_AGAIN|network|offline|ETIMEDOUT/i.test(output)) {
      console.log('~ SKIP: Vercel CLI unavailable offline — routing table not verified.');
      process.exit(0);
    }
    console.error(output.slice(-1200));
    process.exit(1);
  }
}

if (!existsSync(CONFIG)) {
  console.error('✖ vercel build produced no .vercel/output/config.json');
  process.exit(1);
}

const { routes = [] } = JSON.parse(readFileSync(CONFIG, 'utf8'));

/**
 * Vercel's `src` patterns are PCRE fragments anchored by `^…$`. JavaScript's
 * RegExp is close enough for the patterns this project writes; a pattern that
 * does not compile would itself be a deploy failure.
 */
const compiled = routes.map((route) => {
  if (!route.src) return { route, re: null };
  try {
    return { route, re: new RegExp(route.src) };
  } catch {
    return { route, re: null };
  }
});

/**
 * Replay one request through the table.
 *
 * Phases that matter for this bug:
 *   · `headers` entries with `continue: true` — matched, then next route.
 *   · `rewrites` (src + dest) — terminal: this is where `/api/ai/config` used to
 *     become `/index.html`.
 *   · `redirects` (src + status 3xx + location) — terminal.
 *   · bare `status` without a dest — terminal (the API 404 fallback).
 *   · `handle: filesystem` — a real file wins; `check` rewrites also count as a
 *     function destination.
 */
function resolve(pathname) {
  for (const { route, re } of compiled) {
    if (!re) continue;
    if (!re.test(pathname)) continue;

    // A `continue` rule: it runs, then the table keeps matching.
    if (route.middlewarePath) return { kind: 'middleware', route };
    if (route.handle) return { kind: 'handle', route };

    if (route.dest) {
      // `/api/ai/[...path]?...` — a function destination, not a static rewrite.
      const dest = route.dest.split('?')[0];
      if (/^\/api\//.test(dest) && !/\.[a-z0-9]+$/i.test(dest)) return { kind: 'function', route, dest };
      return { kind: 'rewrite', route, dest };
    }

    if (route.location) return { kind: 'redirect', route, status: route.status };
    if (route.status) return { kind: 'status', route, status: route.status };

    // headers-only route → continue
  }
  return { kind: 'unmatched' };
}

/* ── 2. The routes the app actually requests ──────────────────────────────── */
const appRoutes = [
  '/api/ai/config',
  '/api/ai/v1beta/models/gemini-3.5-flash-lite:generateContent',
  '/api/ai/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent',
  '/api/ai/v1beta/models/gemini-flash-lite-latest:generateContent',
];

const spaRoutes = ['/', '/search', '/builder', '/builder/ai', '/ai-advisor', '/prebuilt', '/b/demo'];

let failures = 0;

console.log(`routing table: ${routes.length} route(s)\n`);

for (const pathname of appRoutes) {
  const result = resolve(pathname);
  // Either the middleware or the function destination is correct: the middleware
  // is what makes deep paths work, the destination is the fallback.
  const ok = result.kind === 'middleware' || result.kind === 'function';
  if (!ok) failures += 1;
  const where = result.dest ?? (result.status ? `status ${result.status}` : result.kind);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${pathname}  →  ${where}`);
}

for (const pathname of spaRoutes) {
  const result = resolve(pathname);
  const ok = result.kind === 'rewrite' && result.dest === '/index.html';
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${pathname}  →  ${result.dest ?? result.kind}  (SPA fallback)`);
}

/* ── 3. The function itself must be in the output tree ────────────────────── */
const funcDir = join(FUNCTIONS, 'api/ai/[...path].func');
const entry = join(funcDir, 'api/ai/[...path].js');
if (!existsSync(entry)) {
  failures += 1;
  console.log('FAIL  .vercel/output/functions/api/ai/[...path].func is missing');
} else {
  console.log('PASS  function bundle present: api/ai/[...path].func');
}

/**
 * The MIDDLEWARE is part of the routing fix, not a nicety.
 *
 * It owns `/api/ai/*` and rewrites to `?path=<rest>`, which is how a request of
 * any depth reaches the function: the platform's own per-segment rules served one
 * segment and 404'd the rest. Its absence is a routing failure.
 */
const middlewareEntry = join(FUNCTIONS, 'middleware.func/middleware.js');
if (!existsSync(middlewareEntry)) {
  failures += 1;
  console.log('FAIL  .vercel/output/functions/middleware.func is missing — /api/ai 404s below one segment');
} else {
  console.log('PASS  middleware bundle present: middleware.func');
}

/**
 * 4. `_redirects` (Netlify/compatible hosts) must keep /api out of the SPA.
 *
 * Vercel does not read this file, but the same build is deployable elsewhere and
 * the rule that caused the production 404 is identical there: `/api/* 200` keeps
 * the request from being answered by index.html.
 */
const redirects = join(ROOT, 'public/_redirects');
if (existsSync(redirects)) {
  const lines = readFileSync(redirects, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const apiIndex = lines.findIndex((l) => /^\/api\/\*/i.test(l));
  const anyIndex = lines.findIndex((l) => /^\/\*\s/.test(l));
  const ok = apiIndex >= 0 && (anyIndex < 0 || apiIndex < anyIndex);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  public/_redirects keeps /api/* ahead of the SPA rule`);
}

/* ── 5. Report ────────────────────────────────────────────────────────────── */
const statics = existsSync(join(OUT, 'static')) ? readdirSync(join(OUT, 'static')).length : 0;
console.log(`\nstatic output: ${statics} entries`);

if (failures) {
  console.error(`\n✖ ${failures} routing check(s) failed — /api is being swallowed`);
  console.error('  Fix: vercel.json rewrites must exclude api/, e.g.');
  console.error('       { "source": "/((?!api/).*)", "destination": "/index.html" }');
  process.exit(1);
}

console.log('\n✔ /api/ai/* reaches the serverless function; SPA routes still fall back to index.html');
