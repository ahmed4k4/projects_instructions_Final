# Architecture

**AI-Powered PC Builder ("Nexus")** — a React SPA that builds, validates and prices
custom PC builds, backed by Google Gemini and live prices from Egyptian retailers.

This document maps every directory to the responsibility it owns. The rule
throughout is: **one concern, one home.** If the same logic appears twice, one of
the copies is a future bug.

---

## 1. Top level

```
├── api/                     Vercel Serverless Functions (server, not bundled)
├── public/                  Served verbatim; also copied into dist/
├── scripts/                 Scrapers + CI gates (Node/Python, never bundled)
├── src/                     The application
├── supabase/                Migrations + Edge Functions (Deno)
├── docs/                    Audit trail and strategy notes
├── index.html               Single HTML entry; theme resolved before first paint
├── vite.config.ts           Build config + dev twin of the AI proxy
├── vercel.json              Routing, function config, caching, security headers
└── tailwind.config.ts       Design tokens, logical (RTL) utilities, variants
```

---

## 2. `api/` — serverless functions

| File               | Purpose                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `ai/[...route].ts` | The **only** production entry point for AI. Proxies Gemini, injects the server-side key, relays SSE. |

The function contains no logic of its own: it converts a Web `Request` into a call
on `src/server/geminiProxy.ts` and back. That keeps one implementation for both
runtimes (Vercel function + Vite dev middleware).

---

## 3. `src/server/` — server-only code

| File             | Purpose                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| `geminiProxy.ts` | Route handling, key injection, CORS, streaming passthrough, route allowlist. |

Excluded from `tsconfig.app.json` (it must never reach the browser bundle) and
included in `tsconfig.node.json` instead.

---

## 4. `src/` — the application

```
src/
├── main.tsx                  React root + providers
├── App.tsx                   Route shell (lazy pages)
├── router.tsx                Route table
├── pages/                    One component per route
├── components/
│   ├── layout/               Shell: sidebar, topbar, bottom nav
│   ├── ui/                   Design-system primitives (button, badge, select…)
│   ├── domain/               PC-building components (cards, score ring, wizard)
│   ├── retail/               Retailer-facing: search cards, filter panel, logos
│   ├── scene/                3D hero + its fallbacks
│   ├── shared/               Cross-cutting (ErrorBoundary, Markdown, Skeletons)
│   └── ai/                   Chat surfaces (message bubbles, tool timeline)
├── services/                 I/O and side effects
├── lib/                      Pure logic: no React, no network
├── hooks/                    React Query wrappers and capability probes
├── store/                    Zustand stores (build, UI)
├── i18n/                     Translations (en/ar) + runtime bootstrap
└── types/                    Shared type declarations
```

### 4.1 `pages/`

One file per route, registered in `router.tsx` and lazy-loaded. A page owns its
layout, its data hooks and its empty/loading/error states; it delegates anything
reusable to `components/` and anything computational to `lib/`.

| Route                                            | Page                                                 |
| ------------------------------------------------ | ---------------------------------------------------- |
| `/`                                              | `Landing` — hero, 3D scene, feature sections         |
| `/builder`                                       | `Builder` — component grid + live compatibility      |
| `/builder/ai`                                    | `SmartBuilder` — the intake wizard + generated build |
| `/ai-advisor`                                    | `AIAdvisor` — grounded chat                          |
| `/search`                                        | `Search` — grouped retailer listings + filters       |
| `/compare/:groupId`                              | `Compare` — side-by-side price table                 |
| `/build/:slug` · `/b/:slug`                      | `BuildDetail` — one published build                  |
| `/build/:slug/doctor`                            | `BuildDoctor` — AI diagnosis                         |
| `/prebuilt`, `/community`, `/dashboard`, `/auth` | Catalogue, social, workspace, sign-in                |
| `NotFound`, `ErrorBoundary`                      | Fallbacks                                            |

### 4.2 `components/`

| Folder    | Owns                                           | Never does                                |
| --------- | ---------------------------------------------- | ----------------------------------------- |
| `ui/`     | Appearance and a11y of primitives              | Domain logic, fetching                    |
| `layout/` | Navigation, shell chrome, responsive behaviour | Business rules                            |
| `domain/` | Presenting a component, a build, a score       | Fetching, price parsing                   |
| `retail/` | Presenting a retailer offer, filter state      | Scraping                                  |
| `scene/`  | WebGL hero and its graceful degradation        | Anything outside the hero                 |
| `ai/`     | Chat rendering, streaming display              | Calling the model (that is `services/ai`) |

### 4.3 `services/` — side effects

| Path                                     | Responsibility                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ai/`                                    | Provider abstraction (Gemini), model chain, retry/fallback, tool loop                                       |
| `aiTools/`, `buildAgent`, `advisorAgent` | Tool definitions and agent loops. Output goes **back to the model**; user-facing strings pass through `t()` |
| `retailers/`                             | Aggregator over listings, snapshots, the Sigma feed, grouping/ranking                                       |
| `searchService.ts`                       | Unified search: query → grouped results                                                                     |
| `buildsService.ts`                       | Supabase persistence, publishing, ratings                                                                   |
| `supabaseClient.ts`                      | The one client (null when unconfigured)                                                                     |

### 4.4 `lib/` — pure logic

| File                   | Responsibility                                                 |
| ---------------------- | -------------------------------------------------------------- |
| `compatibility/`       | Engine: validates a selection, emits `ruleKey` + English prose |
| `scoring/`             | Build score: sub-scores, grades, notes                         |
| `i18nCompatibility.ts` | Maps a `ruleKey` to the UI language                            |
| `retailerImage.ts`     | One rule for "can this retailer photo be shown?"               |
| `assets.ts`            | Public URLs built from `BASE_URL`                              |
| `share.ts`             | `#b=` build-link codec                                         |
| `navigation.ts`        | Nav + filter definitions (translation **keys**, not English)   |
| `utils.ts`             | `cn`, `formatCurrency` (the only currency formatter), locale   |
| `motion.ts`            | Shared easing and stagger presets                              |

Anything in `lib/` must be importable by a test without a DOM or a network.

### 4.5 `hooks/`

Thin React wrappers only: React Query keys and options, capability probes
(`useSceneCapability`, `useMediaQuery`), and stores access. No business logic —
that belongs in `lib/` or `services/`.

### 4.6 `i18n/`

`index.ts` merges `common`/`builder`/`ai`/`pages` into **one** runtime namespace
(keys are already fully qualified) and owns `<html lang dir>`. `check-i18n.mjs`
enforces parity; `audit-i18n-strings.mjs` enforces that no UI string bypasses `t()`.

---

## 5. `scripts/` — scrapers and gates

Every script here is either **production data collection** or a **release gate**.
One-off probes are not kept.

### Data collection

| Script                | Output                                 | Run                                 |
| --------------------- | -------------------------------------- | ----------------------------------- |
| `crawl-retailers.mjs` | `src/services/retailers/snapshot.json` | manual / CI, resumable per category |
| `sigma_worker.py`     | `public/data/sigma_products.json`      | cron (browser required)             |

### Gates (`pnpm audit:all`)

| Script                                     | Fails when                                     |
| ------------------------------------------ | ---------------------------------------------- |
| `check-i18n.mjs`                           | a key is missing in either language            |
| `audit-i18n-strings.mjs`                   | UI text bypasses `t()`                         |
| `check-orphans.mjs`                        | a file in `src/` is imported by nothing        |
| `check-unused-exports.mjs`                 | an exported function/const is never used       |
| `audit-unused.mjs`                         | reports consoles, commented code, reachability |
| `check-rtl.mjs`, `check-design-system.mjs` | RTL or token violations                        |
| `check-bundle-secrets.mjs`                 | a key-shaped string in the build               |
| `check-deps.mjs`                           | a dependency nobody imports                    |
| `verify-spa-routing.mjs`                   | a deep route 404s on the production build      |
| `verify-ai-function.mjs`                   | the serverless AI route is broken              |
| `verify-listing-coverage.mjs`              | a retailer's data/images regress               |

### Measurement harnesses

`audit-mobile.mjs`, `qa-page.mjs`, `measure-perf.mjs` render real pages and report
what happened. `test-mobile-nav.mjs` drives the mobile drawer.

---

## 6. Data flow

```
                     ┌──────────────── browser ────────────────┐
/search, /builder ──▶│ React Query ─▶ services/retailers       │
                     │                   ├─ snapshot.json      │──▶ cards
                     │                   └─ sigma_products.json│
                     └─────────────────────────────────────────┘
                                    ▲
     crawl-retailers.mjs ───────────┘   (committed snapshot)
     sigma_worker.py    ─────────────┘   (committed feed)

Chat ─▶ services/ai ─▶ /api/ai/… ─▶ Vercel function ─▶ Gemini
```

**Why two shapes of retailer data:** the three server-rendered stores can be
crawled from any Node process; Sigma's catalogue only exists after a browser
renders it, so it is produced by a separate worker and shipped as JSON. The
aggregator merges both into one `RetailerOffer[]`, so everything downstream —
grouping, ranking, comparison — is unaware of the difference.

---

## 7. Conventions

- **Money** is always `number` EGP; `formatCurrency` is the only formatter.
- **Errors** degrade: a missing table, feed or key returns empty data, never a throw
  to the UI.
- **Server keys** have no `VITE_` prefix and are read only in `api/` or `src/server/`.
- **Strings** are translation keys; the UI never renders a literal.
- **Deletion** is preferred to a comment that explains why something is unused.

---

## 8. Verifying the structure

```bash
pnpm audit:all        # every gate above, in order
node scripts/check-orphans.mjs        # 0 orphans expected
node scripts/check-unused-exports.mjs # 0 unused exports expected
```
