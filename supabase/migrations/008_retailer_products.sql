-- ===========================================================================
-- 008 — Egyptian retailer products (scraped price aggregation)
-- ===========================================================================
--
-- None of the four target retailers exposes a public API, so prices are
-- gathered by the `retailer-sync` Edge Function and stored here. The frontend
-- only ever READS this table — scraping never happens in the browser.
--
-- Shape follows the Phase 7 spec, with the additions the UI actually needs:
--   · `matched_component_id` links a retailer row to a catalogue component
--     (fuzzy match runs in the sync function, not on read).
--   · `match_confidence` lets the UI hide shaky matches instead of showing a
--     wrong price as fact.
--   · `currency` is stored per row so a future non-EGP retailer cannot corrupt
--     a price comparison.
--
-- Idempotent: safe to apply twice.
-- ===========================================================================

create table if not exists public.retailer_products (
  id uuid primary key default gen_random_uuid(),

  -- 'sigma' | 'alfrensia' | 'elnekhely' | 'elbadr'
  retailer_id text not null,
  -- SKU, slug or OpenCart product id
  external_id text not null,

  name text not null,
  category public.component_category,

  price_egp numeric(12, 2) not null check (price_egp >= 0),
  -- Only set when the retailer shows a struck-through "was" price.
  original_price_egp numeric(12, 2),

  currency text not null default 'EGP',
  stock_status text not null default 'unknown'
    check (stock_status in ('in_stock', 'out_of_stock', 'limited', 'unknown')),

  product_url text not null,
  image_url text,

  -- Free-form scrape payload (brand, model, part number, raw price text…).
  specs jsonb not null default '{}'::jsonb,

  -- Catalogue link, filled by the fuzzy matcher in the sync function.
  matched_component_id uuid references public.components(id) on delete set null,
  match_confidence numeric(4, 3)
    check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1)),

  last_scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (retailer_id, external_id)
);

create index if not exists idx_retailer_products_category
  on public.retailer_products (category);
create index if not exists idx_retailer_products_price
  on public.retailer_products (price_egp);
create index if not exists idx_retailer_products_matched
  on public.retailer_products (matched_component_id);
create index if not exists idx_retailer_products_retailer
  on public.retailer_products (retailer_id);

comment on table public.retailer_products is
  'Scraped Egyptian retailer listings. Written only by the retailer-sync Edge Function.';
comment on column public.retailer_products.external_id is
  'Retailer-native id: OpenCart product id, WooCommerce slug, or Sigma SKU.';

-- ---------------------------------------------------------------------------
-- Row level security — this is public price data.
-- ---------------------------------------------------------------------------
alter table public.retailer_products enable row level security;

drop policy if exists "retailer products are public" on public.retailer_products;
create policy "retailer products are public"
  on public.retailer_products for select
  using (true);

-- No insert/update/delete policy: writes go through the service role held by
-- the Edge Function, never from the browser.
--
-- The GRANT is not optional. A policy alone is not enough: PostgREST checks table
-- privileges BEFORE row security, so without this the anon key gets
--   401 {"code":"42501","message":"permission denied for table retailer_products"}
-- and the entire search page degrades. This bit the Phase 8 build on a project
-- where the table had been created by hand.
grant select on public.retailer_products to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scrape audit log — one row per retailer per run, so a silent breakage is
-- visible instead of "prices just stopped updating".
-- ---------------------------------------------------------------------------
create table if not exists public.retailer_sync_runs (
  id uuid primary key default gen_random_uuid(),
  retailer_id text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'ok', 'partial', 'failed', 'blocked')),
  pages_fetched integer not null default 0,
  products_seen integer not null default 0,
  products_upserted integer not null default 0,
  products_matched integer not null default 0,
  error text
);

create index if not exists idx_retailer_sync_runs_retailer
  on public.retailer_sync_runs (retailer_id, started_at desc);

alter table public.retailer_sync_runs enable row level security;

drop policy if exists "sync runs are public" on public.retailer_sync_runs;
create policy "sync runs are public"
  on public.retailer_sync_runs for select
  using (true);

grant select on public.retailer_sync_runs to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cheapest-in-stock view: one row per catalogue component.
--
-- The UI asks "what does this part cost?" far more often than it asks for the
-- raw table, so the join + min() lives here rather than in every query.
-- ---------------------------------------------------------------------------
create or replace view public.component_best_price as
select
  rp.matched_component_id as component_id,
  min(rp.price_egp) filter (where rp.stock_status = 'in_stock') as best_price_egp,
  min(rp.price_egp) as lowest_price_egp,
  count(*) as retailer_count,
  (array_agg(rp.retailer_id order by
      case when rp.stock_status = 'in_stock' then 0 else 1 end,
      rp.price_egp))[1] as best_retailer_id,
  (array_agg(rp.product_url order by
      case when rp.stock_status = 'in_stock' then 0 else 1 end,
      rp.price_egp))[1] as best_url,
  max(rp.last_scraped_at) as last_scraped_at
from public.retailer_products rp
where rp.matched_component_id is not null
  and (rp.match_confidence is null or rp.match_confidence >= 0.55)
group by rp.matched_component_id;

comment on view public.component_best_price is
  'Cheapest in-stock retailer price per catalogue component (match confidence >= 0.55).';

grant select on public.component_best_price to anon, authenticated;
