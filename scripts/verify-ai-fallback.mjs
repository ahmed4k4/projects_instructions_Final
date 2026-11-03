import { readFileSync } from 'node:fs';
const proxy = readFileSync('src/server/geminiProxy.ts', 'utf8');
const route = readFileSync('api/ai/[...path].ts', 'utf8');
const config = readFileSync('src/services/ai/config.ts', 'utf8');
const panel = readFileSync('src/components/domain/AIStatusPanel.tsx', 'utf8');
const checks = [
  ['fallback Gemini key can serve as the primary key when primary is absent', /GEMINI_API_KEY_FALLBACK/.test(proxy)],
  ['fallback key is attempted only after primary key returns 429', /upstream\.status !== 429/.test(proxy) && /another Google AI Studio[\s\S]*?project/.test(proxy)],
  ['duplicate same key is not sent twice', /primaryKey !== fallbackKey/.test(route)],
  ['AI config reports whether fallback key is configured without exposing it', /fallbackConfigured/.test(route) && /fallbackConfigured/.test(config)],
  ['AI status panel explains the separate-project requirement', /GEMINI_API_KEY_FALLBACK/.test(panel) && /different Google AI Studio project/.test(panel)],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
const failed = checks.filter(([, ok]) => !ok);
console.log(`\nAI fallback checks: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
