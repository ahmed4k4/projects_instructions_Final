import { readFileSync } from 'node:fs';
const route = readFileSync('api/auth/signup.ts', 'utf8');
const hook = readFileSync('src/hooks/useAuth.ts', 'utf8');
const checks = [
  ['signup no longer uses an unbounded Supabase SDK RPC', !/admin\.rpc\('consume_username_signup_slot'/.test(route)],
  ['distributed quota request has a strict sub-second timeout', /consume_username_signup_slot[\s\S]*?\},\s*900\)/.test(route)],
  ['serverless-local signup throttle remains active', /checkLocalRateLimit\(clientIp\)/.test(route)],
  ['admin create-user request is bounded', /\},\s*3_500\)/.test(route)],
  ['password grant is bounded', /\},\s*3_000\)/.test(route)],
  ['signup returns a Supabase session for immediate login', /session:\s*\{\s*access_token:[\s\S]*?refresh_token:/m.test(route)],
  ['duplicate signup can recover by authenticating the existing user', /isDuplicate\(createMessage\)[\s\S]*?auth\/v1\/token\?grant_type=password/.test(route)],
  ['client persists returned session via Supabase setSession', /supabase\.auth\.setSession/.test(hook)],
  ['client no longer makes a second password-grant request after signup', !/signInWithPassword\(\{\s*email: usernameEmail\(normalized\)/.test(hook)],
  ['signup timeout explains not to create a duplicate account', /لا تنشئ حسابًا جديدًا/.test(route)],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
const failed = checks.filter(([, ok]) => !ok);
console.log(`\nSignup resilience checks: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
