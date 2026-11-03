-- Database-backed signup throttling for the server-only username signup route.
create table if not exists public.username_signup_attempts (
  id bigint generated always as identity primary key,
  fingerprint text not null,
  created_at timestamptz not null default now()
);

create index if not exists username_signup_attempts_fingerprint_created_idx
  on public.username_signup_attempts (fingerprint, created_at desc);

alter table public.username_signup_attempts enable row level security;
revoke all on public.username_signup_attempts from anon, authenticated, public;

create or replace function public.consume_username_signup_slot(
  p_fingerprint text,
  p_limit integer default 5,
  p_window_seconds integer default 3600
)
returns boolean
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
  if p_limit < 1 or p_limit > 20 or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'INVALID_QUOTA_ARGUMENTS';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint, 0));
  select count(*)::integer into v_used
    from public.username_signup_attempts
   where fingerprint = p_fingerprint
     and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_used >= p_limit then
    return false;
  end if;

  insert into public.username_signup_attempts (fingerprint, created_at)
  values (p_fingerprint, now());

  -- Opportunistic cleanup; never needed for correctness of the quota check.
  delete from public.username_signup_attempts where created_at < now() - interval '2 days';
  return true;
end;
$$;

revoke all on function public.consume_username_signup_slot(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_username_signup_slot(text, integer, integer) to service_role;
