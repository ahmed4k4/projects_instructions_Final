# Retailer Strategy

**Phase 10 — how Egyptian retailer data is collected, matched and refreshed.**

---

## 1. What is integrated

| Retailer                 | Platform                 | Status  | Categories | Products | Images |
| ------------------------ | ------------------------ | ------- | ---------- | -------- | ------ |
| **Elbadr Group**         | OpenCart                 | ✅ live | 8          | 1825     | 100%   |
| **Elnekhely Technology** | OpenCart (same theme)    | ✅ live | 8          | 750      | 99.7%  |
| **Alfrensia**            | WooCommerce / Flatsome   | ✅ live | 8          | 221      | 100%   |
| **Sigma Computer**       | Next.js (browser worker) | ✅ live | 8          | 293      | 100%   |
| **Total**                |                          |         |            | **3089** | 99.94% |

Per category:

| Category    | Elbadr | Elnekhely | Alfrensia | Sigma | Total |
| ----------- | -----: | --------: | --------: | ----: | ----: |
| CPU         |    304 |       189 |        75 |    85 |   653 |
| GPU         |    433 |       118 |         4 |    43 |   598 |
| Motherboard |    270 |       123 |        47 |    23 |   463 |
| RAM         |    205 |        50 |        24 |    17 |   296 |
| Storage     |    159 |        22 |        39 |    25 |   245 |
| PSU         |    274 |        99 |        10 |    35 |   418 |
| Case        |    130 |       126 |        30 |    40 |   326 |
| Cooling     |     85 |        26 |        14 |    25 |   150 |

> **Phase 11 corrected Elnekhely.** The inherited "503 on page 2" was User-Agent
> filtering, not pagination: the same URL answers 200 to a browser UA. With
> `limit=100` and a same-origin referrer its catalogue went from **103 to 753**
> products. See `docs/AUDIT.md` §42.

Two Elnekhely rows and no others store no image: their only photo is the store's
own `placeholder-350x350.png`, so the card draws a category icon. A wrong photo
would be worse than none.

Alfrensia's GPU figure is small on purpose — its graphics-card listing carries
only four products with a real (non-AJAX) price. It makes up the difference in
CPU and motherboard.

### Elnekhely's ceiling

Page 2+ answers **503** on every URL form tried (`?page=2`, `/page/2/`,
`&page=2`), so ~100 products from page 1 of eight categories is its accessible
maximum. Its page budgets are a ceiling it will not reach; the sync records
`partial` rather than failing the retailer, and this is why it is marked partial
above.

### Alfrensia images — root cause found in Phase 10

Its listing cards put a **"3-year warranty" badge PNG first** in the card, then
the lazy product `<img src="data:…" data-src="…">`. The extractor returned the
first candidate it found, so 81 % of rows were stored pointing at a badge. The
shared `extractImage()` now rejects badge/logo/flag URLs everywhere, and the
share went from **19 % to 100 %**. Two category slugs were also 404s (`case`,
`cooling`); the real paths are `/product-category/cases/` and
`/product-category/air-liquid-cooling/`.

---

## 2. How scraping works

```
pg_cron (daily 01:00 UTC)
   └─â–؛ Edge Function `retailer-sync`
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

## 3. Sigma Computer — solved with a browser worker

**Decision (Phase 10): a headless browser renders the real page and publishes a
JSON feed. The browser never scrapes, and the serverless sync never tries.**

### What was measured (2026-11-02)

Every plausible route was tried and recorded, so nothing below is a guess:

| Route | Result |
|---|---|
| `GET /en/category/vga` | rewrites to a search page that renders **"Something went wrong"** |
| `GET /en/category/<uuid>` | 200, but **no product markup** — only `self.__next_f` RSC payloads |
| `GET /en/search` | ✅ renders a real paginated grid — the surface the worker uses |
| `api.sigma-computer.com/api/stores/v1/products` | **403 Unauthorized** (key-gated) |
| `api.sigma-computer.com/media/…` | **200** to a page request, blocked for a hotlinked `<img>` |

The listing is narrowed the way a shopper narrows it: click a leaf label in the
Categories rail (`Nvidia GeForce`, `AMD CPU`, `Mid Tower`, …). Pagination is an
`aria-label="page N"` control, **not** a numbered button — matching on text
silently re-reads page 1.

### The worker

`scripts/sigma_worker.py` (Playwright, Python) writes
`public/data/sigma_products.json`:

```bash
pip install playwright && python -m playwright install chromium

python scripts/sigma_worker.py                 # full catalogue
python scripts/sigma_worker.py --only gpu --max-pages 3
```

| Property | Value |
|---|---|
| Surface | `/en/search`, one rail label at a time |
| Extraction | render, then read DOM cards (`a[href*="/en/item"]`, price `<p>`, `<img>`) |
| Images | media URLs wrapped in `sigma-computer.com/_next/image?url=…` — the only form a browser can load |
| Politeness | one page at a time, 2.5 s gap, identifying UA, page cap per label |
| Failure mode | an empty run writes `status: "blocked"` with notes — never invented prices |
| Current capture | **300 products, 100 % with images**, all 8 categories |

### How the app consumes it

`src/services/retailers/sigmaFeed.ts` fetches `data/sigma_products.json`
**relative to the deploy base**, and the aggregator merges those rows into the
snapshot set, so grouping, ranking and the compare table treat Sigma like any
other store. A bundled copy (`sigmaSnapshot.ts`) answers on first paint before
any request resolves, so `/search` never flashes "Sigma pending".

Availability is data-driven: Sigma is *live* exactly when the feed has rows
(`useLiveRetailers`). With an empty feed the UI keeps its honest **Pending**
badge and the standing notice rather than pretending the store does not exist.

### Cron it

A headless browser cannot run on Vercel or Deno Deploy, so the worker runs on a
schedule and commits its output. GitHub Actions example:

```yaml
name: sigma-feed
on:
  schedule: [{ cron: '0 1 * * *' }]
  workflow_dispatch:
jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install playwright && python -m playwright install --with-deps chromium
      - run: python scripts/sigma_worker.py
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: 'chore: refresh sigma feed'
          file_pattern: public/data/sigma_products.json
```

The app picks the new file up on the next deploy, and `sigmaFeed.ts` also
re-reads it at runtime, so a fresh capture does not need a code change.

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
PNY GeForce RTX 5070 Ti ARGB 16GB            → geforce|5070|ti|16   âœ“ merge
GIGABYTE GeForce RTX 5060 Ti 8GB             → geforce|5060|ti|8
GIGABYTE GeForce RTX 5060 Ti 16GB            → geforce|5060|ti|16   âœ— distinct
AMD Ryzen 7 7800X3D                          → ryzen|7800x3d
Intel Core i9-14900KF                        → core|14900kf         âœ— â‰  14900k
```

Rules learned from live data, each one a bug that shipped first:

1. **The first number in a CPU name is the series, not the model.**
   "Ryzen 5 5600X" → `5` collapsed eight processors into one group.
2. **Memory size is identity.** A 5060 Ti 8GB is not a 16GB.
3. **Variant suffixes are different SKUs.** 4070 â‰  4070 SUPER â‰  4070 Ti.
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
| Snapshot fallback | `pnpm crawl` → `src/services/retailers/snapshot.json`        |
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
2. **Retailer images are hotlinked** and individual files disappear from the
   stores' own CDs. `retailerImageUrl()` rejects known placeholders, the card
   falls back to a ghosted category icon, and one dead file is one card — never a
   broken grid.
3. **`retailer_products` is not yet migrated on the hosted project** — it returns
   `401 42501 permission denied`, i.e. the table exists without `GRANT SELECT TO
anon`. The app treats that as "not migrated", falls back to the snapshot and
   makes no further requests. One SQL line fixes it:
   ```sql
   grant select on public.retailer_products to anon, authenticated;
   ```
   (It is already in `008_retailer_products.sql` for a fresh `db push`.)
4. **Sigma's feed is a capture, not a live feed.** It carries `capturedAt` and is
   refreshed by the worker on a schedule (آ§3). The UI never presents a price as
   live when it may be hours old.
5. **Sigma is not in the nightly serverless sync** by design — that is what the
   worker exists for. Pointing the cron job at `scripts/sigma_worker.py` is the
   only setup needed.
