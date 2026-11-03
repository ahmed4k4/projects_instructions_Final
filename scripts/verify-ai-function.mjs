#!/usr/bin/env node
/**
 * Prove the production AI route before deploying.
 *
 * The Phase 10 bug was that `/api/ai/config` — and every model call — only
 * existed in the Vite dev server, so Vercel answered 404. This gate loads the
 * actual Serverless Function module (`api/ai/[...path].ts`) and calls it with a
 * Web `Request`, exactly as Vercel does, checking:
 *
 *   1. The exported Web Standard `default.fetch` handler exists
 *   2. GET /api/ai/config answers without leaking secrets
 *   3. Unknown models/routes, missing keys, and invalid content types are refused
 *   4. Guest calls use a server-side IP-hash quota; signed-in users get a higher personal quota
 *   5. Cross-origin requests are rejected and OPTIONS stays same-origin
 *
 * The test never calls Google or Supabase; environment values and the Supabase
 * client are mocked, so no real keys or quota are consumed.
 *
 * Usage: node scripts/verify-ai-function.mjs
 */
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Tests use dummy values only and never send requests to Google.
process.env.GEMINI_API_KEY = 'test-key-not-real';
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key-not-real';

// Vercel resolves TypeScript; local Node needs a hook. `tsx`/`ts-node` are not
// dependencies here, so use Node's built-in type stripping (Node >= 22.6).
const supportsStrip = process.features?.typescript;
if (!supportsStrip) {
  console.log('~ Native TypeScript stripping is not reported by this Node build; run with --experimental-strip-types.');
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

/**
 * Load the function the way VERCEL loads it.
 *
 * The source imports `../../src/server/geminiProxy.js` — correct for Vercel,
 * whose ESM runtime resolves the compiled `.js`. In this repo only the `.ts`
 * exists, so `scripts/lib/esm-ts-resolve.mjs` maps `.js` -> `.ts` exactly as
 * TypeScript's resolver does. Without it the harness reports a load failure that
 * production does not have.
 */
let handler;
try {
  const { register } = await import('node:module');
  const hook = new URL('./lib/esm-ts-resolve.mjs', import.meta.url).href;
  register(hook, import.meta.url);

  handler = await import(pathToFileURL(`${ROOT}api/ai/[...path].ts`).href);
  if (typeof handler.default?.fetch !== 'function') throw new Error('default.fetch Web Standard export is missing');
} catch (error) {
  console.error(`✖ could not load api/ai/[...path].ts: ${error.message}`);
  process.exit(1);
}

const call = (route, init = {}) => {
  const url = `https://nexus.example/api/ai/${route}`;
  return handler.default.fetch(new Request(url, init));
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
  check('Vercel Web Standard default.fetch export is present', typeof handler.default?.fetch === 'function');
  check(
    'config reports a boolean, never the key',
    typeof json?.gemini === 'boolean' && !text.includes('AIza'),
  );
}

/* 2 — unknown route --------------------------------------------------------- */
{
  const res = await call('v1beta/models/x:deleteModel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('non-generative routes are refused with 404', res.status === 404, `status ${res.status}`);
}

/* 2b — supported model routes ---------------------------------------------- */
for (const model of ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.6-flash']) {
  const res = await call(`v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] }),
  });
  check(`${model} route is accepted by the production proxy`, res.status === 503, `status ${res.status}`);
}

/* 3 — missing key ----------------------------------------------------------- */
{
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const previousGoogleKey = process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  const res = await call('v1beta/models/gemini-3.5-flash-lite:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }),
  });
  if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previousGeminiKey;
  if (previousGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
  else process.env.GOOGLE_API_KEY = previousGoogleKey;
  const body = await res.json().catch(() => ({}));
  check(
    'missing GEMINI_API_KEY → 503 with guidance',
    res.status === 503 && /GEMINI_API_KEY/.test(body?.error?.message ?? ''),
    `status ${res.status}`,
  );
}

/* 4 — request validation --------------------------------------------------- */
{
  const wrongContentType = await call('v1beta/models/gemini-3.5-flash-lite:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: '{}',
  });
  check('model endpoint rejects non-JSON bodies', wrongContentType.status === 415);

  const oversized = await call('v1beta/models/gemini-3.5-flash-lite:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(3 * 1024 * 1024) },
    body: '{}',
  });
  check('model endpoint enforces request-size limits', oversized.status === 413);
}

/* 5 — guest access and same-origin policy -------------------------------- */
{
  const res = await call('v1beta/models/gemini-3.5-flash-lite:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }),
  });
  const body = await res.json().catch(() => ({}));
  check('guest AI request is not rejected for missing login', res.status === 503 && /quota|Supabase/i.test(body?.error?.message ?? ''));

  const crossOrigin = await call('config', {
    method: 'GET',
    headers: { Origin: 'https://attacker.example' },
  });
  check('cross-origin API calls are rejected', crossOrigin.status === 403);
}

/* 6 — preflight -------------------------------------------------------------- */
{
  const res = await call('config', { method: 'OPTIONS' });
  check('OPTIONS preflight returns 204 without wildcard CORS', res.status === 204 && !res.headers.has('access-control-allow-origin'));
}

/* 7 — authenticated happy path uses exactly one Supabase RPC ---------------- */
{
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/rest/v1/rpc/consume_ai_usage_for_current_user') || url.includes('/rest/v1/rpc/consume_ai_usage_for_guest')) {
      return Response.json([{ allowed: true, remaining: 59 }]);
    }
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      return Response.json({ candidates: [{ content: { parts: [{ text: 'fast reply' }] } }] });
    }
    return new Response('unexpected URL', { status: 500 });
  };
  try {
    const guest = await call('v1beta/models/gemini-3.5-flash-lite:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'guest ping' }] }] }),
    });
    check('guest request reaches Gemini after guest quota RPC', guest.status === 200, `status ${guest.status}`);
    check('guest quota uses a hashed fingerprint and no login token', calls.some((item) => item.url.includes('consume_ai_usage_for_guest') && /p_fingerprint/.test(String(item.init.body))));
    calls.length = 0;
    const res = await call('v1beta/models/gemini-3.5-flash-lite:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-signed-in-user-token' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] }),
    });
    const body = await res.json().catch(() => ({}));
    const rpcCalls = calls.filter((item) => item.url.includes('/rest/v1/rpc/consume_ai_usage_for_current_user'));
    const authCalls = calls.filter((item) => item.url.includes('/auth/v1/user'));
    check('authenticated request reaches Gemini successfully', res.status === 200 && body?.candidates?.[0]?.content?.parts?.[0]?.text === 'fast reply', `status ${res.status}`);
    check('authorization + quota consume use one Supabase round trip', rpcCalls.length === 1 && authCalls.length === 0, `rpc ${rpcCalls.length}, auth ${authCalls.length}`);
    check('quota RPC receives the signed-in JWT and no caller-supplied user id', rpcCalls.length === 1 && rpcCalls[0].init.headers.Authorization === 'Bearer test-signed-in-user-token' && !String(rpcCalls[0].init.body).includes('p_user_id'));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const failed = results.filter((r) => !r.ok).length;
if (failed) {
  console.error(`\n${failed} AI-route check(s) failed`);
  process.exit(1);
}
console.log(`\nAI route verified — ${results.length} checks passed`);
