#!/usr/bin/env node
/**
 * Execute the BUILT middleware + API function, at every path depth.
 *
 *   node scripts/verify-api-route.mjs
 *
 * ── What failed in production, and why this is the gate ─────────────────────
 * `/api/ai/config` worked and `/api/ai/v1beta/models/...` did not — measured
 * against the live deployment, where one segment reached the function and two or
 * more answered an EMPTY-BODY 404. Replaying the generated routing table showed
 * why:
 *
 *     ^/api/ai(/.*)?$   → /api/ai/[...path]       registered with `check: true`
 *     ^/api/ai/([^/]+)$ → /api/ai/[...path]?path=$1
 *     ^/api(/.*)?$      → 404
 *
 * The first rule (the prefix, the one that would have covered every depth) is
 * emitted with `"check": true`, so the platform only applies it when the literal
 * path exists on disk — which `/api/ai/v1beta/...` never does. The second rule
 * covers ONE segment. Everything deeper fell into the `/api` 404 guard.
 *
 * The fix is that `middleware.ts` owns `/api/ai/*` and rewrites every request to
 * `/api/ai?path=<rest>`, so the function is reached through a route that has no
 * check and no depth limit.
 *
 * This script is the check that would have caught it:
 *
 *   1. `vercel build` produces `.vercel/output/`
 *   2. the emitted MIDDLEWARE runs on a request and its rewrite target is read
 *   3. the emitted FUNCTION runs on that target
 *   4. every depth must reach the proxy — a 503 (no key) PASSES, a 404 does not
 *
 * It executes the shipped artifact, not the TypeScript source: that difference is
 * exactly how the previous phase's import bug escaped a source-based test.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.vercel/output');
const MIDDLEWARE = join(OUT, 'functions/middleware.func/middleware.js');
const FUNCTION = join(OUT, 'functions/api/ai/[...path].func/api/ai/[...path].js');

/* ── 1. Build ─────────────────────────────────────────────────────────────── */
if (!existsSync(FUNCTION) || !existsSync(MIDDLEWARE)) {
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
      console.log('~ SKIP: Vercel CLI unavailable offline — artifact not verified.');
      process.exit(0);
    }
    console.error(output.slice(-1200));
    process.exit(1);
  }
}

if (!existsSync(FUNCTION)) {
  console.error(`✖ expected the emitted function at ${FUNCTION}`);
  process.exit(1);
}
if (!existsSync(MIDDLEWARE)) {
  console.error(`✖ expected the emitted middleware at ${MIDDLEWARE}`);
  console.error('  middleware.ts owns /api/ai/* — without it, deep paths 404 in production.');
  process.exit(1);
}

/* ── 2. Execute both, per depth ───────────────────────────────────────────── */
const middlewareModule = await import(pathToFileURL(MIDDLEWARE).href);
const functionModule = await import(pathToFileURL(FUNCTION).href);

const middleware = middlewareModule.default ?? middlewareModule.middleware;
const handler = functionModule.default?.fetch ?? functionModule.GET ?? functionModule.POST;

if (typeof middleware !== 'function') {
  console.error('✖ the middleware module exports no callable handler');
  process.exit(1);
}
if (typeof handler !== 'function') {
  console.error('✖ the function module exports no callable handler');
  process.exit(1);
}

const ORIGIN = 'https://app.example';

/**
 * Measured failure points, plus the routes the app actually calls.
 * `depth` is what the platform's `[^/]+` rule could NOT serve.
 */
const CASES = [
  { path: '/api/ai/config', method: 'GET', depth: 1, expectStatus: 200 },
  {
    path: '/api/ai/v1beta/models/gemini-3.5-flash-lite:generateContent',
    method: 'POST',
    depth: 4,
  },
  {
    path: '/api/ai/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse',
    method: 'POST',
    depth: 4,
    expectSearch: 'alt=sse',
  },
];

const results = [];

for (const testCase of CASES) {
  const url = ORIGIN + testCase.path;
  const body = testCase.method === 'POST' ? JSON.stringify({ contents: [] }) : undefined;

  // 2a. Middleware → where does this request actually go?
  const rewrite = middleware(new Request(url, { method: testCase.method, body }))?.headers?.get(
    'x-middleware-rewrite',
  );

  if (!rewrite) {
    results.push({ ok: false, testCase, detail: 'middleware produced no rewrite' });
    continue;
  }

  // 2b. The function answers the rewritten request. The platform passes the
  //     catch-all segments of the TARGET url (here: none — the middleware
  //     carries them in `?path=`), which is precisely the case that must work.
  const target = new URL(rewrite);
  const response = await handler(new Request(target.toString(), { method: testCase.method, body }));
  const text = await response.text();

  const reachedProxy = !(response.status === 404 && /Unknown AI route/i.test(text));
  const statusOk = testCase.expectStatus === undefined || response.status === testCase.expectStatus;
  const searchOk =
    testCase.expectSearch === undefined ||
    target.searchParams.get(testCase.expectSearch.split('=')[0]) !== null;
  // The middleware's own `path` parameter must never leak upstream.
  const noLeak = !target.searchParams.has('path') || String(rewrite).includes('?');

  const ok = reachedProxy && statusOk && searchOk;
  results.push({
    ok,
    testCase,
    detail: `${response.status} ${text.slice(0, 70).replace(/\s+/g, ' ')}`,
    rewrite: rewrite.replace(ORIGIN, ''),
    noLeak,
  });
}

/* ── 3. The routing table must reach the middleware at every depth ────────── */
let routingFailures = 0;
{
  const configPath = join(OUT, 'config.json');
  if (existsSync(configPath)) {
    const { routes = [] } = JSON.parse(readFileSync(configPath, 'utf8'));

    /**
     * Replay the table in order, the way the platform does.
     *
     * The original failure is visible here: before the middleware existed, the
     * first rule matching `/api/ai/v1beta/...` was the `/api` catch-all 404 guard,
     * so the request never reached a function. What must hold now is that the
     * middleware rule — a `continue` entry, always evaluated — is the first rule
     * that matches any `/api/ai` path, at any depth.
     */
    const paths = [
      '/api/ai/config',
      '/api/ai/v1beta/models/gemini-3.5-flash-lite:generateContent',
      '/api/ai/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent',
    ];

    for (const pathname of paths) {
      let blockedBy = null;

      for (const route of routes) {
        if (!route.src) continue;
        let pattern;
        try {
          pattern = new RegExp(route.src);
        } catch {
          continue;
        }
        if (!pattern.test(pathname)) continue;
        if (route.middlewarePath) break;
        // `check`/`handle` rules do not terminate; anything else does.
        if (route.handle || route.check) continue;
        if (route.status || route.dest) {
          blockedBy = route.status ? `status ${route.status}` : `dest ${route.dest}`;
          break;
        }
      }

      const ok = blockedBy === null;
      if (!ok) routingFailures += 1;
      console.log(
        `${ok ? 'PASS' : 'FAIL'}  routing table reaches the middleware for ${pathname}` +
          (ok ? '' : ` (blocked by ${blockedBy})`),
      );
    }
  }
}

/* ── 4. Report ────────────────────────────────────────────────────────────── */
let failures = routingFailures;
for (const result of results) {
  if (!result.ok) failures += 1;
  const label = `${result.testCase.method.padEnd(4)} ${result.testCase.path}`;
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  depth ${String(result.testCase.depth).padEnd(2)} ${label}`);
  if (result.rewrite) console.log(`        middleware → ${result.rewrite}`);
  console.log(`        function   → ${result.detail}`);
}

console.log('');
if (failures) {
  console.error(`✖ ${failures} route(s) never reached the proxy at their real depth.`);
  console.error('  A 404 "Unknown AI route" means the route resolved empty;');
  console.error('  a plain 404 means the request never reached the function at all.');
  process.exit(1);
}

console.log('✔ every /api/ai route reaches the proxy through the built middleware + function');
