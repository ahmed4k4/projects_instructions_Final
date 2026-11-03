-- Guest AI quota: public visitors can use the complete AI experience without
-- creating an account. The Vercel proxy hashes the client IP server-side and
-- passes only the fingerprint to this SECURITY DEFINER function.
create table if not exists public.ai_guest_usage (
  id bigint generated always as identity primary key,
  fingerprint text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_guest_usage_fingerprint_created_idx
  on public.ai_guest_usage (fingerprint, created_at desc);
create index if not exists ai_guest_usage_created_at_idx
  on public.ai_guest_usage (created_at);

alter table public.ai_guest_usage enable row level security;
revoke all on public.ai_guest_usage from anon, authenticated, public;

create or replace function public.consume_ai_usage_for_guest(
  p_fingerprint text,
  p_limit integer default 30,
  p_window_seconds integer default 60
)
returns table (allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
begin
  if p_fingerprint is null or length(p_fingerprint) <> 64 or p_fingerprint !~ '^[a-f0-9]+$' then
    raise exception using errcode = '22023', message = 'INVALID_FINGERPRINT';
  end if;
  if p_limit < 1 or p_limit > 60 or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception using errcode = '22023', message = 'INVALID_QUOTA_ARGUMENTS';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint, 0));

  select count(*)::integer into v_used
    from public.ai_guest_usage
   where fingerprint = p_fingerprint
     and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_used >= p_limit then
    return query select false, 0;
    return;
  end if;

  insert into public.ai_guest_usage (fingerprint, created_at)
  values (p_fingerprint, now());
  return query select true, greatest(0, p_limit - v_used - 1);
end;
$$;

revoke all on function public.consume_ai_usage_for_guest(text, integer, integer) from public, authenticated;
grant execute on function public.consume_ai_usage_for_guest(text, integer, integer) to anon;
