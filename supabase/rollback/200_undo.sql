-- CourtSide · undo for migration 20261029000200_auto_log_ask.
--
-- NOT A MIGRATION (it belongs in supabase/rollback/, outside supabase/migrations
-- on purpose). Run it in the Supabase SQL editor as one piece only to take 200
-- back out. All-or-nothing; safe to run more than once.
--
-- It stops the 'courtside-auto-log-ask' job and removes send_auto_log_asks(),
-- auto_log_ask_ready() and its list, public.auto_log_ask_phones (the app
-- calls auto_log_ask_ready() once a launch and ignores it being gone).
-- Alerts already sent stay sent, and their nudges rows stay (kind
-- 'auto-log-ask'), so running 200 again never asks anyone twice. Nothing else
-- is touched: no setting, post or session. The app needs no change either
-- way: with no alert, the card still comes up once in the app by itself.

begin;
set local lock_timeout = '5s';

-- The job first, so it never runs half-way through this.
do $$
begin
  if to_regnamespace('cron') is not null and exists (select 1 from cron.job where jobname = 'courtside-auto-log-ask') then
    perform cron.unschedule('courtside-auto-log-ask');
  end if;
end $$;

drop function if exists public.send_auto_log_asks(timestamptz, boolean);
drop function if exists public.auto_log_ask_ready();
drop table if exists public.auto_log_ask_phones;

do $$
begin
  if to_regprocedure('public.send_auto_log_asks(timestamp with time zone, boolean)') is not null
     or to_regprocedure('public.auto_log_ask_ready()') is not null or to_regclass('public.auto_log_ask_phones') is not null
     or (to_regnamespace('cron') is not null and exists (select 1 from cron.job where jobname = 'courtside-auto-log-ask')) then
    raise exception 'Undo 200 stopped: something it removes is still there; nothing was changed.';
  end if;
end $$;

commit;
