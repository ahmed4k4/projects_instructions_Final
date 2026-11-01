import { readFileSync } from 'node:fs';

const key = /^GEMINI_API_KEY=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim();
console.log('key present:', Boolean(key), 'len', key?.length ?? 0);

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// 1) Which models does this key actually expose?
const ac = new AbortController();
const t = setTimeout(() => ac.abort(), 25000);
try {
  const res = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(key)}`, {
    signal: ac.signal,
  });
  const json = await res.json();
  console.log('listModels HTTP', res.status, '| total', json.models?.length ?? 0);
  for (const m of (json.models ?? []).filter((m) =>
    (m.supportedGenerationMethods ?? []).includes('generateContent'),
  )) {
    console.log('  ', m.name.replace('models/', ''));
  }
} catch (e) {
  console.log('ERR', e.name, e.message);
} finally {
  clearTimeout(t);
}
