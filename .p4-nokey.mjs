async function tryModel(model) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Nexus',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 20,
      }),
      signal: ac.signal,
    });
    const txt = await res.text();
    console.log(model.padEnd(50), res.status, txt.slice(0, 130).replace(/\s+/g, ' '));
  } catch (e) {
    console.log(model.padEnd(50), 'ERR', e.name);
  } finally {
    clearTimeout(t);
  }
}

for (const m of ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-lightning:free', 'openrouter/free']) {
  await tryModel(m);
}
