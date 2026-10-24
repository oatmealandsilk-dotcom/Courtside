-- CourtSide · migration 20261024000184: Fitbit, Oura and Polar looked at every hour by the server.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece, AFTER the
-- trackers function with /sync-all is deployed (and after 183). It is
-- all-or-nothing: if a check fails, it stops and nothing at all changes.
-- Safe to run more than once.
--
-- What it does (the owner, Oct 24: "Do auto sync"): until now a Fitbit, Oura
-- or Polar session was found only when the player opened the app (at most
-- hourly, src/features/activity/check.ts). From this file on, the server
-- looks for every connected player once an hour, app open or not, and
-- "Tennis detected — log it?" arrives on its own, the way WHOOP's does:
--
--   * At 20 past every hour, pg_cron (the database's clock) calls the
--     trackers function's /sync-all through pg_net (the database's way to
--     call a web address). The function gives every connection that reads
--     tennis the same 36-hour look the phone asks for, 4 players at a time,
--     for at most 100 seconds, skipping any synced in the last 30 minutes.
--   * Alerts: only sessions of 20 minutes or more (migration 183, and the
--     function itself), by the usual rules: once per session (the phone's
--     own look and this one never both alert: record_activity files a
--     session once by the tracker's own id, and note_detected_activity
--     answers 'already' for one it has seen), not when it ended over 12
--     hours ago, not when the player switched these alerts off, and not
--     between 10pm and 7am where it was played: that alert is skipped, not
--     held till morning (the session still waits in To do).
--   * A player whose sync fails is written to the crash reports once
--     (app_errors, screen 'trackers', at most every 6 hours each).
--
-- The secret: /sync-all answers only a call carrying the Vault secret
-- "trackers_sync_secret" in its x-courtside-sync header. This file makes it
-- (64 random characters) the first time it runs; nobody types, copies or
-- sees it. The function checks it with trackers_sync_ok(), which only the
-- server can call; the scheduled job reads it from Vault when it runs.
-- Nothing to set in the function's secrets.
--
-- To stop it: select cron.unschedule('courtside-tracker-auto-sync');
-- (The phone's own hourly look carries on as before either way.)

begin;

-- ------------------------------------------------------------------ 0. check
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net')
     or not exists (select 1 from pg_extension where extname = 'supabase_vault')
     or to_regprocedure('vault.create_secret(text, text, text, uuid)') is null then
    raise exception 'Migration 20261024000184 stopped before changing anything: it needs pg_cron, pg_net and Vault (Database → Extensions). Ask Claude to look.';
  end if;
  if to_regclass('public.health_connections') is null or to_regclass('public.tracker_tokens') is null then
    raise exception 'Migration 20261024000184 stopped before changing anything: migration 69 (the trackers) has to run first.';
  end if;
end $$;

-- ------------------------------------------------------------- 1. the secret
-- Made once; a second run keeps it. 2 × 122 random bits.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'trackers_sync_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'trackers_sync_secret',
      'Lets the hourly pg_cron job (courtside-tracker-auto-sync) into the trackers function''s /sync-all. Migration 184.');
  end if;
end $$;

-- ------------------------------------------------------------ 2. the checker
-- True only for the exact secret. The trackers function calls it with the
-- header it was sent; only the server may (the service role).
create or replace function public.trackers_sync_ok(s text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(char_length(s) >= 32 and s = (select d.decrypted_secret from vault.decrypted_secrets d where d.name = 'trackers_sync_secret' limit 1), false);
$$;
revoke all on function public.trackers_sync_ok(text) from public, anon, authenticated;
grant execute on function public.trackers_sync_ok(text) to service_role;

-- ---------------------------------------------------------- 3. the scheduler
-- At 20 past every hour (the other hourly jobs run at 5, 10, 25 and 40 past).
-- Scheduling the same job name again replaces it. pg_net waits 10 seconds at
-- most: the function answers at once and carries on by itself.
do $$
begin
  perform cron.schedule('courtside-tracker-auto-sync', '20 * * * *', $job$
    select net.http_post(
      url := 'https://auth.courtsidebase.com/functions/v1/trackers/sync-all',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-courtside-sync', (select decrypted_secret from vault.decrypted_secrets where name = 'trackers_sync_secret' limit 1)),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000)
  $job$);
end $$;

-- ------------------------------------------------------------- 4. last check
do $$
begin
  if (select count(*) from vault.secrets where name = 'trackers_sync_secret') <> 1 then
    raise exception 'Migration 20261024000184 stopped: the Vault secret is not there exactly once. Nothing was changed.';
  end if;
  if public.trackers_sync_ok('wrong-wrong-wrong-wrong-wrong-wrong-wrong') or public.trackers_sync_ok(null)
     or not public.trackers_sync_ok((select decrypted_secret from vault.decrypted_secrets where name = 'trackers_sync_secret' limit 1)) then
    raise exception 'Migration 20261024000184 stopped: trackers_sync_ok does not answer as it should. Nothing was changed.';
  end if;
  if has_function_privilege('anon', 'public.trackers_sync_ok(text)', 'execute')
     or has_function_privilege('authenticated', 'public.trackers_sync_ok(text)', 'execute')
     or not has_function_privilege('service_role', 'public.trackers_sync_ok(text)', 'execute') then
    raise exception 'Migration 20261024000184 stopped: trackers_sync_ok is not server only. Nothing was changed.';
  end if;
  if not exists (select 1 from cron.job where jobname = 'courtside-tracker-auto-sync' and schedule = '20 * * * *' and active) then
    raise exception 'Migration 20261024000184 stopped: the hourly job is not scheduled. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 5. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The job (expect one row, 20 * * * *, active):
-- select jobname, schedule, active from cron.job where jobname = 'courtside-tracker-auto-sync';
--
-- (b) Its last runs (expect succeeded, after 20 past the hour):
-- select status, start_time from cron.job_run_details
--  where jobid = (select jobid from cron.job where jobname = 'courtside-tracker-auto-sync') order by start_time desc limit 5;
--
-- (c) The function's answers (expect 202; 403 means the secret did not match, 401 that /sync-all is not deployed yet):
-- select status_code, created from net._http_response order by created desc limit 10;
--
-- (d) Sync problems it reported (expect few or none):
-- select created_at, message from public.app_errors where screen = 'trackers' order by created_at desc limit 20;
