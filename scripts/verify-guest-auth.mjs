#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const auth = readFileSync('src/hooks/useAuth.ts', 'utf8');
const page = readFileSync('src/pages/Auth.tsx', 'utf8');
const provider = readFileSync('src/services/ai/providers/geminiProvider.ts', 'utf8');
const route = readFileSync('api/ai/[...path].ts', 'utf8');
const migration = readFileSync('supabase/migrations/014_guest_ai_quota.sql', 'utf8');
const checks = [
  ['username/password login uses deterministic .invalid alias', /@accounts\.nexus\.invalid/.test(auth) && /signInWithPassword/.test(auth)],
  ['new accounts validate username and persist username metadata', /a-z0-9_\.\-/.test(auth) && /username: normalized/.test(auth)],
  ['auth page exposes username and password fields', /id="username"/.test(page) && /id="password"/.test(page)],
  ['auth page explicitly offers guest mode', /Continue as guest|المتابعة كزائر/.test(page)],
  ['AI provider does not require a session', /if \(forceGuest \|\| !supabase\) return \{\};/.test(provider)],
  ['expired account tokens retry as guest', /response.status === 401[\s\S]*?post\(model, req, stream, signal, true\)/.test(provider)],
  ['API applies guest quota when bearer token is absent', /consume_ai_usage_for_guest/.test(route) && /GUEST_RATE_LIMIT = 30/.test(route)],
  ['guest quota RPC is restricted and validates hashed fingerprint', /grant execute .* to anon/i.test(migration) && /p_fingerprint !~ '\^\[a-f0-9\]\+\$'/.test(migration)],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
const failed = checks.filter(([, ok]) => !ok);
console.log(`\nGuest/auth checks: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
