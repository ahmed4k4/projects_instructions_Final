-- -----------------------------------------------------------------------------
-- 013 — Single-round-trip AI authorization + atomic per-user quota consumption.
--
-- Migration 011 made the Vercel proxy call Auth (/auth/v1/user) and then the
-- service-role quota RPC sequentially. This function uses the already-verified
-- Supabase JWT context (auth.uid()) and validates the corresponding auth.users
-- record inside the database, so one PostgREST RPC performs both operations.
-- No service-role secret is required by the AI proxy.
-- -----------------------------------------------------------------------------

create or replace function public.consume_ai_usage_for_current_user(
  p_limit integer default 60,
  p_window_seconds integer default 60
)
returns table (allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_email text;
  v_email_confirmed_at timestamptz;
  v_is_anonymous boolean;
  v_used integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  select u.email, u.email_confirmed_at, coalesce(u.is_anonymous, false)
    into v_email, v_email_confirmed_at, v_is_anonymous
    from auth.users u
   where u.id = v_user_id;

  if v_email is null or v_is_anonymous or v_email_confirmed_at is null then
    raise exception using errcode = '42501', message = 'EMAIL_NOT_CONFIRMED';
  end if;

  if p_limit < 1 or p_limit > 120 then
    raise exception 'p_limit must be between 1 and 120';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'p_window_seconds must be between 1 and 3600';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select count(*)::integer
    into v_used
    from public.ai_usage
   where user_id = v_user_id
     and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_used >= p_limit then
    return query select false, 0;
    return;
  end if;

  insert into public.ai_usage (user_id, action, created_at)
  values (v_user_id, 'gemini', now());

  return query select true, greatest(0, p_limit - v_used - 1);
end;
$$;

revoke all on function public.consume_ai_usage_for_current_user(integer, integer) from public, anon;
grant execute on function public.consume_ai_usage_for_current_user(integer, integer) to authenticated;
