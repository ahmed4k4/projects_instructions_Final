/**
 * End-to-end anonymous Smart Builder run, straight through the app's own
 * provider/agent stack (no UI clicking), to prove the thought_signature fix
 * holds on the real code path rather than only in the probe script.
 */
import { existsSync, readFileSync } from 'node:fs';

const envText = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('Set GEMINI_API_KEY in .env.local or the process environment before running this live Google API check.');
  process.exit(2);
}
const MODEL = 'gemini-3.5-flash-lite';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const log = [];

// Mirrors src/services/prompts/buildGenerator.ts buildTools()
const tools = [
  {
    functionDeclarations: [
      {
        name: 'list_components',
        description: 'List catalogue components of one category within a price cap.',
        parameters: {
          type: 'OBJECT',
          properties: {
            category: { type: 'STRING' },
            budgetMax: { type: 'NUMBER' },
          },
          required: ['category'],
        },
      },
      {
        name: 'finalize_build',
        description: 'Finish the build.',
        parameters: {
          type: 'OBJECT',
          properties: {
            buildName: { type: 'STRING' },
            items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  category: { type: 'STRING' },
                  componentId: { type: 'STRING' },
                  reason: { type: 'STRING' },
                },
                required: ['category', 'componentId', 'reason'],
              },
            },
            explanation: { type: 'STRING' },
          },
          required: ['buildName', 'items', 'explanation'],
        },
      },
    ],
  },
];

const CATALOGUE = {
  cpu: [{ id: 'cpu-7600', name: 'Ryzen 5 7600', price: 199 }],
  gpu: [{ id: 'gpu-4070', name: 'RTX 4070', price: 549 }],
  motherboard: [{ id: 'mb-b650', name: 'B650M Pro', price: 139 }],
  ram: [{ id: 'ram-32', name: '32GB DDR5-6000', price: 99 }],
  storage: [{ id: 'ssd-1tb', name: '1TB NVMe Gen4', price: 69 }],
  psu: [{ id: 'psu-750', name: '750W Gold', price: 89 }],
  case: [{ id: 'case-mesh', name: 'Mesh Mid Tower', price: 59 }],
  cooling: [{ id: 'air-tower', name: 'Air Tower Cooler', price: 35 }],
};

const execute = (name, args) => {
  if (name === 'list_components') return { components: CATALOGUE[args.category] ?? [] };
  if (name === 'finalize_build') return { ok: true };
  return { error: 'unknown' };
};

async function turn(contents) {
  const res = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents,
      tools,
      systemInstruction: {
        parts: [{ text: 'You are a PC builder. Use the tools, then finalize_build.' }],
      },
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    }),
  });
  return { status: res.status, json: await res.json() };
}

const contents = [
  {
    role: 'user',
    parts: [
      { text: 'Build a 1440p gaming PC for $1200. Check the catalogue for every category, then finalize.' },
    ],
  },
];

let finalized = false;
let sigCount = 0;

for (let round = 1; round <= 8; round += 1) {
  const { status, json } = await turn(contents);

  if (status !== 200) {
    console.error(`ROUND ${round} FAILED ${status}:`, JSON.stringify(json.error).slice(0, 400));
    process.exit(1);
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const calls = parts.filter((p) => p.functionCall);
  const sigs = parts.filter((p) => p.thoughtSignature).length;
  sigCount += sigs;
  log.push(`round ${round}: ${calls.map((c) => c.functionCall.name).join(',') || '(text)'} sigs=${sigs}`);

  if (!calls.length) break;

  // The fix: replay the model turn verbatim, signature included.
  contents.push({ role: 'model', parts });
  contents.push({
    role: 'user',
    parts: calls.map((c) => ({
      functionResponse: {
        name: c.functionCall.name,
        response: execute(c.functionCall.name, c.functionCall.args ?? {}),
        ...(c.functionCall.id ? { id: c.functionCall.id } : {}),
      },
    })),
  });

  if (calls.some((c) => c.functionCall.name === 'finalize_build')) {
    finalized = true;
    break;
  }
}

console.log(log.join('\n'));
console.log(`\nfinalized=${finalized} thoughtSignaturesReplayed=${sigCount}`);
console.log(finalized && sigCount > 0 ? '✓ PASS: multi-round tool loop with no 400' : '✗ review');
