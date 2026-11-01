/**
 * End-to-end verification of the thought_signature fix.
 *
 *   node scripts/verify-function-calling-loop.mjs
 *
 * Runs a realistic 2-round tool loop the way buildAgent/advisorAgent now do it:
 *   turn N  → raw functionCall parts captured verbatim (thoughtSignature kept)
 *   turn N+1 → those parts replayed untouched + functionResponse parts
 * Any dropped signature surfaces as 400 and fails the run.
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
const MODEL = 'gemini-3.5-flash-lite';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const tools = [
  {
    functionDeclarations: [
      {
        name: 'list_components',
        description:
          'List PC components of one category from the catalogue. Bulk and gaming catalogs supported.',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'gpu, cpu, motherboard, ram, storage, psu, case, cooler',
            },
            maxPrice: { type: 'number' },
          },
          required: ['category'],
        },
      },
      {
        name: 'finalize_build',
        description: 'Finish the build with the chosen component IDs.',
        parameters: {
          type: 'object',
          properties: {
            buildName: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  componentId: { type: 'string' },
                  reason: { type: 'string' },
                },
                required: ['category', 'componentId', 'reason'],
              },
            },
            explanation: { type: 'string' },
          },
          required: ['buildName', 'items', 'explanation'],
        },
      },
    ],
  },
];

const CATALOGUE = {
  gpu: [{ id: 'gpu-4060', name: 'GeForce RTX 4060 8GB', price: 299 }],
  cpu: [{ id: 'cpu-7600', name: 'Ryzen 5 7600', price: 199 }],
  motherboard: [{ id: 'mb-b650', name: 'B650M Pro', price: 139 }],
  ram: [{ id: 'ram-32-6000', name: '32GB DDR5-6000 CL30', price: 99 }],
  storage: [{ id: 'ssd-1tb', name: '1TB NVMe Gen4', price: 69 }],
  psu: [{ id: 'psu-650', name: '650W Gold', price: 79 }],
  case: [{ id: 'case-mesh', name: 'Mesh Mid Tower', price: 59 }],
  cooler: [{ id: 'air-tower', name: 'Air Tower Cooler', price: 35 }],
};

function executeTool(name, args) {
  if (name === 'list_components') return { components: CATALOGUE[args.category] ?? [] };
  if (name === 'finalize_build') return { ok: true, accepted: args.items?.length ?? 0 };
  return { error: `unknown tool ${name}` };
}

async function send(contents) {
  const started = Date.now();
  const res = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents,
      tools,
      systemInstruction: {
        parts: [{ text: 'You are a PC building assistant. Use tools. Be brief.' }],
      },
      generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
    }),
  });
  const json = await res.json();
  return { status: res.status, json, ms: Date.now() - started };
}

const contents = [
  {
    role: 'user',
    parts: [{ text: 'Build me a gaming PC under $1000. Check the catalogue, then finalize.' }],
  },
];

let rounds = 0;
let signaturesSeen = 0;

for (let i = 0; i < 6; i += 1) {
  const { status, json, ms } = await send(contents);
  rounds += 1;

  if (status !== 200) {
    console.error(`\n✗ ROUND ${rounds} FAILED: ${status}`);
    console.error(JSON.stringify(json.error, null, 2).slice(0, 600));
    process.exit(1);
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const calls = parts.filter((p) => p.functionCall);
  const texts = parts.filter((p) => p.text).map((p) => p.text);
  signaturesSeen += parts.filter((p) => p.thoughtSignature).length;

  console.log(
    `round ${rounds}: ${ms}ms · calls=[${calls.map((c) => c.functionCall.name).join(', ') || '-'}] · sigs=${parts.filter((p) => p.thoughtSignature).length}`,
  );
  if (texts.length) console.log('   text:', texts.join(' ').slice(0, 160));

  if (!calls.length) {
    console.log('\n✓ loop completed without a 400');
    console.log(`  rounds=${rounds}  thoughtSignatures preserved=${signaturesSeen}`);
    process.exit(0);
  }

  // === the fix: replay the model turn VERBATIM ===
  contents.push({ role: 'model', parts });

  contents.push({
    role: 'user',
    parts: calls.map((c) => ({
      functionResponse: {
        name: c.functionCall.name,
        response: executeTool(c.functionCall.name, c.functionCall.args ?? {}),
      },
    })),
  });
}

console.log('\n✓ no failure across 6 rounds (loop hit the round cap)');
console.log(`  thoughtSignatures preserved=${signaturesSeen}`);
