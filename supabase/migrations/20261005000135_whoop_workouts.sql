-- CourtSide · migration 135: every workout from WHOOP, not only tennis, and
-- the past week of them in Notifications when WHOOP is connected.
--
-- Run it in the Supabase SQL editor as one piece. Safe to run more than
-- once. Needs 107 (live): it uses 107's activity_allowed and its
-- reads_all_workouts column.
--
-- What it does (the owner, Oct 5: when someone first connects WHOOP, the
-- past week's WHOOP workouts show up in the notifications bell, and tapping
-- one opens logging for it):
--
--   * A new switch, 'flag:workouts-whoop', starts 'admins' (only admin
--     accounts), the way WHOOP's tennis is today: try it on the owner's
--     WHOOP first, then open it with his OK:
--       update server_settings set value = 'on', updated_at = now() where key = 'flag:workouts-whoop';
--     Turning it 'off' stops WHOOP's runs, rides and gym sessions at once,
--     without an app update; WHOOP's tennis keeps its own switch. Migration
--     107's activity_allowed already reads 'workouts-' || source, so nothing
--     else on the server needs this switch named: until this row exists,
--     anything from WHOOP other than tennis is turned away, as before.
--   * Every workout is still its own yes (health_connections.
--     reads_all_workouts, migration 107), given on the Health page or when
--     WHOOP is connected with the screen saying "workouts". Someone who
--     turned on WHOOP's tennis sessions only keeps tennis only.
--   * WHOOP's own "a workout was saved" message (its webhook) reaches anyone
--     with WHOOP's workouts on, not only those with its tennis on, so a run
--     arrives within the hour like a tennis session does.
--
-- Nothing else changes: the same rows, the same one alert each (filed once,
-- never twice on a re-sync), the same "Activity detected" words (migration
-- 131), and still never a buzz for one older than 12 hours, so catching up
-- on the week never buzzes a phone. Mentions nobody's age.

begin;

-- 1. The switch. Never changes a value already set.
insert into public.server_settings (key, value) values ('flag:workouts-whoop', 'admins') on conflict (key) do nothing;

-- 2. Migration 58's list of who a WHOOP webhook is about: those with its
-- tennis on (as before), or every workout on (migration 107's rule).
create or replace function public.whoop_tennis_users(w bigint) returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select t.user_id from public.whoop_tokens t
   where t.whoop_user_id = w
     and (public.tennis_allowed(t.user_id, 'whoop') or public.activity_allowed(t.user_id, 'whoop', 'workout'))
$$;
-- Server only, as before.
revoke all on function public.whoop_tennis_users(bigint) from public, anon, authenticated;

commit;
