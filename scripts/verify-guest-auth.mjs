#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const auth = readFileSync('src/hooks/useAuth.ts', 'utf8');
const page = readFileSync('src/pages/Auth.tsx', 'utf8');
const provider = readFileSync('src/services/ai/providers/geminiProvider.ts', 'utf8');
const route = readFileSync('api/ai/[...path].ts', 'utf8');
const migration = readFileSync('supabase/migrations/014_guest_ai_quota.sql', 'utf8');
const signupRoute = readFileSync('api/auth/signup.ts', 'utf8');
const loginRoute = readFileSync('api/auth/login.ts', 'utf8');
const signupMigration = readFileSync('supabase/migrations/015_username_signup_rate_limit.sql', 'utf8');
const checks = [
  ['username/password login uses deterministic .invalid alias through server endpoint', /api\/auth\/login/.test(auth) && /@accounts\.nexus\.invalid/.test(loginRoute)],
  ['new accounts validate username and persist username metadata', /USERNAME_PATTERN/.test(signupRoute) && /username, login_method: 'username_password'/.test(signupRoute)],
  ['signup uses server-only Supabase Admin REST API without SDK auth.admin typing or email signup', /\/auth\/v1\/admin\/users/.test(signupRoute) && /email_confirm: true/.test(signupRoute) && /SUPABASE_SERVICE_ROLE_KEY/.test(signupRoute) && !/auth\.admin\.createUser/.test(signupRoute) && !/auth\.signUp/.test(auth)],
  ['signup endpoint is protected by server-side service role and origin checks', /SUPABASE_SERVICE_ROLE_KEY/.test(signupRoute) && /Cross-origin requests/.test(signupRoute)],
  ['signup has a bounded local throttle and no blocking quota RPC', /checkLocalRateLimit\(clientIp\)/.test(signupRoute) && !/consume_username_signup_slot/.test(signupRoute) && /grant execute .* to service_role/i.test(signupMigration)],
  ['auth page exposes username and password fields', /id="username"/.test(page) && /id="password"/.test(page)],
  ['username field avoids the incompatible HTML v-mode pattern attribute', !/pattern=/.test(page) && /USERNAME_PATTERN/.test(signupRoute)],
  ['signup route catches unexpected runtime failures and returns JSON', /Unhandled signup failure/.test(signupRoute) && /return json\(500/.test(signupRoute)],
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
