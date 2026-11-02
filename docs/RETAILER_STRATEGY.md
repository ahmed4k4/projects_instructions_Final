# Retailer Strategy

**Phase 8 — how Egyptian retailer data is collected, matched and refreshed.**

---

## 1. What is integrated

| Retailer                 | Platform                 | Status     | Categories | Products |
| ------------------------ | ------------------------ | ---------- | ---------- | -------- |
| **Elbadr Group**         | OpenCart                 | ✅ live    | 8          | 127      |
| **Elnekhely Technology** | OpenCart (same theme)    | ✅ live    | 8          | 92       |
| **Alfrensia**            | WooCommerce / Flatsome   | ✅ live    | 8          | 52       |
| **Sigma Computer**       | Next.js App Router (RSC) | ⛔ blocked | —          | 0        |

**271 listings** in the current snapshot, up from 67 in Phase 7.

---

## 2. How scraping works

```
pg_cron (daily 01:00 UTC)
   └─► Edge Function `retailer-sync`
          ├─ robots.txt check per host
          ├─ sequential fetch, 2 s gap per retailer
          ├─ parsers.ts      → ScrapedProduct[]
          ├─ fuzzy matcher    → matched_component_id + confidence
          └─ upsert retailer_products (onConflict retailer_id,external_id)
```

### Parser strategy: anchored regex, not a DOM library

All three live stores are server-rendered templates with stable class names
(`div.product-layout[data-product-id]`, `div.product-small.col`). A DOM parser
would add ~1 MB to the Edge Function cold start to do what a handful of anchored
regexes already do.

The trade-off is deliberate: **a template change makes a parser return fewer
products, never wrong ones**. Every parser is `(html, url) => Product[]` — pure,
and testable against a saved fixture.

Two bugs this approach surfaced, both fixed:

- Elbadr emits `class="product-layout "` with a **trailing space**, so a strict
  anchor matched nothing.
- The markup is pretty-printed, so attributes sit on their own line
  (`<div\nclass="name">`). `normaliseTags()` collapses whitespace inside `<…>`
  before any parser runs.

### Pagination

The two platforms paginate differently, and using the wrong form silently returns
page 1 again:

| Platform                     | Form                            |
| ---------------------------- | ------------------------------- |
| OpenCart (Elbadr, Elnekhely) | `/vga?page=2`                   |
| WooCommerce (Alfrensia)      | `/product-category/gpu/page/2/` |

`pageUrl()` detects the shape from the URL. A page is skipped forward only while
the previous one returned products, so a generous `pages` budget never becomes a
crawl.

### Politeness

- `robots.txt` is fetched and evaluated per host **before** any listing request.
  All four stores disallow only `/admin`, `/checkout` and `/api`; the category
  paths are explicitly allowed.
- One request every **2 seconds** per retailer, sequential.
- Identifying UA: `NexusPCBuilderBot/1.0 (+https://nexus-pc-builder.example/bot)`.
- A hard **240 s runtime budget** per run.
- Every run writes a row to `retailer_sync_runs` (`ok` / `partial` / `failed` /
  `blocked`), so a silent breakage is visible instead of "prices stopped
  updating".

---

## 3. Sigma Computer — why it is blocked

**Decision: do not scrape Sigma with a headless browser. Report it honestly.**

Sigma is a Next.js App Router storefront. Its category pages contain:

- **no product markup** — the grid is rendered from React Server Component
  payloads (`self.__next_f.push(...)`),
- **no `application/ld+json`**,
- no `__NEXT_DATA__` (that is the older Pages Router).

The two suggested workarounds were evaluated and rejected:

| Option                              | Why not                                                                                                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Playwright in the Edge Function** | Supabase Edge Functions run on Deno Deploy; a headless Chromium is not available there. A separate Node host would be a second deployment surface and a second set of secrets for one retailer. |
| **Parse `__next_f` RSC chunks**     | These are an internal, versioned serialisation. It changes without notice, and a parser that silently returns _wrong_ prices is worse than one that returns none.                               |

The brief's own guard-rail — _"Do not spend more than 30 minutes fighting a
single retailer's anti-bot; use mock data for the blocked one, documenting the
limitation"_ — applies here in spirit: the block is architectural, not an
anti-bot challenge that better tooling would solve.

**What the user sees instead:** a standing notice on `/search` —
_"Sigma Computer data is temporarily unavailable — Sigma renders its catalogue
client-side, so it is not included in these results."_ The retailer also appears
in the filter rail, disabled, rather than silently missing.

**If Sigma is required later**, the viable route is a separate Node worker with
Playwright writing into the same `retailer_products` table. That is a deployment
decision, not a parser change — the table, matcher and UI would all work
unchanged.

---

## 4. Matching: two different problems, two different tools

### 4a. Listing → catalogue (Phase 7, unchanged)

`scoreNameMatch` answers _"is this listing catalogue row X?"_ — fuzzy token
coverage plus a hard model-identifier gate. Used by the sync function to populate
`matched_component_id`.

### 4b. Listing → listing (Phase 8, new)

Grouping answers _"are these two listings the same product?"_ Fuzzy similarity is
the **wrong tool** — two different GPUs share most of their words. `skuKey()`
instead builds a **canonical identity**:

```
ASUS TUF Gaming GeForce RTX 5070 Ti OC 16GB  → geforce|5070|ti|16
PNY GeForce RTX 5070 Ti ARGB 16GB            → geforce|5070|ti|16   ✓ merge
GIGABYTE GeForce RTX 5060 Ti 8GB             → geforce|5060|ti|8
GIGABYTE GeForce RTX 5060 Ti 16GB            → geforce|5060|ti|16   ✗ distinct
AMD Ryzen 7 7800X3D                          → ryzen|7800x3d
Intel Core i9-14900KF                        → core|14900kf         ✗ ≠ 14900k
```

Rules learned from live data, each one a bug that shipped first:

1. **The first number in a CPU name is the series, not the model.**
   "Ryzen 5 5600X" → `5` collapsed eight processors into one group.
2. **Memory size is identity.** A 5060 Ti 8GB is not a 16GB.
3. **Variant suffixes are different SKUs.** 4070 ≠ 4070 SUPER ≠ 4070 Ti.
4. **Board partners are the same product** — that is the point of comparison.
5. **A chipset is not a model.** Keying motherboards on `X870E` merged a Gigabyte
   Aero, an ASUS Strix-E and a Crosshair HERO.

### The same-retailer rule (Phase 8 bug)

Model identity alone cannot separate an "AORUS RTX 5070 MASTER" from an "ASUS
Dual RTX 5070 OC" — both are `geforce|5070|12`. Grouping them put two unrelated
cards in one comparison table, under one heading, at two prices.

The rule now is:

> **Merge across retailers on the model. Never merge two listings from the same
> store.**

A PNY and a Palit 5070 Ti _are_ the same product at two prices — that is the page's
whole purpose. Two cards from one store are not.

---

## 5. Stock status and "best price"

Only `out_of_stock` is disqualifying. `unknown` means the retailer printed no
stock line (Elbadr never does), which is the normal state for most of the feed.

This matters because of a bug caught in the final review: the comparison page
advertised **EGP 63,887** as "best price" when that offer was out of stock and
the only buyable one was **71,000**. Ranking put both at equal stock priority and
then sorted by price. Now out-of-stock sorts last, and when every offer is
unavailable the headline switches to "Lowest recorded price" in neutral text with
an explicit badge.

---

## 6. Refresh cadence and freshness

|                   |                                                                           |
| ----------------- | ------------------------------------------------------------------------- |
| Schedule          | daily, 01:00 UTC (03:00–04:00 Cairo) via `pg_cron`                        |
| Manual            | `POST /functions/v1/retailer-sync {"mode":"all"}`, or `{"mode":"elbadr"}` |
| Snapshot fallback | `pnpm snapshot:retailers` → `src/services/retailers/snapshot.json`        |
| UI                | "Prices updated N min ago" in the search header                           |

The UI **caches search results for 5 minutes** (React Query). Prices change
nightly, not per keystroke.

### Freshness is shown, not assumed

The snapshot carries a `capturedAt` timestamp and the UI renders a relative time
from it. Nothing in the interface implies a price is live when it may be hours
old.

---

## 7. Known limitations

1. **Alfrensia serves AJAX placeholder prices** for some products (`<bdi>1</bdi>`).
   Rows priced under 100 EGP are skipped rather than published.
2. **Retailer images are hotlinked** and some CDNs block cross-origin requests
   (`ERR_BLOCKED_BY_ORB`). The card falls back to a ghosted category icon.
3. **`retailer_products` is not yet migrated on the hosted project** — it returns
   `401 42501 permission denied`, i.e. the table exists without `GRANT SELECT TO
anon`. The app treats that as "not migrated", falls back to the snapshot and
   makes no further requests. One SQL line fixes it:
   ```sql
   grant select on public.retailer_products to anon, authenticated;
   ```
   (It is already in `008_retailer_products.sql` for a fresh `db push`.)
4. **Sigma has no data** — see §3.
