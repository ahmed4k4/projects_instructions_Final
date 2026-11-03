-- Atomic per-user AI quota consumption for the Vercel Gemini proxy.
--
-- The function is intentionally executable only by service_role. The Vercel
-- server first validates the user's JWT with Supabase Auth, then supplies that
-- verified user id here. A transaction-scoped advisory lock prevents concurrent
-- requests from racing past the per-user rolling-window limit.

create or replace function public.consume_ai_usage(
  p_user_id uuid,
  p_limit integer default 20,
  p_window_seconds integer default 60
)
returns table (allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used integer;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_limit < 1 or p_limit > 120 then
    raise exception 'p_limit must be between 1 and 120';
  end if;

  if p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'p_window_seconds must be between 1 and 3600';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select count(*)::integer
    into v_used
    from public.ai_usage
   where user_id = p_user_id
     and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_used >= p_limit then
    return query select false, 0;
    return;
  end if;

  insert into public.ai_usage (user_id, action, created_at)
  values (p_user_id, 'gemini', now());

  return query select true, greatest(0, p_limit - v_used - 1);
end;
$$;

revoke all on function public.consume_ai_usage(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_usage(uuid, integer, integer) to service_role;
