# Phase 6 â€” Audit, Cleanup & 3D Overhaul

**Date:** 2026-11-01
**Scope:** blocking AI bug fix, codebase cleanup, 3D hero + motion overhaul, login-wall removal, i18n/RTL completion.

---

## 1. Module 0 â€” The `thought_signature` bug

### Symptom

The AI Advisor and Smart Builder failed with:

```text
400 Bad Request â€” Function call is missing a thought_signature in functionCall parts.
```

### Root cause (reproduced, not guessed)

Gemini attaches an opaque `thoughtSignature` to the `functionCall` part of a model
turn. When a tool loop continues, that signature **must be echoed back verbatim**.
The Phase 5 code rebuilt every model turn from scratch:

| Layer                            | What it did                                   | Signature   |
| -------------------------------- | --------------------------------------------- | ----------- |
| `geminiProvider.parseCandidate`  | kept only `{ name, args }` per `functionCall` | **dropped** |
| `ai/translate.toNeutralMessages` | flattened parts into `ChatMessage[]`          | **dropped** |
| `buildAgent` / `advisorAgent`    | rebuilt `parts` from `ToolCall[]`             | **dropped** |

Reproduced with `scripts/probe-function-calling.mjs` against the live API:

```text
turn 1  ......... 200   (returns functionCall + thoughtSignature)
turn 2 verbatim .. 200   â†گ correct
turn 2 stripped .. 400   Function call is missing a thought_signature in functionCall parts.
```

### Fix

The raw model turn is now carried through the whole stack untouched.

| File                               | Change                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `types/ai.ts`                      | `GeminiContentPart.thoughtSignature`; `ToolCall.thoughtSignature`; `GenerateResult.modelParts`  |
| `ai/providers/geminiProvider.ts`   | `parseCandidate` returns `modelParts`; streaming keeps the signature from the final frame       |
| `ai/providers/types.ts`            | `ChatMessage.parts` â€” raw turns win over rebuilt ones; `StreamResult.modelParts`                |
| `ai/translate.ts`                  | preserves `parts` + `thoughtSignature` in both directions                                       |
| `ai/client.ts`                     | `ChatOutcome.modelParts` plumbed through `generateChat` / `streamChat` / `generateFromContents` |
| `buildAgent.ts`, `advisorAgent.ts` | append `modelTurn(result)` (the provider's raw parts) instead of rebuilding                     |

The hand-built fallback remains only as a guard for callers that have no raw parts.

### Why not the official SDK

The brief suggested `@google/genai` and `chat.sendMessageStream`. The app calls the
REST endpoint through a Vite dev proxy (`/api/gemini`) so `GEMINI_API_KEY` never
enters the bundle â€” swapping in the browser SDK would either publish the key or
force a server rewrite. The invariant the SDK provides (never rebuild a model turn)
is now enforced explicitly, plus a regression test.

### Model pinning â€” measured, not assumed

Probed live against this project's key:

| Model                      | Result                                                                  |
| -------------------------- | ----------------------------------------------------------------------- |
| `gemini-3.5-flash-lite`    | âœ… 200 آ· ~750â€“900 ms آ· streams آ· tools آ· Arabic â€” **pinned as default** |
| `gemini-flash-lite-latest` | âœ… 200 آ· ~890 ms â€” fallback                                             |
| `gemini-3.6-flash`         | âœ… 200 آ· ~975 ms â€” quality tier / fallback                              |
| `gemini-3.5-flash`         | â‌Œ 429 quota exhausted                                                  |
| `gemini-3.8-flash`         | â‌Œ 503 high demand (never interactive) â€” **removed from the chain**     |
| `gemini-1.5-flash`         | â‌Œ **404 retired** on API `v1beta`                                      |

> The brief asked to pin `gemini-1.5-flash`. It no longer exists for this API, so
> pinning it would have broken every request. `gemini-3.5-flash-lite` is the
> working equivalent â€” it is the model that actually answers **with function
> calling**, which was the point of the pin.

### Verification

```text
scripts/verify-function-calling-loop.mjs   4 rounds, signatures preserved, build finalised, 0 أ— 400
scripts/verify-build-generation.mjs        8 rounds, signatures preserved, finalize_build called, 0 أ— 400
src/services/ai/__tests__/thoughtSignature.test.ts   4 unit tests (incl. split-stream frames)
```

---

## 2. Module 1 â€” Cleanup

### Deleted (verified unreachable from every route/entry/test)

| File                           | Why                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `src/components/ui/dialog.tsx` | never imported                                                                       |
| `src/components/ui/tabs.tsx`   | never imported                                                                       |
| `src/hooks/useMediaQuery.ts`   | never imported                                                                       |
| `src/types/index.ts`           | barrel nobody used                                                                   |
| 30 أ— root `.p3-/p4-/p5-*.mjs`  | throwaway phase probes, incl. the only OpenRouter/Groq/Ollama references in the repo |

`scripts/audit-unused.mjs` now walks the real import graph:

```text
Total src files: 114 آ· reachable: 113 آ· orphans: 1
```

The single orphan is `src/vite-env.d.ts` â€” an ambient types file that is never
imported by design.

### Dead code / logs

- Removed: unused `useState` import and dead `glow` motion value in `Magnetic`, the
  `.slice(0, 4)` no-op in `Landing`, the `VITE_USE_SUPABASE_AI` declaration.
- `console.*` in `src/` is down to **2**, both intentional: the error-boundary
  report and the one-time "Supabase not configured" notice in development.

### Consolidation

- One price formatter (`lib/utils.formatCurrency`), now locale-aware.
- One component-name renderer (`components/shared/ComponentName`) + one fallback
  rule (`lib/i18nContent`).
- One share codec (`lib/share`).

### Environment

`.env.example` is exactly `GEMINI_API_KEY`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` (+ an optional `GEMINI_MODEL` override comment). No
OpenRouter, Groq, Ollama or `VITE_USE_SUPABASE_AI` remain anywhere in the repo.

### Supabase null-safety

`supabaseClient.ts` returns `null` without credentials; every service early-returns
(`listComponents â†’ []`, `getComponentById â†’ null`, `getCompatibilityRules â†’ []`).
Verified in-browser: **0 failed network requests, no `sb-*` auth storage** with no
credentials configured.

---

## 3. Module 2 â€” 3D & motion

### Dependencies

`three@0.169`, `@react-three/fiber@8.17`, `@react-three/drei@9.114`
(fiber **v8** â€” v9 requires React 19; this project is on React 18. Verified with
`pnpm peers check`: no unmet peers.)

### `Hero3DScene`

`src/components/scene/Hero3DScene.tsx` â€” lazily imported so Three.js never blocks
first paint:

- Stylised motherboard built from primitives (PCB slab, vertical + horizontal
  traces, chipset heatsinks, CPU socket with glowing die, 4 RAM sticks, 3-fan GPU
  on a riser).
- Neon blue key light + violet rim light + cyan point light inside the chipset.
- Continuous slow Y rotation and a sine "float"; scale/position stay subtle.
- 260-particle point cloud on a spherical shell, tinted to the palette.
- `OrbitControls` with `enableZoom={false} enablePan={false}`, damped and clamped
  to آ±60آ° azimuth / 45â€“86آ° polar so the composition cannot be broken.
- Full collapse to a static frame under `prefers-reduced-motion`.

Progressively tuned against real renders: the first pass had a metallic PCB that
mirrored the environment map into a flat blue slab, and `preset="city"` IBL washed
it to near-white â€” the board is now `roughness 0.88 / metalness 0.15` with `night`
IBL at 0.45, and the glow comes from emissive traces.

### Motion

- **Scroll-linked hero**: `useScroll` + `useSpring` drive the text fade/scale and
  the scene's scale/dim.
- **Magnetic CTAs**: `components/shared/Magnetic` â€” spring-follows the pointer,
  mouse-only, disabled under reduced motion.
- **Staggered reveals** on every list (features, steps, catalogue, builds,
  community).
- **Glassmorphism tiers**: `.glass-card` / `.glass-deep` â€” `blur(40â€“48px)`,
  `ring-1 ring-white/10`, inner bevel highlight, deep drop shadow.
- Prices/numbers use `font-mono` + `tabular-nums` throughout.

---

## 4. Module 3 â€” Login wall removed

| Requirement                    | Status                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `/builder` anonymous           | âœ… never gated                                                                       |
| `/builder/ai` anonymous        | âœ… the `/auth` redirect on _save_ is gone â€” anonymous users get a share link instead |
| `/ai-advisor` anonymous        | âœ…                                                                                   |
| `#b=<payload>` sharing         | âœ… `lz-string` codec in `lib/share.ts`                                               |
| `/dashboard` "Local Workspace" | âœ… banner + sidebar label                                                            |
| Sign-in optional               | âœ… only cloud sync / publishing                                                      |

Payload is narrow by design â€” `{ v, n?, i: {category: id}, q? }` â€” so a link cannot
smuggle arbitrary data; recipients resolve ids against their own catalogue and
unknown parts are reported rather than silently dropped.

---

## 5. Module 4 â€” i18n & RTL

- **762 keys أ— 2 languages**, full EN/AR parity (`scripts/check-i18n.mjs`).
- All pages translated: Landing, Prebuilt, Community, Dashboard, BuildDetail, 404,
  Smart Builder, Auth.
- The i18n _checker_ itself was wrong: it qualified every `t()` with a hardcoded
  `common:` namespace while the runtime merges all files into one namespace. Fixed
  to mirror `src/i18n/index.ts` (only `builder.json` is scoped).
- **Arabic Gemini responses**: `askAdvisor` passes the UI language; the system
  instruction forces Arabic while keeping product names in English, and the user's
  own script wins over the UI language.
- **`007_i18n_content.sql`**: adds nullable `name_ar` / `description_ar`, seeds all
  31 catalogue parts, and is idempotent (`COALESCE`, keyed by
  `(category, brand, model)`). Read through `lib/i18nContent` with EN fallback.

### RTL fixes found by looking at the render

| Bug                                                                 | Fix                                                                                                                                                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Main column sat _under_ the sidebar** (`padding-inline-start: 0`) | Tailwind's `ps-[var(--sidebar-w)]` was silently dropped â€” the logical-property plugin resolves arbitrary values against an empty scale. Added an explicit `.ps-sidebar` utility. |
| `US$1,800` inside Arabic pages                                      | `formatCurrency` was hardcoded to `en-US`; now locale-aware via `setFormatLocale` on `languageChanged`                                                                           |
| Score ring read `100 /`                                             | numeric readout isolated with `dir="ltr"`                                                                                                                                        |
| `$` detached from the budget value                                  | currency glyph isolated with `dir="ltr"`                                                                                                                                         |
| Budget input clipped `$ 1,0â€¦`                                       | field widened `4.5rem â†’ 6.5rem`                                                                                                                                                  |
| Sidebar card clipped                                                | `min-w-0` on both the flex item and its parent                                                                                                                                   |
| Category label clipped                                              | resolved by the RTL padding fix                                                                                                                                                  |

Verified: `dir=rtl`, `lang=ar`, and **`scrollWidth === clientWidth`** (no horizontal
scrollbar) at 1280px.

---

## 6. Bundle impact

| Chunk          | Size                  | Loaded by                          |
| -------------- | --------------------- | ---------------------------------- |
| `three.js`     | 872 KB (~250 KB gzip) | **Landing only** â€” lazily imported |
| `index.js`     | 491 KB                | entry                              |
| `react.js`     | 195 KB                | entry                              |
| `AIAdvisor.js` | 179 KB                | that route only                    |
| `motion.js`    | 124 KB                | entry                              |
| `index.css`    | 112 KB                | entry                              |

Three.js is isolated in `manualChunks`, so `/builder`, `/dashboard` and every other
route never download it. If the 250 KB gzip is too much for the landing page, the
fallback is to render the hero as CSS/WebGL-lite and keep the scene behind a
"view in 3D" button.

## 7. Browser verification (real renders, not assumptions)

Checked in a headless Chromium against the dev server:

| Check                                                             | Result    |
| ----------------------------------------------------------------- | --------- |
| Landing: console errors / failed requests                         | **0 / 0** |
| Landing: 3D canvas mounted, WebGL2 context, non-empty framebuffer | âœ…        |
| Landing: 5 sections laid out correctly                            | âœ…        |
| `/builder/ai` anonymous, no auth redirect                         | âœ…        |
| `/dashboard` anonymous â†’ "Local workspace"                        | âœ…        |
| Supabase unset â†’ no `sb-*` storage, 0 failed requests             | âœ…        |
| RTL (AR): `dir=rtl`, `lang=ar`, `scrollWidth === clientWidth`     | âœ…        |
| RTL: 0 clipped category labels, 0 stray `US$`, `/ 100` intact     | âœ…        |

Bugs found **only** by looking at the render, all fixed:

1. Main column sat under the sidebar (`padding-inline-start: 0`) â€” Tailwind silently
   dropped `lg:ps-[var(--sidebar-w)]`.
2. `US$1,800` on Arabic pages â€” `formatCurrency` was pinned to `en-US`.
3. Score ring read `100 /` in RTL â€” numeric readout now `dir="ltr"`.
4. Budget input clipped `$ 1,0â€¦` â€” widened to `6.5rem`.
5. Sidebar "Local workspace" card truncated â€” missing `min-w-0`.
6. PCB rendered as a flat blue slab â€” metallic material + `city` IBL washed it out.
7. Secret scanner false-positive on the UI help text `GEMINI_API_KEY=your-key` â€”
   rule tightened to require actual key material (unit-checked both ways).

## 8. Acceptance criteria

| Criterion                                        | Result                         |
| ------------------------------------------------ | ------------------------------ |
| `thought_signature` gone, AI streams without 400 | âœ… 8-round tool loop, 0 errors |
| `typecheck` / `lint` / `build`                   | âœ… all exit 0                  |
| Landing has a working 3D scene + particles       | âœ… verified in a real browser  |
| Dead files and unused code deleted               | âœ… 113/114 reachable           |
| Anonymous build + AI chat, no forced login       | âœ…                             |
| All UI strings in Arabic, RTL flawless           | âœ… no horizontal scroll        |
| `docs/AUDIT.md` written                          | âœ… this file                   |

`pnpm test` â†’ **109 passing**.

`pnpm audit:all` â†’ all 8 gates green (typecheck, lint, i18n, RTL, build, secret
scan, dead-code audit, tests).

---

## 9. Follow-ups (not blocking)

1. **`whileInView` content is invisible to static full-page captures.** Real
   scrolling reveals it (verified). If screenshots/print matter, add a
   `prefers-reduced-motion` fallback that renders sections at `opacity: 1`.
2. **`components` rows are seeded by `SEED.sql`; `007` matched 31 parts.** If the
   DB has a 32nd row, it keeps an English name and falls back gracefully.
3. **drei's `Environment preset` fetches an HDR from a CDN** at runtime. If the
   app must work fully offline, vendor the HDR or drop `<Environment>`.
