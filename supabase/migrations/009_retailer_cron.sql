-- ===========================================================================
-- 009 — Daily retailer sync schedule (pg_cron)
-- ===========================================================================
--
-- Runs `retailer-sync` once a day through pg_net. The function itself rate
-- limits (2 s between requests per retailer) and stops at its own budget, so the
-- schedule only has to pick a quiet hour — Egyptian retail crawls are cheapest
-- around 03:00 local (UTC+2/3).
--
-- Requires: pg_cron + pg_net (both available on Supabase; enable in Dashboard →
-- Database → Extensions). The migration degrades to a NOTICE instead of failing
-- the whole `db push` when they are missing, so a local reset still works.
--
-- Idempotent: re-applying replaces the job by name.
-- ===========================================================================

do $$
declare
  job_exists boolean;
begin
  begin
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
  exception when others then
    raise notice '009: pg_cron / pg_net unavailable — skipping schedule. Enable them, then re-run this migration.';
    return;
  end;

  -- Report rather than throw: this migration must never block a local reset.
  select exists (select 1 from pg_extension where extname = 'pg_cron') into job_exists;
  if not job_exists then
    raise notice '009: pg_cron not installed — skipping schedule.';
    return;
  end if;

  -- Remove any previous version of the job before recreating it.
  perform cron.unschedule('retailer-sync-daily')
    where exists (select 1 from cron.job where jobname = 'retailer-sync-daily');

  -- `net.http_post` is granted to postgres; the URL + service key are read from
  -- GUCs so no secret is committed to the repo.
  perform cron.schedule(
    'retailer-sync-daily',
    '0 1 * * *',  -- 01:00 UTC = 03:00/04:00 Cairo
    $job$
    select net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/retailer-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{"mode":"all"}'::jsonb,
      timeout_milliseconds := 300000
    );
    $job$
  );

  raise notice '009: retailer-sync scheduled daily at 01:00 UTC.';
end
$$;

-- ---------------------------------------------------------------------------
-- Operator notes
-- ---------------------------------------------------------------------------
-- 1. Set the two GUCs once per project (Dashboard → Settings → Database →
--    Custom config, or via `alter database postgres set ...`):
--
--      app.settings.supabase_url      = 'https://<project-ref>.supabase.co'
--      app.settings.service_role_key  = '<service-role-key>'
--
-- 2. Manual run:
--
--      select net.http_post(
--        url := current_setting('app.settings.supabase_url') || '/functions/v1/retailer-sync',
--        headers := jsonb_build_object('Authorization',
--          'Bearer ' || current_setting('app.settings.service_role_key')),
--        body := '{"mode":"all"}'::jsonb
--      );
--
-- 3. Health check:
--
--      select retailer_id, status, products_upserted, error, started_at
--      from public.retailer_sync_runs
--      order by started_at desc limit 10;
