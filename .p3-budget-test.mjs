const BASE = 'http://127.0.0.1:5173/api/gemini/v1beta';

async function gen(model, text, maxTokens) {
  const res = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
    }),
  });
  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const out = parts
    .map((p) => p.text ?? '')
    .join('')
    .trim();
  return { status: res.status, finish: json.candidates?.[0]?.finishReason, out };
}

const a = await gen('gemini-3.6-flash', 'Reply in one short sentence: is DDR5 worth it over DDR4?', 600);
console.log('EN:', a.status, a.finish, '|', a.out.slice(0, 160));

const b = await gen('gemini-3.6-flash', 'أجب بجملة قصيرة بالعربية: هل DDR5 أفضل من DDR4؟', 600);
console.log('AR:', b.status, b.finish, '|', b.out.slice(0, 200));

const c = await gen('gemini-3.8-flash', 'Reply with exactly: PRO_MODEL_OK', 600);
console.log('PRO:', c.status, c.finish, '|', c.out.slice(0, 80));
