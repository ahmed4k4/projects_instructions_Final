const BASE = 'http://127.0.0.1:5173/api/gemini/v1beta';

async function streamOnce(model, text, label, timeoutMs = 45000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { maxOutputTokens: 800 },
      }),
      signal: ac.signal,
    });

    if (!res.ok) {
      console.log(label, 'HTTP', res.status, (await res.text()).slice(0, 160));
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let out = '';
    let frames = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.replace(/\r\n/g, '\n').split('\n\n');
      buf = parts.pop() ?? '';
      for (const p of parts) {
        const line = p.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        frames += 1;
        try {
          const j = JSON.parse(line.slice(5).trim());
          for (const part of j.candidates?.[0]?.content?.parts ?? []) {
            if (part.text) out += part.text;
          }
        } catch {}
      }
    }

    console.log(`${label} | ${Date.now() - started}ms | frames=${frames} | chars=${out.length}`);
    console.log('   →', JSON.stringify(out.slice(0, 180)));
  } catch (e) {
    console.log(label, 'ERR', e.name, Date.now() - started, 'ms');
  } finally {
    clearTimeout(timer);
  }
}

await streamOnce('gemini-3.6-flash', 'In one short sentence, is DDR5 worth it over DDR4?', 'EN flash');
await streamOnce('gemini-3.6-flash', 'بجملة قصيرة بالعربية: هل DDR5 أفضل من DDR4؟', 'AR flash');
await streamOnce('gemini-3.8-flash', 'In one short sentence: what does a PSU do?', 'EN pro');
