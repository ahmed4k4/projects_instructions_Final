# Nexus PC Builder — Final AI & Guest Access Release

## Delivered changes

- Gemini interactive default remains `gemini-3.5-flash-lite` (Flash-Lite, MINIMAL thinking).
- Fast fallback chain uses `gemini-3.1-flash-lite` and then the stronger Flash option when a model is unavailable.
- First response header timeout is capped at 8 seconds for the primary model; a slow primary is cancelled and the next candidate is tried.
- Advisor context is reduced to six recent messages; build generation is limited to three tool rounds and 1,536 output tokens.
- Streaming remains enabled; independent tool calls are run in parallel.
- AI can be used without a Supabase session. Guests get 30 requests/minute per server-hashed IP; signed-in users get 60/minute. An expired account token is retried as guest.
- `/auth` now supports username/password without real email. Supabase uses a deterministic `@accounts.nexus.invalid` alias; disable Supabase Email `Confirm email` before creating username accounts.
- Account creation/login is optional. Public catalogue, PC building, AI advisor, Smart Builder, search and comparison remain available to guests.
- Added migration `014_guest_ai_quota.sql`, `pnpm verify:guest-auth`, and Arabic setup documentation.

## Checks executed

- AI performance contract: 16/16 passed.
- Guest/auth contract: 8/8 passed.
- Production Vercel AI route harness: 19/19 passed.
- i18n: 1,148 keys across Arabic and English; passed.
- RTL: passed.
- Source reachability: 172 files, zero orphans.
- TypeScript transpile/syntax check: all seven modified TS/TSX files passed.

## Not claimed as verified

The full `pnpm typecheck`, Vitest suite, and production build were not run because this working environment has no `node_modules` and package installation was unavailable. Run them after `pnpm install` before deploying. No live Google AI Studio key or hosted Supabase project was available for an end-to-end external request.

## Deployment steps

1. Apply migration `014_guest_ai_quota.sql` after `013`.
2. For username-only accounts, disable Supabase Dashboard → Authentication → Providers → Email → `Confirm email`. Do this only if the project does not rely on real email confirmation; test separately if existing email accounts exist.
3. Set `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AI_RATE_LIMIT_SALT`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in Vercel.
4. Redeploy and verify `/api/ai/config` returns `ok: true`.
5. Run `pnpm verify:ai-speed`, `pnpm verify:guest-auth`, `pnpm verify:ai-route`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

Google's own RPM/TPM/RPD quotas still apply. Increasing the website's internal per-user limit does not increase the Google project's quota.
