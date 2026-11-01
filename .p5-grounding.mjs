import { readFileSync } from 'node:fs';

const key = /^GEMINI_API_KEY=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))[1].trim();
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-3.5-flash-lite';

// 1) Grounding via Google Search
{
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 40000);
  try {
    const res = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: 'What is the current retail price of an RTX 4070 in USD?' }] },
        ],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 300 },
      }),
      signal: ac.signal,
    });
    const json = await res.json();
    const c = json.candidates?.[0];
    const text = (c?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const gm = c?.groundingMetadata;
    console.log('GROUNDING HTTP', res.status);
    console.log('  text:', text.slice(0, 180).replace(/\s+/g, ' '));
    console.log('  groundingMetadata:', gm ? 'present' : 'absent');
    if (gm) {
      console.log('  queries:', gm.webSearchQueries);
      console.log('  chunks:', gm.groundingChunks?.length ?? 0);
      console.log('  sources:', (gm.groundingChunks ?? []).map((x) => x.web?.uri).slice(0, 3));
    }
  } catch (e) {
    console.log('GROUNDING ERR', e.name);
  } finally {
    clearTimeout(t);
  }
}

// 2) Streaming + Arabic
{
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 40000);
  try {
    const res = await fetch(
      `${BASE}/models/${MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'بجملة قصيرة بالعربية: ما وظيفة مزوّد الطاقة؟' }] }],
          generationConfig: { maxOutputTokens: 300 },
        }),
        signal: ac.signal,
      },
    );
    console.log('\nSTREAM HTTP', res.status, res.headers.get('content-type'));
    const raw = await res.text();
    let out = '';
    let frames = 0;
    for (const part of raw.replace(/\r\n/g, '\n').split('\n\n')) {
      const line = part.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      frames++;
      try {
        const j = JSON.parse(line.slice(5).trim());
        for (const p of j.candidates?.[0]?.content?.parts ?? []) if (p.text) out += p.text;
      } catch {}
    }
    console.log('  frames:', frames, '| chars:', out.length);
    console.log('  AR out:', out.slice(0, 160));
  } catch (e) {
    console.log('STREAM ERR', e.name);
  } finally {
    clearTimeout(t);
  }
}
