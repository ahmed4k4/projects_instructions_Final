#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseGoogleApiError } from '../src/services/ai/providers/googleError.ts';
import { handleAiRoute } from '../src/server/geminiProxy.ts';

const doctor = await readFile(new URL('../src/services/buildDoctor.ts', import.meta.url), 'utf8');
const provider = await readFile(new URL('../src/services/ai/providers/geminiProvider.ts', import.meta.url), 'utf8');
const proxy = await readFile(new URL('../src/server/geminiProxy.ts', import.meta.url), 'utf8');
const client = await readFile(new URL('../src/services/ai/client.ts', import.meta.url), 'utf8');
const buildAgent = await readFile(new URL('../src/services/buildAgent.ts', import.meta.url), 'utf8');
const models = await readFile(new URL('../src/services/ai/models.ts', import.meta.url), 'utf8');
const aiClient = await readFile(new URL('../src/services/ai/client.ts', import.meta.url), 'utf8');

assert.match(doctor, /return await getCompatibilityRules\(\)/, 'Build Doctor must consume the already-normalised domain rules');
assert.doesNotMatch(doctor, /r\.(rule_key|category_a|category_b|rule_type|spec_path_a|spec_path_b)/, 'Build Doctor must not read DB snake_case fields from CompatibilityRule');

const quota = parseGoogleApiError({
  error: {
    message: 'You exceeded your current quota. Please check your plan and billing details.',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '32s' },
      { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [
        { quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaDimensions: { model: 'gemini-3.5-flash-lite', location: 'global' } },
      ] },
    ],
  },
});
assert.equal(quota.status, 'RESOURCE_EXHAUSTED');
assert.equal(quota.retryAfterSeconds, 32);
assert.match(quota.message, /exceeded your current quota/);
assert.match(quota.quotaLabels[0], /gemini-3.5-flash-lite/);
assert.equal(parseGoogleApiError({ retryAfterSeconds: 60, error: { message: 'AI limit reached' } }).retryAfterSeconds, 60);
assert.equal(parseGoogleApiError({ error: { message: 'slow down' } }, '12').retryAfterSeconds, 12);

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'quota exhausted', status: 'RESOURCE_EXHAUSTED' } }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '27' },
  });
  const proxied429 = await handleAiRoute(
    { route: 'v1beta/models/gemini-3.8-flash:generateContent', search: '', method: 'POST', body: '{}' },
    { configured: true, model: 'gemini-3.8-flash' },
    'not-a-real-key-used-by-mock-fetch',
  );
  assert.equal(proxied429.status, 429);
  assert.equal(proxied429.headers['Retry-After'], '27');
  assert.equal(proxied429.headers['X-AI-Upstream'], 'google');
} finally {
  globalThis.fetch = originalFetch;
}

assert.match(provider, /\[404, 503\]\.includes\(response\.status\)/, '429 must not trigger model rotation');
assert.doesNotMatch(provider, /\[404, 429, 503\]\.includes/, '429 must not trigger model rotation');
assert.match(provider, /Google Gemini API rate limit\/quota reached:/, 'Google rate limits must be distinguished from site limits');
assert.match(proxy, /'Retry-After': upstream\.headers\.get\('retry-after'\)/, 'Retry-After must pass through the proxy');
assert.match(client, /error\.message \|\| i18n\.t\('advisor\.errors\.quota'\)/, 'the provider message must survive AIError conversion');
assert.match(buildAgent, /error\.message/, 'Smart Builder fallback must display the original quota reason');
assert.match(buildAgent, /MAX_TOOL_ROUNDS = 4/, 'Smart Builder should be bounded to four tool turns');
assert.match(models, /result === 'rate_limited'[\s\S]*?rateLimited: true/, 'model probes must stop on quota exhaustion');
assert.match(aiClient, /return 'rate_limited'/, 'connection diagnostics must preserve a 429 without probing fallback models');

console.log('PASS: Build Doctor uses normalized CompatibilityRule fields');
console.log('PASS: Google quota messages, model dimensions and retry delays are parsed');
console.log('PASS: Google 429 no longer triggers a burst of fallback model requests');
console.log('PASS: Retry-After and the upstream explanation reach the user');
console.log('PASS: Gemini proxy preserves upstream 429 and Retry-After headers');
console.log('PASS: Smart Builder keeps a bounded tool loop');
console.log('PASS: AI connection test stops after its first quota response');
console.log('7/7 TypeScript + Gemini quota regression groups passed.');
