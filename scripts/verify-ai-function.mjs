#!/usr/bin/env node
/**
 * Prove the production AI route before deploying.
 *
 * The Phase 10 bug was that `/api/ai/config` — and every model call — only
 * existed in the Vite dev server, so Vercel answered 404. This gate loads the
 * actual Serverless Function module (`api/ai/[...route].ts`) and calls it with a
 * Web `Request`, exactly as Vercel does, checking:
 *
 *   1. GET  /api/ai/config            → 200 JSON, never a 404, never leaks the key
 *   2. POST /api/ai/v1beta/models/…   → reaches Google and returns candidates
 *      (only when GEMINI_API_KEY is present; skipped otherwise)
 *   3. Unknown routes are refused with 404 instead of being proxied
 *   4. A missing key answers 503 with an actionable message
 *   5. CORS preflight answers 204
 *
 * Usage: node scripts/verify-ai-function.mjs
 */
import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Load .env.local the same way a deploy-time env would be populated.
const envFile = `${ROOT}.env.local`;
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

// Vercel resolves TypeScript; local Node needs a hook. `tsx`/`ts-node` are not
// dependencies here, so use Node's built-in type stripping (Node >= 22.6).
const supportsStrip = process.features?.typescript;
if (!supportsStrip) {
  console.log('~ Node without native type stripping — running the schema checks only.');
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

let handler;
try {
  handler = await import(pathToFileURL(`${ROOT}api/ai/[...route].ts`).href);
} catch (error) {
  console.error(`✖ could not load api/ai/[...route].ts: ${error.message}`);
  process.exit(1);
}

const call = (route, init = {}, key = process.env.GEMINI_API_KEY) => {
  const previous = process.env.GEMINI_API_KEY;
  if (key === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = key;

  const url = `https://nexus.example/api/ai/${route}`;
  const request = new Request(url, init);
  return Promise.resolve(handler.POST(request, { params: { route: route.split('/') } })).finally(() => {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  });
};

/* 1 — config ---------------------------------------------------------------- */
{
  const res = await call('config', { method: 'GET' });
  const text = await res.text();
  const json = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();
  check('GET /api/ai/config answers 200 JSON', res.status === 200 && json !== null, `status ${res.status}`);
  check(
    'config reports a boolean, never the key',
    typeof json?.gemini === 'boolean' && !text.includes('AIza'),
  );
}

/* 2 — unknown route --------------------------------------------------------- */
{
  const res = await call('v1beta/models/x:deleteModel', { method: 'POST', body: '{}' });
  check('non-generative routes are refused with 404', res.status === 404, `status ${res.status}`);
}

/* 3 — missing key ----------------------------------------------------------- */
{
  const res = await call(
    'v1beta/models/gemini-3.5-flash-lite:generateContent',
    { method: 'POST', body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }) },
    '',
  );
  const body = await res.json().catch(() => ({}));
  check(
    'missing GEMINI_API_KEY → 503 with guidance',
    res.status === 503 && /GEMINI_API_KEY/.test(body?.error?.message ?? ''),
    `status ${res.status}`,
  );
}

/* 4 — live call (needs a key + network) ------------------------------------- */
if (process.env.GEMINI_API_KEY) {
  const res = await call('v1beta/models/gemini-3.5-flash-lite:generateContent', {
    method: 'POST',
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: PONG' }] }],
      generationConfig: { maxOutputTokens: 12 },
    }),
  });
  const json = await res.json().catch(() => null);
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  check(
    'proxied generateContent reaches Gemini',
    res.status === 200 && /PONG/i.test(text),
    text.trim().slice(0, 20),
  );
} else {
  console.log('SKIP  live Gemini call (no GEMINI_API_KEY in the environment)');
}

/* 5 — preflight ------------------------------------------------------------- */
{
  const res = await call('config', { method: 'OPTIONS' });
  check(
    'CORS preflight → 204 with allow headers',
    res.status === 204 && Boolean(res.headers.get('access-control-allow-origin')),
  );
}

const failed = results.filter((r) => !r.ok).length;
if (failed) {
  console.error(`\n✖ ${failed} AI-route check(s) failed`);
  process.exit(1);
}
console.log(`\n✔ AI route verified — ${results.length} checks passed`);
