import { readFileSync } from 'node:fs';
const route = readFileSync('api/auth/signup.ts', 'utf8');
const login = readFileSync('api/auth/login.ts', 'utf8');
const hook = readFileSync('src/hooks/useAuth.ts', 'utf8');
const vercel = readFileSync('vercel.json', 'utf8');
const health = readFileSync('api/auth/health.ts', 'utf8');
const checks = [
  ['signup uses Vercel Web Standard fetch entry point', /export default\s*\{\s*async fetch\(request: Request\)/.test(route)],
  ['signup avoids an additional database RPC in the critical path', !/consume_username_signup_slot/.test(route)],
  ['local signup abuse throttle remains active', /checkLocalRateLimit\(clientIp\)/.test(route)],
  ['admin create-user request has a bounded 12 second timeout', /\},\s*12_000\)/.test(route)],
  ['signup password grant has a bounded 10 second timeout', /\},\s*10_000\)/.test(route)],
  ['signup returns access and refresh tokens', /session:\s*\{\s*access_token:[\s\S]*?refresh_token:/m.test(route)],
  ['duplicate signup attempts to recover the existing session', /isDuplicate\(createMessage\)[\s\S]*?auth\/v1\/token\?grant_type=password/.test(route)],
  ['login uses the same synthetic username email alias', /@accounts\.nexus\.invalid/.test(login)],
  ['login is server-proxied and returns a regular Supabase session', /auth\/v1\/token\?grant_type=password/.test(login) && /access_token/.test(login) && /refresh_token/.test(login)],
  ['client persists both signup and login sessions with setSession', /supabase\.auth\.setSession/.test(hook)],
  ['client login calls the server login endpoint', /api\/auth\/login/.test(hook)],
  ['auth routes emit request IDs and stage diagnostics', /requestId/.test(route) && /requestId/.test(login) && /password_grant_rejected/.test(login)],
  ['safe auth health endpoint exposes readiness without secret values', /signupReady/.test(health) && /loginReady/.test(health) && !/SERVICE_ROLE_KEY\s*:\s*serviceRoleKey/.test(health)],
  ['Vercel auth function budgets are configured', /api\/auth\/signup\.ts[\s\S]*?maxDuration": 30/.test(vercel) && /api\/auth\/login\.ts[\s\S]*?maxDuration": 20/.test(vercel)],
  ['signup timeout warns against creating a duplicate account', /لا تنشئ حسابًا جديدًا/.test(route)],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
const failed = checks.filter(([, ok]) => !ok);
console.log(`\nSignup/auth checks: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
