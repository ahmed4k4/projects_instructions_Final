// Check whether OpenRouter / Groq are reachable and what they say without auth.
async function probe(name, url, headers = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  try {
    const res = await fetch(url, { headers, signal: ac.signal });
    const text = await res.text();
    console.log(`${name} -> HTTP ${res.status} | ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
  } catch (e) {
    console.log(`${name} -> ERR ${e.name}`);
  } finally {
    clearTimeout(t);
  }
}

await probe('OpenRouter /models', 'https://openrouter.ai/api/v1/models');
await probe('OpenRouter no-key chat', 'https://openrouter.ai/api/v1/chat/completions', {
  'Content-Type': 'application/json',
});
await probe('Groq /models', 'https://api.groq.com/openai/v1/models');
