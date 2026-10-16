-- CourtSide · migration 20261015000160: heart-rate zones for Apple Watch
-- sessions (owner, Oct 15: "My brother does not get the heart rate zones
-- thing on the share to Instagram ... Let's make sure this never happens.").
--
-- NOT APPLIED — the lead applies it. Run it in the Supabase SQL editor as one
-- piece. It is all-or-nothing: if a check fails it stops, and nothing at all
-- changes. Safe to run more than once.
--
-- The bug, in plain words: a session from Apple Health never had heart-rate
-- zones, so its post never offered Share → "Heart rate" (the time and
-- calories over one bar per zone). On the live database, of the last 21
-- days' 124 Apple Health sessions, 115 had a heart rate and none had zones;
-- every WHOOP and Fitbit one had them. Why: Health keeps no zone times of
-- its own, only the beats, and report_activity (the phone's way in) threw
-- away any zone times a phone sent ("Apple gives no zone times, so none are
-- taken from a phone", migration 65).
--
-- From the app update shipped with this, the phone works the zone minutes out
-- itself, from the same heart-rate readings it already reads for each
-- workout's average and top heart rate (src/features/activity/appleZones.ts),
-- and sends them along. This file lets the server keep them.
--
-- What changes, by name:
--   report_activity (migration 107's, word for word apart from one line):
--     keeps the zone times a phone sends ("hr_zones"). They go through the
--     same check as WHOOP's and Fitbit's (record_activity → activity_zones,
--     migration 65): five whole minute counts from 0 to 600, together at
--     least a minute and no more than the session's own minutes plus 10;
--     anything else is dropped, and the session is kept without zones, as
--     today. Strain, the scoring state and "percent_recorded" are still taken
--     off, as before (WHOOP's alone). Same name, same inputs, same answer,
--     same "signed in only" permissions: phones on the App Store build
--     (build 17), which send no zones, work exactly as before.
--   report_activity_zones (new): the phone's way to fill in the zones of the
--     Apple Health sessions it handed over before this (each phone does it
--     once, for the last 30 days). Signed in only. It only ever writes the
--     zones of the caller's OWN Apple Health session with that Health id, only
--     one that has a heart rate and no zones yet (it never changes zones
--     already there), only when they pass the same check, and at most 120
--     times a day per account (migration 99's counter). Then every post of
--     the caller's that carries that session is worked out again by the posts
--     trigger (as refresh_session_posts does), so a post that shares its
--     zones shows them.
--
-- What does not change: a post keeps exactly the numbers its author chose
-- under "Share health data". A post made before its session had zones could
-- not list zones (the app only offered what the session had), so nothing here
-- adds zones to it; the author adds them from Edit post → "Share health data"
-- → Choose. Until then its Share → "Heart rate" shows the time, calories and
-- heart rate without the bars (app side). A new post lists zones by default
-- with the rest, as WHOOP's always have.
--
-- Stops without changing anything if report_activity has changed since the
-- version this file was written against (107, as live on Oct 15), or if
-- record_activity, activity_zones, take_edge_rate or the posts trigger are
-- not what this relies on.
--
-- To try it first without keeping anything: put "rollback;" in place of the
-- last "commit;" below, run the whole file, then put "commit;" back.
--
-- To undo: run migration 107's report_activity (its create or replace
-- function public.report_activity … end $$; and the revoke/grant lines under
-- it), then
--   drop function if exists public.report_activity_zones(text, jsonb);
-- Zones already kept stay on their sessions (private, owner-only, like the rest of the row).

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  is_now text;
  v_fn text;
begin
  if to_regclass('public.detected_activities') is null or to_regclass('public.posts') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'detected_activities' and column_name = 'hr_zones')
     or to_regprocedure('public.activity_zones(jsonb, integer)') is null
     or to_regprocedure('public.record_activity(uuid, text, text, jsonb, boolean)') is null
     or to_regprocedure('public.report_activity(text, jsonb)') is null
     or to_regprocedure('public.take_edge_rate(text, text, integer, integer)') is null then
    raise exception 'Migration 160 stopped before changing anything: it needs migrations 58, 65, 99 and 107 (detected_activities.hr_zones, activity_zones, record_activity, report_activity, take_edge_rate).';
  end if;
  select md5(p.prosrc) into is_now from pg_proc p where p.oid = 'public.report_activity(text, jsonb)'::regprocedure;
  -- Migration 107's version, or this file's own (run again).
  if is_now is distinct from '3570c287b136c7fa38f972809c77104e' and is_now is distinct from '7f4ad5ed615221f31e1692f28e5643a2' then
    raise exception 'Migration 160 stopped before changing anything: report_activity changed since migration 107. This file must be brought up to date with that change first.';
  end if;
  -- record_activity keeps a phone's zone times through activity_zones: 107's or 155's (both do).
  select md5(p.prosrc) into is_now from pg_proc p where p.oid = 'public.record_activity(uuid, text, text, jsonb, boolean)'::regprocedure;
  if is_now is distinct from '204b3c5b813b86e4128786eb7bddabfc' and is_now is distinct from '7dd7db000e6fe7421b6147c4d8b18eca' then
    raise exception 'Migration 160 stopped before changing anything: record_activity is not migration 107''s or 155''s. This file must be brought up to date with that change first.';
  end if;
  -- The posts trigger works a post's stats out again (from the session's own row) when report_activity_zones nudges it.
  select t.tgfoid::regproc::text into v_fn from pg_trigger t
    where t.tgrelid = 'public.posts'::regclass and t.tgname = 'fill_post_session_stats' and not t.tgisinternal;
  if v_fn is distinct from 'post_session_stats' then
    raise exception 'Migration 160 stopped before changing anything: the posts trigger fill_post_session_stats no longer runs post_session_stats.';
  end if;
end $$;

-- --------------------------------------------- 1. the phone's way in, zones kept
-- Migration 107's, word for word, but for the line handing the payload to
-- record_activity: it no longer takes "hr_zones" off (activity_zones checks them there).
create or replace function public.report_activity(ext text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_r jsonb;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  -- A day's worth (and a week caught up) is plenty; this stops a runaway phone, not a player.
  if (select count(*) from public.detected_activities where user_id = v_me and created_at > now() - interval '1 day') >= 60 then return null; end if;
  -- Only WHOOP has Strain and a scoring state. Zone times are kept (migration 160): the phone works them out from the Watch's heart rate.
  v_r := public.record_activity(v_me, 'apple-health', ext, coalesce(p, '{}'::jsonb) - 'strain' - 'score_state' - 'percent_recorded', true);
  if v_r is null then return null; end if;
  return jsonb_build_object('id', v_r->'id', 'status', v_r->'status', 'notify', (v_r->>'note') = 'filed');
end $$;

revoke all on function public.report_activity(text, jsonb) from public, anon;
grant execute on function public.report_activity(text, jsonb) to authenticated;

-- ------------------------------------- 2. zones for sessions already handed over
-- One of your own Apple Health sessions (by Health's id) that has a heart
-- rate and no zones yet gets the zones the phone worked out, when they pass
-- the same check as every tracker's. True when kept. Then your posts that
-- carry it are worked out again (the posts trigger reads the zones from the
-- row, and only puts them on a post that shares them).
create or replace function public.report_activity_zones(ext text, z jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_a public.detected_activities;
  v_z smallint[];
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if coalesce(char_length(ext), 0) not between 1 and 100 or z is null or jsonb_typeof(z) <> 'array' then return false; end if;
  -- A phone fills in 30 days once (60 a day at most were ever handed over); this stops a runaway phone.
  if not public.take_edge_rate('activity-zones', v_me::text, 120, 86400) then return false; end if;
  select * into v_a from public.detected_activities
   where user_id = v_me and source = 'apple-health' and external_id = ext
   for update;
  if not found or v_a.hr_zones is not null or (v_a.avg_hr is null and v_a.max_hr is null) then return false; end if;
  v_z := public.activity_zones(z, v_a.minutes);
  if v_z is null then return false; end if;
  update public.detected_activities set hr_zones = v_z, updated_at = now() where id = v_a.id;
  -- Every post of yours carrying this session, worked out again (as refresh_session_posts does).
  update public.posts p set session = p.session || '{"with": "refresh"}'::jsonb
   where p.author_id = v_me and p.session is not null and jsonb_typeof(p.session) = 'object'
     and lower(p.session->>'activityId') = v_a.id::text;
  return true;
end $$;

revoke all on function public.report_activity_zones(text, jsonb) from public, anon;
grant execute on function public.report_activity_zones(text, jsonb) to authenticated;

-- ------------------------------------------------------------ 3. last check
do $$
declare
  f record;
begin
  select md5(p.prosrc) as src, p.prosecdef as definer, p.proconfig as config,
         has_function_privilege('anon', p.oid, 'execute') as anon,
         has_function_privilege('authenticated', p.oid, 'execute') as signed_in
    into f from pg_proc p where p.oid = 'public.report_activity(text, jsonb)'::regprocedure;
  if f.src is distinct from '7f4ad5ed615221f31e1692f28e5643a2' or not f.definer or f.config is distinct from array['search_path=public'] then
    raise exception 'Migration 160 stopped: report_activity is not this file''s. Nothing was changed.';
  end if;
  if f.anon or not f.signed_in then
    raise exception 'Migration 160 stopped: report_activity''s permissions are not signed-in only. Nothing was changed.';
  end if;
  select md5(p.prosrc) as src, p.prosecdef as definer, p.proconfig as config,
         has_function_privilege('anon', p.oid, 'execute') as anon,
         has_function_privilege('authenticated', p.oid, 'execute') as signed_in
    into f from pg_proc p where p.oid = 'public.report_activity_zones(text, jsonb)'::regprocedure;
  if f.src is distinct from '0fd69a7b647a8c56e36a47e5b5964151' or not f.definer or f.config is distinct from array['search_path=public'] then
    raise exception 'Migration 160 stopped: report_activity_zones is not this file''s. Nothing was changed.';
  end if;
  if f.anon or not f.signed_in then
    raise exception 'Migration 160 stopped: report_activity_zones''s permissions are not signed-in only. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 4. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) report_activity is this file's (expect 7f4ad5ed615221f31e1692f28e5643a2):
-- select md5(prosrc) from pg_proc where oid = 'public.report_activity(text, jsonb)'::regprocedure;
--
-- (b) Apple Health sessions of the last 30 days with heart rate and with zones
--     (with_zones grows as each person opens the updated app):
-- select count(*) as apple, count(avg_hr) as with_hr, count(hr_zones) as with_zones
--   from public.detected_activities where source = 'apple-health' and started_at > now() - interval '30 days';
