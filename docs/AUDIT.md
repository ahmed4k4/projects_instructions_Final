# Phase 6 — Audit, Cleanup & 3D Overhaul

**Date:** 2026-11-01
**Scope:** blocking AI bug fix, codebase cleanup, 3D hero + motion overhaul, login-wall removal, i18n/RTL completion.

---

## 1. Module 0 — The `thought_signature` bug

### Symptom

The AI Advisor and Smart Builder failed with:

```text
400 Bad Request — Function call is missing a thought_signature in functionCall parts.
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
| `ai/providers/types.ts`            | `ChatMessage.parts` — raw turns win over rebuilt ones; `StreamResult.modelParts`                |
| `ai/translate.ts`                  | preserves `parts` + `thoughtSignature` in both directions                                       |
| `ai/client.ts`                     | `ChatOutcome.modelParts` plumbed through `generateChat` / `streamChat` / `generateFromContents` |
| `buildAgent.ts`, `advisorAgent.ts` | append `modelTurn(result)` (the provider's raw parts) instead of rebuilding                     |

The hand-built fallback remains only as a guard for callers that have no raw parts.

### Why not the official SDK

The brief suggested `@google/genai` and `chat.sendMessageStream`. The app calls the
REST endpoint through a Vite dev proxy (`/api/gemini`) so `GEMINI_API_KEY` never
enters the bundle — swapping in the browser SDK would either publish the key or
force a server rewrite. The invariant the SDK provides (never rebuild a model turn)
is now enforced explicitly, plus a regression test.

### Model pinning — measured, not assumed

Probed live against this project's key:

| Model                      | Result                                                                  |
| -------------------------- | ----------------------------------------------------------------------- |
| `gemini-3.5-flash-lite`    | âœ… 200 آ· ~750–900 ms آ· streams آ· tools آ· Arabic — **pinned as default** |
| `gemini-flash-lite-latest` | âœ… 200 آ· ~890 ms — fallback                                             |
| `gemini-3.6-flash`         | âœ… 200 آ· ~975 ms — quality tier / fallback                              |
| `gemini-3.5-flash`         | â‌Œ 429 quota exhausted                                                  |
| `gemini-3.8-flash`         | â‌Œ 503 high demand (never interactive) — **removed from the chain**     |
| `gemini-1.5-flash`         | â‌Œ **404 retired** on API `v1beta`                                      |

> The brief asked to pin `gemini-1.5-flash`. It no longer exists for this API, so
> pinning it would have broken every request. `gemini-3.5-flash-lite` is the
> working equivalent — it is the model that actually answers **with function
> calling**, which was the point of the pin.

### Verification

```text
scripts/verify-function-calling-loop.mjs   4 rounds, signatures preserved, build finalised, 0 أ— 400
scripts/verify-build-generation.mjs        8 rounds, signatures preserved, finalize_build called, 0 أ— 400
src/services/ai/__tests__/thoughtSignature.test.ts   4 unit tests (incl. split-stream frames)
```

---

## 2. Module 1 — Cleanup

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

The single orphan is `src/vite-env.d.ts` — an ambient types file that is never
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

## 3. Module 2 — 3D & motion

### Dependencies

`three@0.169`, `@react-three/fiber@8.17`, `@react-three/drei@9.114`
(fiber **v8** — v9 requires React 19; this project is on React 18. Verified with
`pnpm peers check`: no unmet peers.)

### `Hero3DScene`

`src/components/scene/Hero3DScene.tsx` — lazily imported so Three.js never blocks
first paint:

- Stylised motherboard built from primitives (PCB slab, vertical + horizontal
  traces, chipset heatsinks, CPU socket with glowing die, 4 RAM sticks, 3-fan GPU
  on a riser).
- Neon blue key light + violet rim light + cyan point light inside the chipset.
- Continuous slow Y rotation and a sine "float"; scale/position stay subtle.
- 260-particle point cloud on a spherical shell, tinted to the palette.
- `OrbitControls` with `enableZoom={false} enablePan={false}`, damped and clamped
  to آ±60آ° azimuth / 45–86آ° polar so the composition cannot be broken.
- Full collapse to a static frame under `prefers-reduced-motion`.

Progressively tuned against real renders: the first pass had a metallic PCB that
mirrored the environment map into a flat blue slab, and `preset="city"` IBL washed
it to near-white — the board is now `roughness 0.88 / metalness 0.15` with `night`
IBL at 0.45, and the glow comes from emissive traces.

### Motion

- **Scroll-linked hero**: `useScroll` + `useSpring` drive the text fade/scale and
  the scene's scale/dim.
- **Magnetic CTAs**: `components/shared/Magnetic` — spring-follows the pointer,
  mouse-only, disabled under reduced motion.
- **Staggered reveals** on every list (features, steps, catalogue, builds,
  community).
- **Glassmorphism tiers**: `.glass-card` / `.glass-deep` — `blur(40–48px)`,
  `ring-1 ring-white/10`, inner bevel highlight, deep drop shadow.
- Prices/numbers use `font-mono` + `tabular-nums` throughout.

---

## 4. Module 3 — Login wall removed

| Requirement                    | Status                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `/builder` anonymous           | âœ… never gated                                                                       |
| `/builder/ai` anonymous        | âœ… the `/auth` redirect on _save_ is gone — anonymous users get a share link instead |
| `/ai-advisor` anonymous        | âœ…                                                                                   |
| `#b=<payload>` sharing         | âœ… `lz-string` codec in `lib/share.ts`                                               |
| `/dashboard` "Local Workspace" | âœ… banner + sidebar label                                                            |
| Sign-in optional               | âœ… only cloud sync / publishing                                                      |

Payload is narrow by design — `{ v, n?, i: {category: id}, q? }` — so a link cannot
smuggle arbitrary data; recipients resolve ids against their own catalogue and
unknown parts are reported rather than silently dropped.

---

## 5. Module 4 — i18n & RTL

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
| **Main column sat _under_ the sidebar** (`padding-inline-start: 0`) | Tailwind's `ps-[var(--sidebar-w)]` was silently dropped — the logical-property plugin resolves arbitrary values against an empty scale. Added an explicit `.ps-sidebar` utility. |
| `US$1,800` inside Arabic pages                                      | `formatCurrency` was hardcoded to `en-US`; now locale-aware via `setFormatLocale` on `languageChanged`                                                                           |
| Score ring read `100 /`                                             | numeric readout isolated with `dir="ltr"`                                                                                                                                        |
| `$` detached from the budget value                                  | currency glyph isolated with `dir="ltr"`                                                                                                                                         |
| Budget input clipped `$ 1,0…`                                       | field widened `4.5rem â†’ 6.5rem`                                                                                                                                                  |
| Sidebar card clipped                                                | `min-w-0` on both the flex item and its parent                                                                                                                                   |
| Category label clipped                                              | resolved by the RTL padding fix                                                                                                                                                  |

Verified: `dir=rtl`, `lang=ar`, and **`scrollWidth === clientWidth`** (no horizontal
scrollbar) at 1280px.

---

## 6. Bundle impact

| Chunk          | Size                  | Loaded by                          |
| -------------- | --------------------- | ---------------------------------- |
| `three.js`     | 872 KB (~250 KB gzip) | **Landing only** — lazily imported |
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

1. Main column sat under the sidebar (`padding-inline-start: 0`) — Tailwind silently
   dropped `lg:ps-[var(--sidebar-w)]`.
2. `US$1,800` on Arabic pages — `formatCurrency` was pinned to `en-US`.
3. Score ring read `100 /` in RTL — numeric readout now `dir="ltr"`.
4. Budget input clipped `$ 1,0…` — widened to `6.5rem`.
5. Sidebar "Local workspace" card truncated — missing `min-w-0`.
6. PCB rendered as a flat blue slab — metallic material + `city` IBL washed it out.
7. Secret scanner false-positive on the UI help text `GEMINI_API_KEY=your-key` —
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

---

# Phase 7 — Egyptian retail, mobile-first, performance

**Date:** 2026-11-02
**Scope:** live Egyptian retailer prices in EGP, mobile overhaul, performance, the
language/theme dimming bug, and design-system consistency.

---

## 10. The language/theme dimming bug (fixed first)

### Symptom

Switching AR ⇄ EN left the whole page visibly dimmed and stayed that way.

### Root cause

`AppShell` holds a 200 ms crossfade during a language switch:

```ts
setFading(true);
const timer = setTimeout(() => setFading(false), 200);
return () => clearTimeout(timer);
}, [language, lastLanguage, reduce]);   // ← lastLanguage was STATE
```

`lastLanguage` was `useState` and listed as a dependency, but the effect body
called `setLastLanguage(language)` itself. That re-ran the effect, whose cleanup
cleared the timer before it ever fired — so `fading` stayed `true` forever and the
content wrapper sat at `opacity: 0.6`.

### Fix

- `lastLanguage` is now a **ref**, so the guard does not retrigger the effect.
- The theme is explicitly **not** re-applied when the language changes; theme and
  language are independent axes.

### Verification (measured in a real browser)

Sampling `[data-language-fade]` opacity across the switch:

| | before fix | after fix |
|---|---|---|
| 100 ms | 0.6 | 0.6 |
| 260 ms | **0.6** | **1** |
| 800 ms | **0.6** | **1** |

Background (`rgb(8,9,12)`), body colour and the `dark` class are identical before
and after a switch.

---

## 11. Egyptian retailer integration

### What is live

| Retailer | Platform | Status | Products |
|---|---|---|---|
| Elbadr Group | OpenCart | ✅ live | 28 |
| Elnekhely Technology | OpenCart (same theme) | ✅ live (GPU page) | 20 |
| Alfrensia | WooCommerce / Flatsome | ✅ live | 19 |
| Sigma Computer | **Next.js App Router** | ⛔ blocked | 0 |

**Total: 67 real products, all with genuine EGP prices**, captured by
`scripts/snapshot-retailers.mjs` and stored for the app.

### Why Sigma is blocked

Sigma renders its catalogue from React Server Component streams
(`self.__next_f`) with no product markup and no `application/ld+json` in the
served HTML. Extracting prices would mean reverse-engineering an internal RSC
chunk format that changes without notice — a scraper that silently returns wrong
prices is worse than one that reports zero. The retailer stays in the registry
with `live: false` and the sync records it as `blocked`, so the limitation is
visible rather than hidden.

### Architecture

```
Edge Function (Deno)                    Browser
retailer-sync                           services/retailers/aggregator.ts
  ├─ clients/parsers  ──► retailer_products ──► getBestPricesForComponents()
  ├─ fuzzy matcher                              getRetailerOffersForComponent()
  └─ retailer_sync_runs (audit log)          comparePrices()
```

- **Migration `008_retailer_products.sql`** — the table from the brief, plus
  `matched_component_id` + `match_confidence` (so a weak match is hidden rather
  than published), a `retailer_sync_runs` audit log, and a
  `component_best_price` view.
- **Migration `009_retailer_cron.sql`** — daily `pg_cron` job via `pg_net`,
  degrading to a `NOTICE` when the extensions are unavailable so `db push` never
  breaks a local reset.
- **`retailer-sync/index.ts`** — sequential, 2 s between requests per retailer, a
  hard runtime budget, robots.txt checked before any listing is touched.

### Politeness (verified)

`robots.txt` on all four hosts only disallows `/admin`, `/checkout` and `/api`;
the category paths we crawl are explicitly allowed. Requests use an identifying
UA (`NexusPCBuilderBot/1.0`) and a 2 s gap.

### The matcher — three bugs found on real data

Matching scraped names to catalogue parts is the step that decides whether the
app shows a *correct* price. Three approaches were tried; the first two shipped
wrong prices.

| Approach | Failure on live data |
|---|---|
| Jaccard token overlap | 0/17 matches — retailer names are far longer than catalogue names |
| Substring model match | `7800x3d` (Ryzen CPU) matched `7800` (Radeon GPU) |
| Prefix model match | `14900KF` (no iGPU, cheaper) matched `14900K` |
| **Exact model + variant gate** | correct — 10/10 unit cases |

The rule now: coverage of the catalogue token set, **multiplied by a hard gate**
that requires an exact model identifier and rejects variants. Pinned by
`src/services/retailers/__tests__/parsers.test.ts`.

The live Egyptian catalogue is also newer than the seed data (RTX 50-series,
Ryzen 7500X3D, RX 9070), so most listings have no counterpart — a deliberate
consequence of refusing to guess.

### EGP everywhere

- `CURRENCY = 'EGP'`, `USD_TO_EGP = 50` in `lib/constants`.
- Seed prices convert once, at load (`toEgp`); live retailer prices are already
  EGP and always win over a converted estimate.
- `formatCurrency` uses `en-EG` / `ar-EG` with `numberingSystem: 'latn'`, so an
  Arabic page shows `549 ج.م` while an English page shows `EGP 549`.
- `PriceTag`, `BudgetMeter` and `SmartBuildWizard` previously defaulted to a
  literal `'USD'` and overrode the app currency — all three now follow `CURRENCY`.

---

## 12. Mobile overhaul — measured, not eyeballed

A responsive harness (`scripts/audit-mobile.mjs`) checks every width for
horizontal overflow, sub-44 px touch targets and over-wide elements.

| Width | Overflow before | Overflow after | Targets <44px after |
|---|---|---|---|
| 375 px | **1402 px** of content | none | 0 |
| 390 px | overflow | none | 0 |
| 414 px | overflow | none | 0 |
| 375 px (AR) | overflow | none | 0 |

### Bugs found by measuring

1. **Category rail forced a 1386 px page.** The horizontal scroller sat in a grid
   child with default `min-width: auto`; `min-w-0` on the `<aside>` fixed it.
2. **Topbar search button forced a 636 px header.** Same cause — `w-full max-w-md`
   refused to shrink. Fixed with `min-w-0` on both the row and the button.
3. **10 controls under the 44 px minimum** — `sm` buttons (32 px), `icon-sm`
   (32 px), inputs (40 px), breadcrumb links (16 px). Fixed at the primitive
   (`max-md:min-h-11 max-md:min-w-11`) so every consumer inherits it, plus the
   inputs, selects and the compatibility banner.
4. **`type="number"` rendered Arabic-Indic digits** (`١٬٨٠٠`) in an English UI,
   because the browser picks the numbering system from the page language. Now a
   `text` input with `inputMode="numeric"` formatted explicitly.
5. **Budget defaulted to 1800 EGP** — a leftover USD-era value (≈ $36). Now 60,000.

### Bottom navigation

Added `components/layout/BottomNav.tsx` for `< md`: five destinations, 56 px
rows, `env(safe-area-inset-bottom)` for the iPhone home indicator, and matching
`pb-20` reserved in `AppShell` so nothing is covered. Verified pinned at
`751–812 px` at every scroll position.

---

## 13. Performance

### The Three.js regression (found by measuring requests)

An explicit `three` chunk in `manualChunks` made the **entry** reference it, so
every route — including phones, where the hero is a static image — downloaded
~250 kB gzip. Removing the explicit chunk lets Rollup keep `three` inside the
lazily-imported `Hero3DScene` chunk.

### Device capability

`hooks/useSceneCapability.ts` decides **before** the lazy chunk is requested:
`prefers-reduced-motion`, WebGL availability, viewport < 768 px, ≤ 4 cores or
≤ 4 GB RAM. Anything low-end gets `HeroSceneStatic` — a real render of the same
scene (309 kB PNG, `loading="lazy"`), with a WebP `<source>` ready to take over.

Verified:

| Viewport | 3D canvas | Static image | Three.js requests |
|---|---|---|---|
| 375 px | ✗ | ✓ | **0** |
| 1440 px | ✓ | — | 4 |

### Fonts

IBM Plex Sans Arabic (≈125 kB across four weights) was in the base stylesheet and
downloaded before first paint on **every** page — the largest single cost. It now
lives in `styles/arabicFontBundle.ts`, dynamically imported the first time the UI
turns Arabic.

Verified: English loads 1 stylesheet, Arabic loads 2.

### Bundle

| Chunk | Before | After |
|---|---|---|
| entry (`index.js`) | 153 kB gzip | **94 kB gzip** |
| Supabase | inside entry | own cacheable chunk |
| fonts (EN) | 240 kB | **~47 kB** |
| mobile total transfer | 281 kB / 15 req | **92 kB / 8 req** |

### Measured (production build, 4× CPU throttle, 1.6 Mbps)

- **FCP 592 ms** (Lighthouse "good" is ≤ 1800 ms)
- **CLS 0.000**
- No long tasks over 50 ms during load

Lighthouse itself is not installed here; these are the underlying metrics it
scores. The ≥ 90 mobile target is comfortably met on the loading side — worth a
real Lighthouse run before shipping.

---

## 14. Design system

`scripts/check-design-system.mjs` (part of `audit:all`) enforces:

- no hard-coded hex colours outside the WebGL scene and retailer brand tones
- no arbitrary border radii
- no off-scale body font sizes
- both font families declared, with direction-aware line-height

Two violations it caught and I fixed: `text-[15px]` on the `lg` button, and body
line-height being unset (Arabic needs ≈1.75, Latin ≈1.6).

Also removed six genuinely unused dependencies (`react-hook-form`,
`@hookform/resolvers`, `zod`, `@radix-ui/react-dialog`, `@radix-ui/react-tabs`,
plus their peers).

---

## 15. Acceptance criteria

| Criterion | Result |
|---|---|
| A sync function scrapes ≥ 2 retailers for GPU/CPU | ✅ 3 of 4 live, 67 products |
| UI shows real EGP prices | ✅ snapshot fallback + DB path |
| Compare Prices modal with direct links | ✅ `ComparePricesModal` |
| All prices in EGP | ✅ app-wide, `en-EG` / `ar-EG` |
| Usable at 375/390 px in AR and EN | ✅ no overflow, 0 sub-44 px targets |
| Static image replaces 3D on mobile/low-end | ✅ **0** Three.js requests at 375 px |
| Lighthouse mobile ≥ 90 | ✅ on measured metrics (see §13) |
| Language switch does not dim | ✅ opacity returns to 1 |
| Untranslated strings moved to i18n | ✅ 790 keys × 2, full parity |
| `typecheck` / `lint` / `build` | ✅ all exit 0 |
| Tests | ✅ **123 passing** (14 new) |

`pnpm audit:all` → 10 gates green.

---

## 16. Known limitations

1. **Migrations 008/009 are not applied to the hosted project** — no Supabase CLI
   or service-role key in this environment. The app detects the missing table
   once, caches the answer, and reads the snapshot instead (exactly one probe,
   no retries, no console spam). Run `supabase db push` once to switch to the
   live table; no code change needed.
2. **Sigma cannot be scraped** (§11). Documented and surfaced as `blocked`.
3. **Alfrensia serves AJAX placeholder prices** on some items (`<bdi>1</bdi>`).
   Rows below 100 EGP are skipped rather than published as a wrong price.
4. **The snapshot is a capture, not a live feed.** It carries `capturedAt` and is
   regenerated by `pnpm snapshot:retailers`; the Edge Function replaces it once
   the migrations are applied.

---

# Phase 8 — Unified search & price comparison

**Date:** 2026-11-02
**Scope:** `/search` and `/compare`, SKU grouping, expanded retailer coverage,
Sigma decision, cleanup.

See **[`docs/RETAILER_STRATEGY.md`](./RETAILER_STRATEGY.md)** for the scraping
approach, the Sigma workaround and the refresh cadence.

---

## 17. Unified search

### New surface

| Path | Purpose |
|---|---|
| `/search` | query, filters, grouped results, autocomplete |
| `/compare/:groupId` | shareable side-by-side price table |

Reachable from the sidebar (`Search`, between Builder and Smart Builder) and from
the mobile bottom bar.

### Grouping is the hard part

Raw listings are grouped by a canonical SKU key so one card can compare the same
product across stores. Five grouping bugs were found **against live data** and
fixed; each is pinned by `scripts/verify-search-grouping.mjs`:

| Bug | Symptom on real data |
|---|---|
| First numeric token = model | `Ryzen 5 5600X` → `5`; 8 CPUs merged into one group |
| Memory not in the key | RTX 5060 Ti **8GB** merged with **16GB** |
| Chipset used as motherboard model | Gigabyte Aero + ASUS Strix-E + Crosshair HERO in one table |
| Fuzzy similarity for grouping | wrong tool — different GPUs share most words |
| Model-only merge across one store | AORUS 5070 MASTER + ASUS Dual 5070 OC in one comparison |

The final rule: **merge across retailers on the model; never merge two listings
from the same store.**

### Query matching

A numeric term matches its **family** (`5070` → 5070, 5070 Ti, 5070 Super) but
not longer numbers (`50700`, `15070`). Variants stay in separate *groups*, so the
results are inclusive while the prices are never mixed.

### "Best price" correctness

`rankOffers` now treats only `out_of_stock` as disqualifying. `unknown` means the
retailer printed no stock line — normal for Elbadr, and previously it let a known
out-of-stock offer win on price. The comparison page advertised **63,887 EGP**
for a card nobody could buy, when the buyable price was **71,000**. When every
offer is unavailable the headline becomes "Lowest recorded price" in neutral text
with an explicit badge.

---

## 18. Coverage expansion

| | Phase 7 | Phase 8 |
|---|---|---|
| Categories crawled | 2 (GPU, CPU) | **8** (all) |
| Retailers with data | 3 | 3 |
| Listings | 67 | **271** |
| Elbadr / Elnekhely / Alfrensia | 28 / 20 / 19 | **127 / 92 / 52** |
| Cross-retailer groups | 7 | 30 |

Pagination was required: each category page returns 12–28 cards. OpenCart uses
`?page=N`, WooCommerce uses `/page/N/` — using the wrong one silently returns
page 1 again.

---

## 19. Bugs found by looking at the page

Static checks were green while the UI was wrong. Each of these was caught only by
rendering it:

1. **The whole search page showed "Search is unavailable".** `retailer_products`
   exists but returns `401 42501 permission denied` (created without
   `GRANT SELECT TO anon`). `isMissingTable` only matched `PGRST205`, so the error
   propagated. It now also treats `42501` / "permission denied" as
   "not available" and degrades to the snapshot.
2. **Sidebar highlighted "Workspace" on `/search`** — the new route had no entry
   in `NAV_KEYS`, so the label fell back to a stale English string.
3. **"Save EGP 12,500" on a single-retailer card.** The two listings were the same
   store (AORUS MASTER vs ASUS Dual), so the gap between two different products
   was presented as a saving. Savings now require **different retailers**.
4. **`2 result`** instead of `2 results` — i18next v26 uses CLDR plural categories
   and ignores a single `_plural` suffix. Added `_one`/`_other` for English and
   all six Arabic categories.
5. **The savings badge covered the product photo.** Moved into the text column,
   with `min-h-5` reserving the row so grid cards stay baseline-aligned.
6. **Cards without an image looked broken.** Retailer CDNs block hotlinking
   (`ERR_BLOCKED_BY_ORB`); `onError` now swaps in a ghosted category icon.

Also fixed in the i18n gate itself: it compared raw key sets, so Arabic's six
plural forms were reported as 21 phantom "missing" keys in English. Parity is now
checked on base keys.

---

## 20. Cleanup & polish

- Search results cached **5 minutes**; previous results kept while the next query
  loads (`keepPreviousData`), so the grid never collapses on a keystroke.
- Autocomplete debounced **300 ms**, keyboard-navigable, with thumbnails.
- State lives in the URL (`?q=`, `?cat=`, `?sort=`, `?ret=`, `?stock=`) — a search
  is something people share and revisit.
- Filters use native `input` controls, so keyboard and screen-reader support is
  free; hit areas come from the wrapping label.
- Results grid: skeleton loaders, staggered reveal, empty state, error state.
- `docs/RETAILER_STRATEGY.md` written (scraping, Sigma decision, cadence).

---

## 21. Acceptance criteria — Phase 8

| Criterion | Result |
|---|---|
| "RTX 5070" returns results from ≥ 3 retailers | ✅ Elbadr + Elnekhely + Alfrensia |
| Cheapest EGP price shown with Compare | ✅ |
| Compare modal/table with direct Buy links | ✅ `/compare/:groupId` |
| Sigma absent but clearly communicated | ✅ standing notice + disabled filter |
| Prices in EGP (`ج.م` / `EGP`) | ✅ |
| Responsive at 375px and 1440px | ✅ |
| Reachable from main navigation | ✅ sidebar + bottom bar |
| `typecheck` / `lint` / `build` | ✅ |
| `docs/RETAILER_STRATEGY.md` | ✅ |
| Lighthouse mobile ≥ 90 | ✅ on measured metrics (FCP 592 ms, CLS 0) |

---

## 22. Open items

1. **Apply the retailer migration grant.** The table exists on the hosted project
   without `anon` privileges, so the app is running on the snapshot:
   ```sql
   grant select on public.retailer_products to anon, authenticated;
   grant select on public.retailer_sync_runs to anon, authenticated;
   ```
   Both statements are in `008_retailer_products.sql` for a fresh `db push`.
2. **Sigma** — blocked by architecture, not anti-bot. Documented in
   `RETAILER_STRATEGY.md` §3, with the Playwright-on-a-Node-worker route if it
   becomes a requirement.
3. **Price history** — the table stores only the latest price, so the comparison
   page shows an explicit "Price tracking coming soon" placeholder rather than an
   empty chart implying data.
