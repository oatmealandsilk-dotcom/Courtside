-- CourtSide · undo for migration 20261028000196_city_board.
--
-- NOT A MIGRATION (it belongs in supabase/rollback/, outside supabase/migrations
-- on purpose). Run it in the Supabase SQL editor as one piece only to take 196
-- back out. All-or-nothing; safe to run more than once.
--
-- It removes everything 196 added: the refresh job, the three functions and
-- eight helpers, the ten city board tables (with the month's standings, news
-- lines and snapshots: these are worked out again from the sessions if 196 is
-- run again, except the daily snapshots and news lines, which start over),
-- the flag, the month-scan index and the "Show me on city boards" switch.
-- Players' choices on that switch are lost; nothing else is touched (no
-- session, post, profile or follow is changed by 196 or by this undo).
--
-- Run the app half's undo first (CITY_BOARD_FOR_EVERYONE = false, or the build
-- without city boards): an app that calls city_board() after this gets
-- "function not found" (PGRST202), which it treats as "off".

begin;
set local lock_timeout = '5s';   -- dropping the switch waits at most 5 s for user_state

do $$
begin
  if to_regnamespace('cron') is not null and exists (select 1 from cron.job where jobname = 'courtside-city-board') then
    perform cron.unschedule('courtside-city-board');
  end if;
end $$;

drop function if exists public.city_page(text, date);
drop function if exists public.city_board(date);
drop function if exists public.refresh_city_board();
drop function if exists private.city_board_needs(int, boolean);
drop function if exists private.city_board_clip_ok(public.posts);
drop function if exists private.city_board_post_people(public.posts);
drop function if exists private.city_board_named(uuid);
drop function if exists private.city_board_city(double precision, double precision, text);
drop function if exists private.us_state(text);
drop function if exists private.safe_tz(text);
drop function if exists private.city_board_rules();

drop table if exists public.city_board_clips;
drop table if exists public.city_board_court_weeks;
drop table if exists public.city_board_courts;
drop table if exists public.city_board_events;
drop table if exists public.city_board_daily;
drop table if exists public.city_board_cities;
drop table if exists public.city_board_members;
drop table if exists public.city_board_months;
drop table if exists public.board_city_places;
drop table if exists public.board_cities;

delete from public.server_settings where key in ('flag:city-board', 'flag-people:city-board');
drop index if exists public.practice_sessions_tennis_day;
alter table public.user_state drop column if exists city_boards;

do $$
begin
  if to_regprocedure('public.city_board(date)') is not null
     or to_regprocedure('public.city_page(text, date)') is not null
     or to_regclass('public.city_board_members') is not null
     or to_regprocedure('private.city_board_clip_ok(public.posts)') is not null
     or to_regprocedure('private.city_board_needs(int, boolean)') is not null
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'city_boards')
     or (to_regnamespace('cron') is not null and exists (select 1 from cron.job where jobname = 'courtside-city-board')) then
    raise exception 'Undo 196 stopped: something is still there. Nothing was changed.';
  end if;
end $$;

commit;
