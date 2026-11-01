/**
 * Reproduces / verifies the Gemini function-calling round-trip.
 *
 *   node scripts/probe-function-calling.mjs
 *
 * 1. List models that actually exist for this key.
 * 2. Send a tool-enabled turn, capture the raw `functionCall` parts (including
 *    any `thoughtSignature`).
 * 3. Echo those parts back verbatim with the function responses.
 *    - verbatim  → 200 means the signature was required and preserved
 *    - stripped  → expected 400 "missing a thought_signature"
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const KEY = env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function call(model, body) {
  const res = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

const tools = [
  {
    functionDeclarations: [
      {
        name: 'lookup_gpu',
        description: 'Look up GPUs available at a price ceiling.',
        parameters: {
          type: 'object',
          properties: { maxPrice: { type: 'number' } },
          required: ['maxPrice'],
        },
      },
    ],
  },
];

const first = await call('gemini-3.5-flash-lite', {
  contents: [{ role: 'user', parts: [{ text: 'Find me a GPU under 500 dollars. Use the tool.' }] }],
  tools,
  generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
});

console.log('--- turn 1 ---');
console.log(first.status, first.text.slice(0, 900));

if (first.status !== 200) process.exit(1);

const parts = JSON.parse(first.text).candidates?.[0]?.content?.parts ?? [];
const callPart = parts.find((p) => p.functionCall);
if (!callPart) {
  console.log('no functionCall returned; nothing to verify');
  process.exit(0);
}
console.log('callPart keys:', Object.keys(callPart));

// --- turn 2a: verbatim echo (correct) --------------------------------------
const verbatim = await call('gemini-3.5-flash-lite', {
  contents: [
    { role: 'user', parts: [{ text: 'Find me a GPU under 500 dollars. Use the tool.' }] },
    { role: 'model', parts },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: callPart.functionCall.name,
            response: { result: [{ id: 'gpu-1', name: 'RTX 4060', price: 299 }] },
          },
        },
      ],
    },
  ],
  tools,
  generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
});
console.log('\n--- turn 2 (verbatim model parts) ---');
console.log(verbatim.status, verbatim.text.slice(0, 600));

// --- turn 2b: stripped (the bug) -------------------------------------------
const stripped = parts.map((p) => (p.functionCall ? { functionCall: p.functionCall } : p));
const strippedRes = await call('gemini-3.5-flash-lite', {
  contents: [
    { role: 'user', parts: [{ text: 'Find me a GPU under 500 dollars. Use the tool.' }] },
    { role: 'model', parts: stripped },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: callPart.functionCall.name,
            response: { result: [{ id: 'gpu-1', name: 'RTX 4060', price: 299 }] },
          },
        },
      ],
    },
  ],
  tools,
  generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
});
console.log('\n--- turn 2 (signature stripped) ---');
console.log(strippedRes.status, strippedRes.text.slice(0, 400));
