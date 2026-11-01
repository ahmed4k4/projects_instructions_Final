-- =============================================================================
-- 005_ratings.sql
--
-- Community ratings. The aggregate on `community_builds` is maintained by a
-- trigger so reads never need to aggregate build_ratings at query time.
-- =============================================================================

create table if not exists public.build_ratings (
  id uuid primary key default gen_random_uuid(),
  community_build_id uuid not null references public.community_builds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One rating per user per published build.
  unique (community_build_id, user_id)
);

create index if not exists idx_build_ratings_community
  on public.build_ratings(community_build_id);

drop trigger if exists trg_build_ratings_updated_at on public.build_ratings;
create trigger trg_build_ratings_updated_at
  before update on public.build_ratings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Recompute rating_avg / rating_count on the parent community build.
-- -----------------------------------------------------------------------------
create or replace function public.sync_community_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.community_build_id, old.community_build_id);
begin
  update public.community_builds cb
     set rating_avg = coalesce((
           select round(avg(r.rating)::numeric, 2)
             from public.build_ratings r
            where r.community_build_id = target
         ), 0),
         rating_count = (
           select count(*) from public.build_ratings r where r.community_build_id = target
         )
   where cb.id = target;

  return null;
end;
$$;

drop trigger if exists trg_build_ratings_sync on public.build_ratings;
create trigger trg_build_ratings_sync
  after insert or update or delete on public.build_ratings
  for each row execute function public.sync_community_rating();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.build_ratings enable row level security;

-- Aggregates are public; individual rows are not, so a user cannot see who
-- rated a build below 5 stars.
drop policy if exists "build_ratings_own_read" on public.build_ratings;
create policy "build_ratings_own_read"
  on public.build_ratings for select
  using (auth.uid() = user_id);

drop policy if exists "build_ratings_own_insert" on public.build_ratings;
create policy "build_ratings_own_insert"
  on public.build_ratings for insert
  with check (auth.uid() = user_id);

drop policy if exists "build_ratings_own_update" on public.build_ratings;
create policy "build_ratings_own_update"
  on public.build_ratings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.build_ratings to authenticated;

-- -----------------------------------------------------------------------------
-- Anonymous visitors may increment the view counter. Implemented as a
-- security-definer RPC so the row itself stays write-protected.
-- -----------------------------------------------------------------------------
create or replace function public.increment_build_view(target_build uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.community_builds set views = views + 1 where id = target_build;
$$;

grant execute on function public.increment_build_view(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- A published build must be public. Enforced at insert time so the community
-- feed cannot link to a private build the anon role cannot read.
-- -----------------------------------------------------------------------------
create or replace function public.require_public_build()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_pub boolean;
  owner uuid;
begin
  select is_public, user_id into is_pub, owner from public.builds where id = new.build_id;

  if owner is null then
    raise exception 'Build % does not exist', new.build_id;
  end if;
  if owner <> new.author_id then
    raise exception 'You can only publish your own builds';
  end if;
  if not is_pub then
    update public.builds set is_public = true where id = new.build_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_community_require_public on public.community_builds;
create trigger trg_community_require_public
  before insert on public.community_builds
  for each row execute function public.require_public_build();
