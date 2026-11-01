import { readFileSync } from 'node:fs';

const key = /GEMINI_API_KEY=(.+)/.exec(readFileSync('supabase/.env.local', 'utf8'))[1].trim();
console.log('key len', key.length);

async function probe(model) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }],
          generationConfig: { maxOutputTokens: 20 },
        }),
        signal: ac.signal,
      },
    );
    const txt = await res.text();
    console.log(model.padEnd(22), 'HTTP', res.status, txt.slice(0, 120).replace(/\s+/g, ' '));
  } catch (e) {
    console.log(model.padEnd(22), 'ERR', e.name);
  } finally {
    clearTimeout(t);
  }
}

for (const m of [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-2.5-pro',
]) {
  await probe(m);
}
