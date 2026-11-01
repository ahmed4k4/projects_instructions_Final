import { readFileSync } from 'node:fs';

const key = /^GEMINI_API_KEY=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))[1].trim();
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function tryModel(model, withGrounding = false) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 40000);
  const started = Date.now();
  try {
    const body = {
      contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }],
      generationConfig: { maxOutputTokens: 200 },
    };
    if (withGrounding) body.tools = [{ google_search: {} }];

    const res = await fetch(`${BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const json = await res.json();
    if (!res.ok) {
      console.log(model.padEnd(26), res.status, (json.error?.message ?? '').slice(0, 90));
      return;
    }
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    const grounding = json.candidates?.[0]?.groundingMetadata;
    console.log(
      model.padEnd(26),
      'OK',
      `${Date.now() - started}ms`,
      '| len=' + text.length,
      withGrounding ? '| grounding=' + (grounding ? 'yes' : 'no') : '',
    );
  } catch (e) {
    console.log(model.padEnd(26), 'ERR', e.name, Date.now() - started + 'ms');
  } finally {
    clearTimeout(t);
  }
}

for (const m of ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash']) {
  await tryModel(m);
}
