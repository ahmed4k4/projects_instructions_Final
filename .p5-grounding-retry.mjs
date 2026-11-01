import { readFileSync } from 'node:fs';

const key = /^GEMINI_API_KEY=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))[1].trim();
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function run(label, model, tools) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 35000);
  try {
    const res = await fetch(`${BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }],
        ...(tools ? { tools } : {}),
        generationConfig: { maxOutputTokens: 100 },
      }),
      signal: ac.signal,
    });
    const json = await res.json();
    console.log(label.padEnd(34), res.status, (json.error?.message ?? 'ok').slice(0, 110));
  } catch (e) {
    console.log(label.padEnd(34), 'ERR', e.name);
  } finally {
    clearTimeout(t);
  }
}

// Retry with a delay: grounding has its own per-minute budget.
await new Promise((r) => setTimeout(r, 5000));
await run('lite + google_search', 'gemini-3.5-flash-lite', [{ google_search: {} }]);

await new Promise((r) => setTimeout(r, 8000));
await run('lite + googleSearch (camel)', 'gemini-3.5-flash-lite', [{ googleSearch: {} }]);

await new Promise((r) => setTimeout(r, 8000));
await run('lite no tools (control)', 'gemini-3.5-flash-lite', null);
