-- =============================================================================
-- Nexus PC Builder — initial schema
-- 001_initial_schema.sql
--
-- Order matters: enums → shared trigger fn → catalogue tables → build tables →
-- social/alerts → RLS helpers → policies.
-- Safe to run on a fresh project: `supabase db push` or paste into the SQL editor.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'component_category') then
    create type public.component_category as enum (
      'cpu', 'gpu', 'motherboard', 'ram', 'storage', 'psu', 'case', 'cooling'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- updated_at automation
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. components — the catalogue
-- -----------------------------------------------------------------------------
create table if not exists public.components (
  id uuid primary key default gen_random_uuid(),
  category component_category not null,
  brand text not null,
  model text not null,
  name text not null,
  specs jsonb not null default '{}'::jsonb,
  price numeric(10,2) not null check (price >= 0),
  currency text not null default 'USD',
  stock_status text not null default 'in_stock'
    check (stock_status in ('in_stock', 'out_of_stock', 'limited')),
  store_links jsonb not null default '[]'::jsonb,
  performance_score int check (performance_score between 0 and 100),
  power_draw_watts int check (power_draw_watts is null or power_draw_watts >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint components_model_unique unique (category, brand, model)
);

create index if not exists idx_components_category
  on public.components(category) where is_active = true;
create index if not exists idx_components_specs
  on public.components using gin(specs);
create index if not exists idx_components_price
  on public.components(price) where is_active = true;

drop trigger if exists trg_components_updated_at on public.components;
create trigger trg_components_updated_at
  before update on public.components
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. compatibility_rules — consumed by the Phase 2 engine
-- -----------------------------------------------------------------------------
create table if not exists public.compatibility_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  category_a component_category not null,
  category_b component_category not null,
  rule_type text not null
    check (rule_type in ('match', 'min', 'max', 'formfactor', 'custom')),
  spec_path_a text not null,
  spec_path_b text not null,
  config jsonb not null default '{}'::jsonb,
  message text not null,
  severity text not null default 'error'
    check (severity in ('error', 'warning')),
  created_at timestamptz not null default now()
);

create index if not exists idx_rules_categories
  on public.compatibility_rules(category_a, category_b);

-- -----------------------------------------------------------------------------
-- 3. builds
-- -----------------------------------------------------------------------------
create table if not exists public.builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  use_case text
    check (use_case is null or use_case in ('gaming','ai','editing','programming','workstation','streaming')),
  total_price numeric(10,2) not null default 0,
  total_power_watts int not null default 0,
  build_score int check (build_score is null or build_score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_builds_user on public.builds(user_id);
create index if not exists idx_builds_slug on public.builds(slug);
create index if not exists idx_builds_public on public.builds(created_at desc) where is_public = true;

drop trigger if exists trg_builds_updated_at on public.builds;
create trigger trg_builds_updated_at
  before update on public.builds
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. build_items
-- -----------------------------------------------------------------------------
create table if not exists public.build_items (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.builds(id) on delete cascade,
  component_id uuid not null references public.components(id) on delete restrict,
  quantity int not null default 1 check (quantity > 0),
  price_at_add numeric(10,2) not null check (price_at_add >= 0),
  unique (build_id, component_id)
);

create index if not exists idx_build_items_build on public.build_items(build_id);
create index if not exists idx_build_items_component on public.build_items(component_id);

-- -----------------------------------------------------------------------------
-- 5. saved_alerts
-- -----------------------------------------------------------------------------
create table if not exists public.saved_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  component_id uuid not null references public.components(id) on delete cascade,
  alert_type text not null check (alert_type in ('price_drop', 'back_in_stock')),
  target_price numeric(10,2),
  is_active boolean not null default true,
  triggered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, component_id, alert_type)
);

create index if not exists idx_alerts_user
  on public.saved_alerts(user_id) where is_active = true;
create index if not exists idx_alerts_component on public.saved_alerts(component_id);

-- -----------------------------------------------------------------------------
-- 6. community_builds
-- -----------------------------------------------------------------------------
create table if not exists public.community_builds (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.builds(id) on delete cascade unique,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  tags text[] not null default '{}',
  rating_avg numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count int not null default 0 check (rating_count >= 0),
  views int not null default 0 check (views >= 0),
  published_at timestamptz not null default now()
);

create index if not exists idx_community_tags on public.community_builds using gin(tags);
create index if not exists idx_community_rating on public.community_builds(rating_avg desc);
create index if not exists idx_community_author on public.community_builds(author_id);

-- -----------------------------------------------------------------------------
-- Build totals trigger — keeps total_price / total_power_watts authoritative
-- -----------------------------------------------------------------------------
create or replace function public.recalculate_build_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_build uuid := coalesce(new.build_id, old.build_id);
begin
  update public.builds b
     set total_price = coalesce((
           select sum(bi.price_at_add * bi.quantity)
             from public.build_items bi
            where bi.build_id = target_build
         ), 0),
         total_power_watts = coalesce((
           select sum(coalesce(c.power_draw_watts, 0) * bi.quantity)
             from public.build_items bi
             join public.components c on c.id = bi.component_id
            where bi.build_id = target_build
         ), 0)
   where b.id = target_build;

  return null;
end;
$$;

drop trigger if exists trg_build_items_totals on public.build_items;
create trigger trg_build_items_totals
  after insert or update or delete on public.build_items
  for each row execute function public.recalculate_build_totals();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.components          enable row level security;
alter table public.compatibility_rules enable row level security;
alter table public.builds              enable row level security;
alter table public.build_items         enable row level security;
alter table public.saved_alerts        enable row level security;
alter table public.community_builds    enable row level security;

-- --- components: public read, service-role write -----------------------------
drop policy if exists "components_public_read" on public.components;
create policy "components_public_read"
  on public.components for select
  using (true);

-- (No insert/update/delete policies: only the service_role key bypasses RLS,
--  which is how the seed + admin tooling write to the catalogue.)

-- --- compatibility_rules: public read, service-role write --------------------
drop policy if exists "rules_public_read" on public.compatibility_rules;
create policy "rules_public_read"
  on public.compatibility_rules for select
  using (true);

-- --- builds: owner CRUD + public read of published builds --------------------
drop policy if exists "builds_owner_select" on public.builds;
create policy "builds_owner_select"
  on public.builds for select
  using (auth.uid() = user_id or is_public = true);

drop policy if exists "builds_owner_insert" on public.builds;
create policy "builds_owner_insert"
  on public.builds for insert
  with check (auth.uid() = user_id);

drop policy if exists "builds_owner_update" on public.builds;
create policy "builds_owner_update"
  on public.builds for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "builds_owner_delete" on public.builds;
create policy "builds_owner_delete"
  on public.builds for delete
  using (auth.uid() = user_id);

-- --- build_items: follow the parent build's visibility ----------------------
drop policy if exists "build_items_read" on public.build_items;
create policy "build_items_read"
  on public.build_items for select
  using (
    exists (
      select 1 from public.builds b
       where b.id = build_items.build_id
         and (b.user_id = auth.uid() or b.is_public = true)
    )
  );

drop policy if exists "build_items_write" on public.build_items;
create policy "build_items_write"
  on public.build_items for all
  using (
    exists (select 1 from public.builds b where b.id = build_items.build_id and b.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.builds b where b.id = build_items.build_id and b.user_id = auth.uid())
  );

-- --- saved_alerts: strictly owner ------------------------------------------
drop policy if exists "alerts_owner_all" on public.saved_alerts;
create policy "alerts_owner_all"
  on public.saved_alerts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --- community_builds: public read, owner write -----------------------------
drop policy if exists "community_public_read" on public.community_builds;
create policy "community_public_read"
  on public.community_builds for select
  using (true);

drop policy if exists "community_owner_insert" on public.community_builds;
create policy "community_owner_insert"
  on public.community_builds for insert
  with check (auth.uid() = author_id);

drop policy if exists "community_owner_update" on public.community_builds;
create policy "community_owner_update"
  on public.community_builds for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "community_owner_delete" on public.community_builds;
create policy "community_owner_delete"
  on public.community_builds for delete
  using (auth.uid() = author_id);

-- -----------------------------------------------------------------------------
-- Grants (RLS still governs row access)
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.components, public.compatibility_rules, public.community_builds to anon, authenticated;
grant select on public.builds, public.build_items to anon, authenticated;
grant select, insert, update, delete on public.builds, public.build_items, public.saved_alerts to authenticated;
grant insert, update, delete on public.community_builds to authenticated;
