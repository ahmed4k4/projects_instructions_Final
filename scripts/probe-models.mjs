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

const gen = async (model, body, stream = false) => {
  const started = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent${stream ? '?alt=sse' : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify(body),
  });
  const t = await res.text();
  return { status: res.status, ms: Date.now() - started, t };
};

const models = (
  await (
    await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': KEY },
    })
  ).json()
).models
  .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
  .map((m) => m.name.replace('models/', ''));

console.log('models:', models.join(', '), '\n');

const tools = [
  {
    functionDeclarations: [
      {
        name: 'lookup_gpu',
        description: 'Look up a GPU',
        parameters: { type: 'object', properties: { maxPrice: { type: 'number' } } },
      },
    ],
  },
];

for (const m of ['gemini-1.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash']) {
  const a = await gen(m, {
    contents: [{ role: 'user', parts: [{ text: 'Find a GPU under $500. Use the tool.' }] }],
    tools,
    generationConfig: { maxOutputTokens: 128 },
  });
  const b = await gen(
    m,
    {
      contents: [{ role: 'user', parts: [{ text: 'Say hi in Arabic.' }] }],
      generationConfig: { maxOutputTokens: 64 },
    },
    true,
  );
  let fc = '';
  try {
    fc = a.t.includes('functionCall') ? 'functionCall✓' : 'no-call';
  } catch {}
  console.log(
    `${m.padEnd(24)} tools:${a.status} ${a.ms}ms ${fc} | stream:${b.status} ${b.ms}ms`,
    a.status !== 200 ? a.t.slice(0, 120).replace(/\s+/g, ' ') : '',
  );
}
