# Phase 2 — QA checklist

Run top to bottom. Anything marked **requires deploy** cannot pass until the
migrations and the Edge Function are applied (see the verification report in
`README.md` for what has and has not been executed).

## 0. Prerequisites

```bash
pnpm install
supabase link --project-ref <ref>
supabase db push                 # 003_1, 003_2, 004, 005
supabase secrets set GEMINI_API_KEY=AQ.xxxx
supabase functions deploy gemini-proxy
pnpm dev
```

## 1. Secret hygiene _(no deploy needed)_

- [ ] `grep -r "VITE_GEMINI_API_KEY" src/ .env.example` → **no matches**
- [ ] `pnpm build && grep -r "AIza\|AQ\." dist/assets` → **no matches**
- [ ] Supabase dashboard → Edge Functions → `gemini-proxy` → Secrets shows
      `GEMINI_API_KEY`

## 2. Deterministic engines _(no deploy needed)_

- [ ] `pnpm test` → 79 passing
- [ ] `pnpm test:coverage` → ≥80 % on `lib/compatibility`, `lib/scoring`,
      `lib/performance`
- [ ] `pnpm typecheck` → 0 errors
- [ ] `pnpm lint` → 0 errors / 0 warnings
- [ ] `pnpm build` → clean

## 3. Proxy _(requires deploy)_

```bash
curl -sS -X POST "$URL/functions/v1/gemini-proxy" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "content-type: application/json" -d '{"action":"health"}'
```

- [ ] `health` returns `{"ok":true,"data":{"configured":true,…}}` **(no auth required)**
- [ ] An unauthenticated `generate` call → `401 unauthorized`
- [ ] A signed-in `generate` call returns `{ ok, data: { text, toolCalls } }`
- [ ] With `"stream": true` the response is `text/event-stream` and contains
      `data: {"type":"token",…}` frames
- [ ] **Rate limit:** 21 rapid calls as the same user → the 21st returns
      `429 { code: "rate_limited" }`
- [ ] **Retry:** a 5xx from Gemini is retried once before failing

## 4. Smart Builder _(requires deploy)_

- [ ] `/builder/ai` → complete the 4-step wizard
- [ ] Narration streams into the thinking panel; tool badges appear
      ("Found 6 GPU option(s)", "Compatible (1 warning)")
- [ ] Result: every part exists in the catalogue (no invented IDs), score ring
      fills, totals are real
- [ ] **Hallucination guard:** temporarily break `finalize_build` validation
      (return a fake ID) → one re-prompt, then a fallback build
- [ ] **Fallback:** unset `GEMINI_API_KEY` → the page shows
      _"AI temporarily unavailable — showing a rule-based build"_ and still
      renders a complete build, no crash
- [ ] "Regenerate" is cancellable while running; previous result stays visible
- [ ] "Open in builder" carries the parts into `/builder`

## 5. Advisor _(requires deploy)_

- [ ] Without a build loaded → suggested prompts are general
- [ ] With parts in the builder → prompts switch to build-scoped questions
- [ ] Tokens stream with a visible cursor; **Stop** halts generation
- [ ] Component citations render as chips
- [ ] Rate limit → toast _"Slow down a sec"_
- [ ] Network failure → inline error with **Retry**
- [ ] Signed out → clear "sign in" prompt, no crash

## 6. Build Doctor _(requires deploy)_

- [ ] `/dashboard/builds/:slug/doctor` loads a real build
- [ ] Deterministic upgrades appear even before the AI answers
- [ ] AI verdict, strengths and weaknesses render
- [ ] "Apply" swaps a part and re-diagnoses
- [ ] Invented upgrade IDs are filtered out of the report

## 7. Auth & persistence _(requires deploy)_

- [ ] `/auth` → magic link arrives by email; clicking it signs in and returns
      to `returnTo`
- [ ] Save a build → row in `builds` **and** `build_items`, score/breakdown
      stored
- [ ] `/b/:slug` renders for a signed-out visitor (public RLS read works)
- [ ] A private build returns 404 for a signed-out visitor
- [ ] Publish → `community_builds` row, `builds.is_public` flips to true
- [ ] Rate 1–5 stars → `build_ratings` row, `community_builds.rating_avg`
      updates via trigger
- [ ] Create an alert → row in `saved_alerts`
- [ ] Price-drop trigger (manual):

```sql
-- Simulate the scheduled job that would fire an alert:
update public.components set price = price * 0.85 where id = '<component-uuid>';
insert into public.saved_alerts (user_id, component_id, alert_type, target_price, triggered_at)
values ('<user-uuid>', '<component-uuid>', 'price_drop', 999, now());
```

## 8. Quality gates

- [ ] Zero `console.error` across every flow
- [ ] `prefers-reduced-motion: reduce` → all new animations collapse to
      instant, no spinners stranded
- [ ] Responsive at 375 / 768 / 1440 on `/builder`, `/builder/ai`,
      `/ai-advisor`, doctor
- [ ] Keyboard: wizard is Tab-navigable; Escape closes the command palette

## 9. Known environment caveats

- The local machine has **no Docker, no Supabase CLI, no Deno**. Migrations and
  the Edge Function therefore could not be executed here; they are written and
  reviewed but unverified against a live instance.
- `vitest` is pinned to **v2** because v5 requires Vite 6 (the app is on Vite 5).
