-- =============================================================================
-- 003_performance_data.sql
--
-- Deterministic FPS benchmarks + the cache for AI-estimated FPS.
--
-- The estimator (src/lib/performance/estimator.ts) reads `fps_benchmarks`
-- first; any (gpu, game, resolution, preset) combination that is missing falls
-- back to a Gemini estimate which is cached in `ai_fps_estimates` so a given
-- combination is only ever billed once.
-- =============================================================================
create table
  if not exists public.fps_benchmarks (
    id uuid primary key default gen_random_uuid (),
    gpu_model text not null,
    game_title text not null,
    resolution text not null check (resolution in ('1080p', '1440p', '4k')),
    quality_preset text not null default 'high',
    fps_avg int not null check (fps_avg > 0),
    cpu_test_used text,
    created_at timestamptz not null default now (),
    unique (gpu_model, game_title, resolution, quality_preset)
  );

create index if not exists idx_fps_bench_gpu on public.fps_benchmarks (gpu_model, resolution);

alter table public.fps_benchmarks enable row level security;

drop policy if exists "fps_benchmarks_public_read" on public.fps_benchmarks;

create policy "fps_benchmarks_public_read" on public.fps_benchmarks for
select
  using (true);

-- Editors (app_metadata.role) manage the benchmark table; service_role bypasses RLS.
drop policy if exists "fps_benchmarks_editor_write" on public.fps_benchmarks;

create policy "fps_benchmarks_editor_write" on public.fps_benchmarks for all using (public.is_catalogue_editor ())
with
  check (public.is_catalogue_editor ());

grant
select
  on public.fps_benchmarks to anon,
  authenticated;

-- -----------------------------------------------------------------------------
-- AI-generated FPS estimates (cache)
-- -----------------------------------------------------------------------------
create table
  if not exists public.ai_fps_estimates (
    id uuid primary key default gen_random_uuid (),
    gpu_model text not null,
    game_title text not null,
    resolution text not null,
    quality_preset text not null default 'high',
    fps_avg int not null,
    model text,
    created_at timestamptz not null default now (),
    unique (gpu_model, game_title, resolution, quality_preset)
  );

alter table public.ai_fps_estimates enable row level security;

drop policy if exists "ai_fps_estimates_read" on public.ai_fps_estimates;

create policy "ai_fps_estimates_read" on public.ai_fps_estimates for
select
  using (true);

grant
select
  on public.ai_fps_estimates to anon,
  authenticated;

grant insert,
update on public.ai_fps_estimates to authenticated;

-- -----------------------------------------------------------------------------
-- AI usage log — backs the per-user rate limiter in the gemini-proxy function
-- -----------------------------------------------------------------------------
create table
  if not exists public.ai_usage (
    id uuid primary key default gen_random_uuid (),
    user_id uuid not null references auth.users (id) on delete cascade,
    action text not null default 'gemini',
    created_at timestamptz not null default now ()
  );

create index if not exists idx_ai_usage_user_time on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

-- Users may read their own usage; only the edge function (service_role) writes.
drop policy if exists "ai_usage_self_read" on public.ai_usage;

create policy "ai_usage_self_read" on public.ai_usage for
select
  using (auth.uid () = user_id);

grant
select
  on public.ai_usage to authenticated;