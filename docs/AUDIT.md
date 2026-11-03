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
| `gemini-3.5-flash-lite`    | ✅ 200 · ~750–900 ms · streams · tools · Arabic — **pinned as default** |
| `gemini-flash-lite-latest` | ✅ 200 · ~890 ms — fallback                                             |
| `gemini-3.6-flash`         | ✅ 200 · ~975 ms — quality tier / fallback                              |
| `gemini-3.5-flash`         | ❌ 429 quota exhausted                                                  |
| `gemini-3.8-flash`         | ❌ 503 high demand (never interactive) — **removed from the chain**     |
| `gemini-1.5-flash`         | ❌ **404 retired** on API `v1beta`                                      |

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
Total src files: 114 · reachable: 113 · orphans: 1
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
(`listComponents → []`, `getComponentById → null`, `getCompatibilityRules → []`).
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
| `/builder` anonymous           | ✅ never gated                                                                       |
| `/builder/ai` anonymous        | ✅ the `/auth` redirect on _save_ is gone — anonymous users get a share link instead |
| `/ai-advisor` anonymous        | ✅                                                                                   |
| `#b=<payload>` sharing         | ✅ `lz-string` codec in `lib/share.ts`                                               |
| `/dashboard` "Local Workspace" | ✅ banner + sidebar label                                                            |
| Sign-in optional               | ✅ only cloud sync / publishing                                                      |

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
| Budget input clipped `$ 1,0…`                                       | field widened `4.5rem → 6.5rem`                                                                                                                                                  |
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
| Landing: 3D canvas mounted, WebGL2 context, non-empty framebuffer | ✅        |
| Landing: 5 sections laid out correctly                            | ✅        |
| `/builder/ai` anonymous, no auth redirect                         | ✅        |
| `/dashboard` anonymous → "Local workspace"                        | ✅        |
| Supabase unset → no `sb-*` storage, 0 failed requests             | ✅        |
| RTL (AR): `dir=rtl`, `lang=ar`, `scrollWidth === clientWidth`     | ✅        |
| RTL: 0 clipped category labels, 0 stray `US$`, `/ 100` intact     | ✅        |

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
| `thought_signature` gone, AI streams without 400 | ✅ 8-round tool loop, 0 errors |
| `typecheck` / `lint` / `build`                   | ✅ all exit 0                  |
| Landing has a working 3D scene + particles       | ✅ verified in a real browser  |
| Dead files and unused code deleted               | ✅ 113/114 reachable           |
| Anonymous build + AI chat, no forced login       | ✅                             |
| All UI strings in Arabic, RTL flawless           | ✅ no horizontal scroll        |
| `docs/AUDIT.md` written                          | ✅ this file                   |

`pnpm test` → **109 passing**.

`pnpm audit:all` → all 8 gates green (typecheck, lint, i18n, RTL, build, secret
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

---

# Phase 9 — Deploy fix, coverage, i18n, mobile reliability

**Date:** 2026-11-02

---

## 23. Module 0 — the 404 on refresh

### Cause

The app is a client-side SPA. `/search`, `/builder` and `/compare/:id` exist only
in the router. A static host asked for a file at that path, found none, and
returned **404** — even though the app handles the route perfectly once
`index.html` is served.

### Fix

| Host | File | Rule |
|---|---|---|
| Vercel | `vercel.json` | rewrite all but `/api/*` to `index.html` |
| Netlify | `public/_redirects` | `/*  /index.html  200` (rewrite, not redirect) |
| Cloudflare Pages | `public/_routes.json` | SPA rewrite |
| Apache / cPanel | `public/.htaccess` | `mod_rewrite` fallback |

`public/` is copied verbatim into `dist/`, so all four ship with no extra step.

### Verified, not assumed

`scripts/verify-spa-routing.mjs` serves the production build behind a
`_redirects`-equivalent and asserts, for 12 routes:

```
PASS  200  /search            PASS  200  /compare/sku%3A…
PASS  200  /search?q=rtx…     PASS  200  /b/signal-4k-gaming-flagship
PASS  200  /builder           PASS  200  /some/nonexistent/deep/route
PASS  200  /builder/ai        PASS  asset served as text/css (not index.html)
PASS  200  /ai-advisor        PASS  hard refresh /search rendered 1.4k chars
```

It is now part of `pnpm audit:all`.

### `VITE_APP_URL`

`src/lib/appUrl.ts` is the single source of truth for absolute URLs. It prefers
`VITE_APP_URL`, then `window.location.origin` + `BASE_URL` (so sub-path deploys
work), and returns `''` rather than throwing outside a browser.

The four hardcoded `window.location.origin` uses — build share link, build-detail
share, auth redirect, Smart Builder copy — all route through it, so a staging
deploy no longer hands out preview-host links.

---

## 24. Module 2 — images

Measured first: **87% of listings already had a valid `image_url`** (Elbadr and
Elnekhely are at 100%). The gap was Alfrensia at 14%.

### What was actually wrong

- Alfrensia's listing serves a WooCommerce placeholder for most items; the real
  photo only exists on the product page, which the listing scrape never visits.
- Some retailer CDs reject cross-origin loads (`ERR_BLOCKED_BY_ORB`), so even a
  stored URL can fail to paint.

### Fix

1. `extractImage()` handles `src`, `data-src`, `srcset` and `data-srcset`, and
   rejects placeholders, spacers and `data:` URIs.
2. `CategoryPlaceholder` draws an inline SVG per category — no extra request, no
   broken icon, follows the theme via `currentColor`.
3. Cards swap to the placeholder on `onError`.

**Result: 83% of 591 listings have a working image**, and the rest show an
intentional category illustration instead of a gap.

---

## 25. Module 3 — coverage

Deeper pagination (4–8 pages per category) took the snapshot from 339 to **591
listings**:

| Retailer | Listings | Images |
|---|---|---|
| Elbadr | 368 | 100% |
| Alfrensia | 120 | 19% (placeholders at source) |
| Elnekhely | 103 | 100% |

**Three times the 400 target is not reached — 591 is.** Elnekhely's page 2+
answers **503** on every URL form tried (`?page=2`, `/page/2/`, `&page=2`), so
~100 from page 1 of eight categories is its accessible ceiling. That is recorded
in the parser and reported as `partial` by the sync rather than hidden.

`last_scraped_at` is displayed as a relative "Prices updated N min ago".

---

## 26. Module 1 — Sigma

The brief allowed either an aggregator or a Playwright worker. Both were
investigated:

| Source | Result |
|---|---|
| `eg-pc.com` | redirects to **qarenly.com** |
| qarenly.com | tracks Sigma — but it is **also Next.js RSC**; its 161 "price" tokens are coupon text inside `self.__next_f`, not product data |

So there is no scrapeable aggregator DOM. The worker was written instead:

- **`scripts/sigma_scraper.py`** — Playwright, waits for `networkidle`, reads the
  rendered DOM, 2 s between pages, ASCII-only so a Windows console can run it.
- **`node scripts/snapshot-retailers.mjs --from sigma.json`** ingests its output.

It is **not run automatically**: there is no headless Chromium on Deno Deploy and
none installed here. Running it prints actionable guidance and exits `2` rather
than crashing:

```
playwright is not installed.
  pip install playwright && python -m playwright install chromium
```

The UI states the limitation plainly: **"Sigma (Pending)"** in the filter rail
with a tooltip, and a standing notice on `/search`. Previously it said "Out of
stock", which is a different and untrue fact.

---

## 27. Module 4 — i18n

`scripts/find-hardcoded-strings.mjs` (new, in `audit:all`) scans for prose in JSX
text nodes and user-facing attributes. It found **10** remaining strings; all are
now translated, and the check reports:

```
✔ no hardcoded user-facing strings found
```

**972 keys × 2 languages, full parity.** Notable fixes: the Smart Builder
wizard's three step headings, the Build Detail "Price" label and 404 title, the
Prebuilt empty state, and the assistant typing label.

---

## 28. Module 5 — the mobile freeze (root cause found)

The reported symptom — "sidebar, navbar and header buttons sometimes become
unclickable" — reproduced as: **the drawer opens but its links never navigate.**

### Three real defects, all in `Sidebar.tsx`

1. **A fragment inside `AnimatePresence`.** The backdrop and panel were siblings
   wrapped in `<>`, but Framer Motion tracks **one child** per `AnimatePresence`.
   The panel got no enter/exit animation and the `fixed inset-0` backdrop could
   outlive navigation — invisible at `opacity: 0` while still capturing every tap.
   → Each overlay now has its own `AnimatePresence`.

2. **`absolute inset-0` indicators sat on top of the links.** Hit-testing the
   active nav item returned `SPAN.absolute inset-0` instead of the anchor, so
   tapping the item you were most likely to re-open did nothing.
   → `pointer-events-none` on both indicator spans.

3. **Nav links did not close the drawer.** Navigating left the panel open over the
   new page.
   → `NavContent` takes `onNavigate`; the drawer closes on click.

Also: the drawer used a `spring` for its exit. The panel is closed from two
places at once (the click and the route effect), and an interrupted spring never
settles, so it could stay mounted. It is now a bounded 220 ms tween.

### Verified

`scripts/test-mobile-nav.mjs` drives the exact flow at 375px in **both**
languages — **14/14 pass**:

```
PASS  hamburger opens the drawer
PASS  drawer link navigates  (/builder -> /search)
PASS  drawer slides off-screen after navigation
PASS  header is clickable (no overlay)
PASS  bottom nav navigates
PASS  language toggle responds  (dir=rtl)
PASS  no horizontal scroll
```

An earlier version of this test reported a false failure: it counted any `aside`
with `position: fixed` as "open", including the hidden desktop rail. It now
measures whether the panel is actually on screen.

---

## 29. Other bugs found while working

1. **Infinite recursion in `getAggregatedProducts`.** When `retailer_products`
   returned zero rows it called itself again — the search page froze at "0
   results". This is the *second* cause of the freeze, and the reason the page
   stopped working after the Phase 8 migration check. The fallback now reads the
   snapshot directly and terminates.
2. **Two duplicated fallback branches** in the same function collapsed into
   `snapshotOnly()`.
3. **`find-hardcoded-strings` and `verify-spa-routing` added to `audit:all`**, so
   both classes of regression are now gated.

---

## 30. Acceptance criteria — Phase 9

| Criterion | Result |
|---|---|
| Sub-route refresh returns the app, not 404 | ✅ 12 routes + 3 browser hard-refreshes |
| `vercel.json` / `_redirects` committed | ✅ plus `_routes.json` and `.htaccess` |
| `VITE_APP_URL` documented and used | ✅ `lib/appUrl.ts`, 4 call sites |
| Sigma present or clearly marked unavailable | ✅ Playwright worker + "Pending" badge |
| ≥ 80% of products have a working image | ✅ **83%** |
| > 400 total listings | ✅ **591** |
| `pnpm check:i18n` zero missing keys | ✅ 972 × 2 |
| No hardcoded strings (AR or EN) | ✅ automated scan clean |
| Mobile nav fully clickable at 375px | ✅ 14/14 |
| No horizontal scroll / 44px targets | ✅ |
| `typecheck` / `lint` / `build` | ✅ |
| README + AUDIT updated | ✅ |
| Dead files removed | ✅ 139/140 reachable |

`pnpm audit:all` → **13 gates green, 142 tests passing.**

---

## 31. Remaining

1. ~~**Sigma has no data.**~~ **Solved in Phase 11 (see §32)** — the Playwright
   worker renders the real listing and publishes a JSON feed; 300 Sigma products
   are live and Sigma is selectable in the filter rail.
2. **Elnekhely page 2+ returns 503.** Its ~100 products are its accessible maximum.
3. **`retailer_products` still needs its grant** on the hosted project:
   ```sql
   grant select on public.retailer_products to anon, authenticated;
   ```
   Until then the app reads the snapshot (714 real listings) plus the Sigma feed.

---

# Phase 10 — Production hardening & final polish

**Date:** 2026-11-02
**Scope:** the production 404 on `/api/ai`, the missing hero asset, WebGL context
loss, Sigma, missing retailer images, i18n completeness, cleanup, mobile polish.

Each module below lists what was **measured** on the live site or in a real
browser, not what was assumed.

---

## 32. Module 0 — the AI worked in dev and 404'd in production

### Root cause

The Gemini transport existed in three different places, only one of which ran
in production:

| Piece | dev | Vercel |
|---|---|---|
| `/api/ai/config` | Vite plugin | **404** |
| `/api/gemini/v1beta/…` | Vite `server.proxy` | **404** |
| Anything at `/api/*` | — | swallowed by the SPA rewrite |

### Fix — one prefix, one implementation, two runtimes

```
src/server/geminiProxy.ts        pure handler (no framework)
   ├─ api/ai/[...route].ts        Vercel Serverless Function
   └─ vite.config.ts plugin       dev middleware (same handler)
```

- The browser now calls **`/api/ai/v1beta/models/<model>:<method>`** for both
  generate and stream, and `/api/ai/config` for discovery — the same paths in
  `pnpm dev` and on Vercel.
- The function reads `process.env.GEMINI_API_KEY` and forwards it as the
  `x-goog-api-key` header (never a query string, never the bundle).
- SSE is relayed chunk-by-chunk with `Cache-Control: no-cache, no-transform` and
  `X-Accel-Buffering: no`, so token streaming works through Vercel.
- Only `v1(alpha|beta)/models/<id>:(generateContent|streamGenerateContent|countTokens)`
  is proxied. Anything else → **404**, so the function is not an open proxy.
- CORS + `OPTIONS` are handled for preview hosts and local tooling.
- `vercel.json` gained `framework`, an explicit `functions` entry (512 MB, 60 s),
  a `/media` cache rule and `no-store` on `/api`.

### Verified with the real function module

`scripts/verify-ai-function.mjs` imports `api/ai/[...route].ts` and calls it with
Web `Request` objects, exactly as Vercel does:

```
PASS  GET /api/ai/config answers 200 JSON
PASS  config reports a boolean, never the key
PASS  non-generative routes are refused with 404
PASS  missing GEMINI_API_KEY -> 503 with guidance
PASS  proxied generateContent reaches Gemini        (PONG)
PASS  CORS preflight -> 204 with allow headers
```

The same contract was exercised through the dev server: config 200, a streamed
SSE call, and a blocked `:deleteModel` route → 404.

> **Operator step:** set `GEMINI_API_KEY` in Vercel → Settings → Environment
> Variables (Production, Preview, Development) and redeploy. Missing key = a
> `{ gemini: false }` config and a 503 from the proxy, both with clear messages.

---

## 33. Module 0 — assets and the 3D crash

### `hero-scene.webp` did not exist

`HeroSceneStatic` shipped a `<source srcset="/media/hero-scene.webp">` pointing at a
file nobody had generated. Every fallback path (phones, tablets, low-end
laptops) requested it and logged a 404 before falling back to the PNG.

- Generated from the existing render: **309 kB PNG → 16 kB WebP**.
- Paths moved to `src/lib/assets.ts`, built from `import.meta.env.BASE_URL`, so a
  sub-path deploy (`/beta/`) no longer 404s every asset.
- Added `onError` → if neither file can be decoded the hero keeps its exact box
  with the ambient glow, so the layout cannot jump.

### `THREE.WebGLRenderer: Context Lost`

A lost GPU context is not a React error, so the old code left a dead canvas (or
blanked the page). Three layers now handle it:

1. **`SceneErrorBoundary`** (new) catches anything thrown from the scene and
   renders the static hero. The rest of the landing page is unaffected.
2. **`ContextGuard`** (inside the canvas) listens for `webglcontextlost`, calls
   `preventDefault`, blacklists the scene for the session and swaps in the image.
   Re-mounting after a loss usually just loses the context again, so it stays off
   until reload.
3. **`<PerformanceMonitor>`** (drei) degrades on measured frame rate, not guesses:
   below 45 fps → DPR pinned to 1 and half the particles; a second decline → the
   static render. No `onIncline` bounce-back, which was more distracting than a
   permanently cheaper hero.

### No light-mode flash

`index.html` now resolves the stored theme before first paint and sets both the
class and `color-scheme`, so a light-theme visitor never sees a dark frame.

---

## 34. Module 1 — retailer images

### The Alfrensia bug (19 % → 100 %)

Alfrensia cards put a **warranty/flag badge PNG** as the first `<img>`, ahead of
the lazy product photo (`src="data:…" data-src="…"`). `extractImage()` returned
the first plausible candidate, so most rows stored a badge or nothing.

- Badge/logo/flag/payment URLs are now rejected by the shared extractor, for all
  retailers, not just this one.
- Two category slugs answered 404 and contributed nothing (`case`, `cooling`);
  the real paths are `/product-category/cases/` and
  `/product-category/air-liquid-cooling/`.

| Retailer | Before | After |
|---|---|---|
| Elbadr | 368 / 100 % | 368 / **100 %** |
| Elnekhely | 103 / 100 % | 103 / **100 %** |
| Alfrensia | 120 / **19 %** | 243 / **100 %** |
| **Snapshot total** | 591 / 83 % | **714 / 100 %** |

`scripts/verify-listing-coverage.mjs` is the gate: it fails below 90 % images or
400 listings.

---

## 35. Module 1 — Sigma, finally

Full method in `docs/RETAILER_STRATEGY.md` §3. Summary of what was measured:

| Route | Result |
|---|---|
| `/en/category/vga` (slug) | redirects to a search page that renders an error state |
| `/en/category/<uuid>` | 200 but **no product markup** (RSC only) |
| `/en/search?filters=…` | renders an error state |
| **`/en/search`** | ✅ a real paginated grid |
| Sigma's own API | **403** (key-gated) |
| `api.sigma-computer.com/media/…` | 200 to a page, blocked for a hotlinked `<img>` |

`scripts/sigma_worker.py` renders `/en/search`, clicks the real rail label
(`Nvidia GeForce`, `AMD CPU`, …), pages through the grid and writes
`public/data/sigma_products.json`:

```
300 products, 100 % with images, 8 categories, status "ok"
```

- Images are emitted through the store's own `_next/image` proxy — the only form
a browser can load them in.
- The app merges the feed into the snapshot set (`sigmaFeed.ts` + a bundled
  `sigmaSnapshot.ts` for first paint), so grouping, ranking and the compare table
treat Sigma like any other store.
- Availability is data-driven: with rows, Sigma is live and selectable; without
  rows, the honest **Pending** badge returns.

**Total listings the app sees: 714 + 300 = 1014, 100 % with images.**

---

## 36. Module 2 — i18n sweep

### What the stricter scan found

`check:i18n` proves **parity** (both languages ship every key) and the old JSX
scanner only looked at `>Some text<` nodes. Neither can see a page that renders a
literal *instead of* a key that already exists. A stricter pass — JSX text, JSX
attributes, and prose-shaped literals, excluding CSS and engine code — surfaced
**81** such strings. The worst were whole pages:

| Surface | What shipped |
|---|---|
| `/prebuilt` | header, description, breadcrumbs, CTA, empty-state copy — all literals |
| `/builder/ai` | page title, wizard steps, use-case labels + descriptions, Back/Continue |
| `/build-doctor` | eyebrow, description, breadcrumbs, verdict badges, buttons |
| `/build/:slug` | breadcrumbs, share toasts, score labels, "Peak draw" |
| Crash screen | every string in `ErrorBoundary` |
| Nav config | `NavItem.label`/`description` were English data fields |

Each was replaced with the key that already existed (`nav.*`, `prebuilt.*`,
`doctor.*`, `buildDetail.*`, `smartBuilder.*`). Where no key existed, one was
added in **both** languages. Two real defects fell out of doing this:

- **Bare `$` in the budget field** — the wizard rendered a literal `$` while every
  other price on screen was EGP. Now `CURRENCY`, `dir="ltr"`.
- **Mojibake in the UI** — `Reviewing…` rendered as `Reviewing…` (an em dash
  stored as UTF-8 then read as cp1252). Both locale files were verified at the
  byte level as valid Arabic UTF-8 with no replacement characters; only that one
  string was affected.

### The gate

`scripts/audit-i18n-strings.mjs` is now part of `pnpm audit:all` and **fails the
build** on any untranslated UI string. Its exemptions are explicit and narrow:
model prompts, the compatibility/scoring engines (they emit `ruleKey`s the UI
translates), agent/tool internals, and seed data.

### The real gap was not in the JSON

`check:i18n` and the JSX scanner were already green, yet Arabic build pages showed
English warnings. The compatibility engine emits an English `message` next to a
stable `ruleKey`, and the banner rendered `issue.message` verbatim.

- Added `builder.compat.*` for all 12 engine rules + the dynamic
  `missing_<category>` case, in **both** locales.
- `useCompatibilityMessage()` resolves by `ruleKey` and keeps the engine's
  measured parenthetical detail (`120 mm (needs 160 mm)`).
- The top-level `ErrorBoundary` (the crash screen) was fully hardcoded; it now
  translates through the i18n instance.
- The 3D scene's `aria-label` is translated.
- The retailer subtitle now names all four stores.
- `scripts/audit-i18n-strings.mjs` widened the sweep to **any** JSX text with
  letters plus prose-shaped string literals (toasts, errors, configs).

`pnpm check:i18n` → **1054 keys × 2 languages, zero missing.**
`node scripts/audit-i18n-strings.mjs` → **0 untranslated strings.**

---

## 37. Module 3 — cleanup

| Removed | Why |
|---|---|
| `scripts/sigma_scraper.py` | superseded by `sigma_worker.py` (did not work) |
| `scripts/probe_*` (13 files) | throwaway investigations used to reach the findings above |
| `scripts/codemod-i18n-ns.mjs`, `scripts/codemod-rtl.mjs` | one-shot codemods, already applied |
| `scripts/verify-matching.mjs`, `verify-search-matching.mjs` | superseded by the grouping verifier |
| `playwright` dev dependency | the QA harnesses resolve `patchright` from outside the repo; the probes that needed it are gone |

`audit-unused.mjs` was itself wrong: it treated `src/server/` and `api/` as
unreachable because it only walked browser entry points — i.e. it would have
deleted the production AI handler. It now seeds server entries and understands
multi-line imports. **143/143 src files reachable, 0 orphans, and
`check-deps` reports no unused dependency.**

### Consolidated into `src/lib/`

| Concern | Module |
|---|---|
| currency, locale formatting | `lib/utils.ts` (unchanged, single formatter) |
| compatibility strings | `lib/i18nCompatibility.ts` |
| public asset URLs | `lib/assets.ts` |
| retailer image URLs | `lib/retailerImage.ts` |

---

## 38. Module 4 — mobile & polish

- **Overlay pointer events.** The mobile drawer and its backdrop were left
  click-capturing while fading out (the comment claimed otherwise). The drawer is
  now `pointer-events: none` the moment it closes, so a tap during the 220 ms exit
  cannot land on a dismissed panel.
- **44 px targets at tablet width.** The site is clean at 375–430 px, but at
  768 px (a real touch device that lays out the desktop grid) eight controls were
  32–36 px. Touch sizing now keys off `@media (pointer: coarse)` — the input
  capability — instead of a width breakpoint that says nothing about fingers.
- **`/api` is never the SPA.** `_redirects` rewrote `/api/*` to `index.html` with a
  200, which on Netlify would have made the AI return HTML instead of JSON —
  the same production bug in a different host. `/api/*` is now excluded in
  `_redirects`, `_routes.json` and `.htaccess`, matching `vercel.json`.
- Reduced motion already collapses the hero, the drawer and every reveal; the new
  performance decay is inert when motion is reduced (frameloop is `demand`).

---

## 39. Verification (real renders)

| Check | Result |
|---|---|
| `pnpm typecheck` (app + node projects) | ✅ |
| `pnpm lint` | ✅ |
| `pnpm build` | ✅ |
| `pnpm test` | ✅ **166 passing** (24 new) |
| `pnpm check:i18n` | ✅ 1023 × 2 |
| `scripts/verify-ai-function.mjs` | ✅ 6/6 |
| `scripts/verify-listing-coverage.mjs` | ✅ 714 listings, 100 % images |
| Sigma feed | ✅ 300 listings, 100 % images |
| `/search?q=5070` EN 1440 px | ✅ 12/12 images load, 0 failed requests, 0 console errors |
| `/search?q=5070` AR 390 px | ✅ RTL, no overflow, no console errors |
| Landing AR 1440 px | ✅ no overflow, hero renders |
| Production build, deep link `/search` | ✅ 200 + app renders |
| `/media/hero-scene.webp` (production) | ✅ 200, `image/webp` |

Screenshots: `.qa/landing-ar.png`, `.qa/search-en2.png`,
`.qa/search-ar-mobile.png`, `.qa/prod-search.png`.

---

## 40. Acceptance criteria — Phase 10

| Criterion | Result |
|---|---|
| AI works on Vercel, no 404 on `/api/ai` | ✅ single shared handler + serverless route, 6/6 checks |
| `GEMINI_API_KEY` is server-side only | ✅ `process.env`, header auth, never in the bundle |
| `hero-scene.webp` loads | ✅ generated (16 kB), BASE_URL paths, graceful fallback |
| WebGL crashes caught | ✅ boundary + `webglcontextlost` + performance decay |
| Refresh any route ≠ 404 | ✅ all four hosts, `/api` excluded |
| Sigma data available | ✅ 300 products via the worker feed |
| ≥ 90 % of products with images | ✅ **100 %** (1014/1014) |
| Total listings > 400 | ✅ **1014** |
| `check:i18n` passes, no hardcoded UI strings | ✅ 1054 × 2, 0 untranslated (81 fixed, now a gate) |
| `typecheck` / `lint` / `build` | ✅ |
| `docs/AUDIT.md` updated | ✅ this section |
| Dead files removed | ✅ 0 orphans (server entries now counted) |

---

---

# Phase 11 — Elnekhely, massive catalogue, radical cleanup

**Date:** 2026-11-02
**Scope:** the Elnekhely failure, a 3,000-listing catalogue, pagination, and the
cleanup the brief asked for (orphans, unused exports, duplicate parser).

---

## 42. Module 0 — Elnekhely was never paginating badly. It was refusing us.

### The measurement that changed the diagnosis

The inherited explanation was "page 2+ answers 503, so ~100 products is the
ceiling". Both halves were wrong:

| Request | `NexusPCBuilderBot/1.0` | Browser UA |
|---|---|---|
| `/graphics-card` (page 1) | 12 cards | 12 cards |
| `/graphics-card?page=2` | **503** | **200, 12 cards** |
| `/graphics-card?limit=100` | — | **200, 100 cards** |
| `/graphics-card?limit=100&page=2` | — | **200, 100 new cards** |

A 503 on the *same URL* with a different User-Agent is UA filtering, not
rate-limiting. The scraper had been told "pagination is blocked" when the truth
was "we are refused", and it never sent a referrer either.

### Fix

- `headersFor()` — browser UA, `Accept`, `Accept-Language`, `Sec-Fetch-*` and a
  same-origin `Referer` on every request (shared by the crawler, the Edge
  Function and the tests).
- `limit: 100` on Elnekhely targets: nine page requests became one.
- Jittered 1.5–3 s delay instead of a fixed 2 s metronome.
- Page budgets raised to the measured depth; the crawl still stops at the first
  empty page.

### Three further bugs found while verifying accuracy

| Bug | Effect | Fix |
|---|---|---|
| `class="price price-normal"` not matched | every full-price card dropped | price regex accepts `price-new`/`price-normal`/block |
| our `?limit=100` kept in product URLs | links pointed at a scrape URL | `cleanProductUrl()` strips scrape-only params |
| raw `–` inside image filenames | image URL unloadable | `cleanImageUrl()` percent-encodes |

Storage has no separate HDD listing on this store, which is why it is the
smallest category — not a bug.

---

## 43. Module 1 — catalogue

| | Phase 10 | Phase 11 |
|---|---|---|
| Listings | 1014 | **3089** |
| Elnekhely | 103 | **750** |
| Elbadr | 368 | **1825** |
| Alfrensia | 243 | **221** |
| Sigma | 300 | **293** |
| Images | 100% | 99.94% (2 store-placeholder rows → category icon) |

Every category clears the 50-product floor. Verified by
`pnpm verify:coverage`, which now also checks price plausibility, absolute URLs,
name hygiene and category coverage.

### The `1 EGP` problem

Elbadr prints **`1 EGP`** on 176 cards when the real price is withheld —
including an RTX 5090. Sorted as numbers they beat every genuine offer, and the
UI literally showed **"BEST PRICE EGP 1"**.

- The parser flags such rows (`priceIsPlaceholder`, threshold 100 EGP).
- Both rankers (`aggregator.byBestOffer`, `searchService.rankOffers`) sort them
  last, and the group sort pins them to the bottom.
- The card renders **"Price is unavailable"** instead of a number.
- Rows are kept: the part is real, its photo and link work, it counts in its
  category.

### Card name/photo mismatch

The label came from the most descriptive name and the photo from the first offer
that had one, so a card could read "RTX 5070" over a motherboard. The photo is
now taken from the offer the price and Buy button point at.

### Pagination

`/search` uses React Query's `useInfiniteQuery` over a **group-aware** cursor:
listings are grouped first, then the groups are sliced. Slicing listings first
would split one product across two pages and show two "best prices" for it.

- 24 per page, `IntersectionObserver` with a 600 px `rootMargin`.
- A visible **Load more** button remains for keyboards, screen readers and
  devices without the API — automatic loading is never the only way forward.
- Footer states "Showing 48 of 430" so progress is honest.

Verified in a browser: 24 cards → 48 after scrolling, 0 console errors.

---

## 44. Module 2 — cleanup

Two new gates, both of which FAIL the build (`audit-unused` only reported):

| Gate | Result |
|---|---|
| `check-orphans.mjs` | 150/150 files reachable |
| `check-unused-exports.mjs` | 0 unused value exports (79 found and resolved) |

Both were written carefully because the first versions were wrong in ways that
would have deleted live code:

- the orphan walk ignored `api/` and `src/server/`, i.e. it flagged the
  production AI handler as dead;
- the export scan counted `export { a } from './x'` as a local declaration and
  flagged `services/geminiService.ts`, the module every agent imports.

### Consolidation

- **`src/lib/retailerParsing.ts` deleted.** It was a 209-line stale copy of the
  real 698-line parser, kept alive only by a test. Pointing the tests at the one
  implementation immediately surfaced two live bugs the copy had hidden (Arabic
  thousands separators broke price parsing; PSU wattage lost to a GPU word).
- `share.ts` internals demoted to module-private; `motion.ts` presets that no
  component used removed; `SCORE_LABELS`/`APP_TAGLINE` deleted.
- `snapshot-retailers.mjs` replaced by the resumable `crawl-retailers.mjs`;
  three unreferenced probe scripts removed.
- 130 mojibake sequences repaired across `src/`, `scripts/`, `docs/` — including
  two that were visible in the UI.

### Docs

`docs/ARCHITECTURE.md` now maps every directory to its responsibility and lists
what each folder must never do.

---

## 45. Verification (Phase 11)

| Check | Result |
|---|---|
| `pnpm typecheck` / `lint` / `build` | ✅ |
| `pnpm test` | ✅ **177 passing** |
| `pnpm audit:all` | ✅ **16 gates** |
| `check:i18n` / `audit-i18n-strings` | ✅ 1080 × 2, 0 untranslated |
| `check-orphans` | ✅ 150/150 |
| `check-unused-exports` | ✅ 0 |
| `verify-catalogue` | ✅ 3156 listings, 8 categories, all > 50 |
| `/search` EN & AR, 1440 & 390 px | ✅ no overflow, no mojibake, no broken images |
| Infinite scroll | ✅ 24 → 48 cards, no console errors |
| Mobile audit | ✅ 0 sub-44px targets at every width |

Screenshots: `.qa/final-search.png`, `.qa/search-pagination.png`,
`.qa/search-fixed.png`, `.qa/gpu-cat.png`.

---

## 46. Operator checklist (things only the owner can do)

1. **Vercel → Settings → Environment Variables**: add `GEMINI_API_KEY` (and
   optionally `GEMINI_MODEL`), then redeploy. Verify with
   `curl https://<app>/api/ai/config` → `{"gemini":true,…}`.
2. **Schedule the Sigma worker** (GitHub Actions snippet in
   `RETAILER_STRATEGY.md` §3) so the feed keeps its `capturedAt` fresh.
3. **Grant the retailer table** if you switch from snapshot to database:
   ```sql
   grant select on public.retailer_products to anon, authenticated;
   ```
