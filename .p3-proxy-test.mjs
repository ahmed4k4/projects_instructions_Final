const BASE = 'http://127.0.0.1:5173/api/gemini/v1beta';

async function post(path, body) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    await ac; // keep reference
    return res;
  } finally {
    clearTimeout(t);
  }
}

// 1) Non-stream, English
let res = await post('/models/gemini-3.6-flash:generateContent', {
  contents: [{ role: 'user', parts: [{ text: 'Say exactly: PROXY WORKS' }] }],
  generationConfig: { maxOutputTokens: 30 },
});
const txt = await res.text();
console.log('EN non-stream HTTP', res.status, txt.slice(0, 160).replace(/\s+/g, ' '));

// 2) Non-stream, Arabic
res = await post('/models/gemini-3.6-flash:generateContent', {
  contents: [{ role: 'user', parts: [{ text: 'قل بالعربية فقط: مرحبا' }] }],
  generationConfig: { maxOutputTokens: 40 },
});
console.log('AR non-stream HTTP', res.status, (await res.text()).slice(0, 200).replace(/\\n/g, ' '));

// 3) SSE stream
const ac = new AbortController();
const timer = setTimeout(() => ac.abort(), 40000);
res = await fetch(`${BASE}/models/gemini-3.6-flash:streamGenerateContent?alt=sse`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Count 1 to 5.' }] }] }),
  signal: ac.signal,
});
console.log('SSE HTTP', res.status, res.headers.get('content-type'));
const raw = await res.text();
clearTimeout(timer);
console.log('SSE raw length', raw.length, '| has data:', raw.includes('data:'));
console.log('SSE head:', JSON.stringify(raw.slice(0, 220)));
