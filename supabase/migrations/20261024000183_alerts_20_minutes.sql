-- CourtSide · migration 20261024000183: only sessions of 20 minutes or more buzz.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. It is
-- all-or-nothing: if the check below fails, it stops and nothing at all
-- changes. Safe to run more than once.
--
-- What it does (the owner, Oct 24: "I like only sessions over 20"): the
-- lock-screen alert ("Tennis detected" / "Activity detected", or the one
-- "N workouts found") goes out only for a session of 20 minutes or more,
-- from every tracker the server alerts for: WHOOP (its webhook and the
-- 15-minute sweep), and Fitbit, Oura and Polar (the hourly auto sync,
-- migration 184). Filing is unchanged: a shorter session (5 to 19 minutes)
-- still lands in To do and in Notifications, quietly, as before.
--
--   * Where: send_activity_pushes, the one place every server alert goes
--     through (note_detected_activity and sweep_activities both hand their
--     alerts to it). Only its list of sessions due an alert changes: one
--     line, "and d.minutes >= 20". A short session is never alerted later
--     either (it is not counted in a go of "N workouts found").
--   * minutes is the session's whole length, start to end, as record_activity
--     stores it (rounded: 19 min 30 s counts as 20).
--   * Apple Health and Health Connect: the server never alerts for these (the
--     phone files them quietly and the iPhone shows its own alert,
--     modules/workout-watch). That alert is in the app, not here.
--   * Unchanged: once per session, never between 10pm and 7am where it was
--     played (that alert is skipped, not held: the session waits in To do),
--     only one that ended in the last 12 hours, never when switched off, the
--     same session from two trackers alerts once, no times or stats on the
--     lock screen.
--
-- Needs 138 (live). The check stops without changing anything if the live
-- send_activity_pushes is anything other than 138's (or this file's own, so a
-- second run passes), so it can never undo a later change to it. Who may call
-- it is unchanged (the server only).
--
-- To undo: run migration 138's section 2 (send_activity_pushes) again.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  n int;
  now_is text;
begin
  if to_regclass('public.detected_activities') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'detected_activities' and column_name = 'minutes') then
    raise exception 'Migration 20261024000183 stopped before changing anything: detected_activities.minutes is missing. Ask Claude to look.';
  end if;
  select count(*), max(md5(p.prosrc)) into n, now_is from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'send_activity_pushes';
  -- 138's (live since Oct 6), or this file's own.
  if n <> 1 or now_is not in ('53e074d640f3f446e61c3c8c612c60f1', '662ae4e0364d645f59480587a15c2b5c') then
    raise exception 'Migration 20261024000183 stopped before changing anything: send_activity_pushes changed since migration 138. This file must be brought up to date with that change first.';
  end if;
end $$;

-- ------------------------------------------------- 1. the alerts, 20 min and up
-- Migration 138's, word for word, but for the one line marked "20 minutes".
create or replace function public.send_activity_pushes(u uuid, ids uuid[]) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_due uuid[];
  v_ones uuid[];
  v_go uuid[];
  v_found boolean;
  v_n int;
  v_tennis boolean;
  r record;
begin
  if u is null or coalesce(cardinality(ids), 0) = 0 then return 'none'; end if;
  -- One person's alerts one at a time (note_detected_activity holds the same lock).
  perform pg_advisory_xact_lock(hashtextextended('activity:' || u::text, 0));
  -- Theirs, still waiting to be logged, not alerted since they were filed: newest first.
  -- Only sessions of 20 minutes or more buzz (owner, Oct 24: "I like only sessions
  -- over 20"); a shorter one is already filed quietly in To do and Notifications.
  select array_agg(d.id order by d.ended_at desc) into v_due from public.detected_activities d
   where d.user_id = u and d.id = any(ids) and d.status = 'new' and d.minutes >= 20
     and (d.pushed_at is null or d.pushed_at < d.notified_at);
  if v_due is null then return 'none'; end if;
  -- The go under way: their alerts in the last ten minutes. Already told "N workouts found" in it?
  select coalesce(bool_or(d.pushed_as = 'found'), false) into v_found
    from public.detected_activities d
   where d.user_id = u and d.pushed_at > now() - interval '10 minutes' and not (d.id = any(v_due));
  -- These join it quietly (the app's one row counts them).
  if v_found then
    update public.detected_activities set pushed_at = now(), pushed_as = 'folded' where id = any(v_due);
    return 'folded';
  end if;
  -- Its single alerts, those still waiting to be logged (one logged or hidden since is not counted).
  select coalesce(array_agg(d.id order by d.ended_at desc), '{}') into v_ones
    from public.detected_activities d
   where d.user_id = u and d.pushed_as = 'one' and d.status = 'new'
     and d.pushed_at > now() - interval '10 minutes' and not (d.id = any(v_due));
  v_n := cardinality(v_ones) + cardinality(v_due);
  -- Three or fewer in the go: one each, as before. No numbers on the lock screen: the time and stats show only in the app.
  if v_n <= 3 then
    for r in select d.id, d.sport from public.detected_activities d where d.id = any(v_due) order by d.ended_at loop
      if r.sport = 'tennis' then
        perform public.send_push(u, 'Tennis detected', 'Log it on CourtSide.', '/log-session?activity=' || r.id);
      else
        perform public.send_push(u, 'Activity detected', public.workout_name(r.sport) || ' · Log it on CourtSide.', '/log-session?activity=' || r.id);
      end if;
    end loop;
    update public.detected_activities set pushed_at = now(), pushed_as = 'one' where id = any(v_due);
    return 'pushed';
  end if;
  -- More than three: ONE alert for the go, opening its list in the app.
  select array_agg(d.id order by d.ended_at desc), coalesce(bool_and(d.sport = 'tennis'), false) into v_go, v_tennis
    from public.detected_activities d where d.id = any(v_due || v_ones);
  perform public.send_push(u, v_n || case when v_tennis then ' tennis sessions found' else ' workouts found' end,
                           'Tap to log them on CourtSide.', '/notifications?workouts=' || array_to_string(v_go[1:40], ','));
  update public.detected_activities set pushed_at = now(), pushed_as = case when id = v_due[1] then 'found' else 'folded' end where id = any(v_due);
  return 'pushed-found';
end $$;

-- Server only, as before (138).
revoke all on function public.send_activity_pushes(uuid, uuid[]) from public, anon, authenticated;

-- ------------------------------------------------------------- 2. last check
do $$
declare
  f record;
begin
  select md5(p.prosrc) as src, p.prosecdef as definer, p.proconfig as config,
         has_function_privilege('anon', p.oid, 'execute') as anon,
         has_function_privilege('authenticated', p.oid, 'execute') as signed_in
    into f from pg_proc p where p.oid = 'public.send_activity_pushes(uuid, uuid[])'::regprocedure;
  if f.src is distinct from '662ae4e0364d645f59480587a15c2b5c' or not f.definer or f.config is distinct from array['search_path=public'] then
    raise exception 'Migration 20261024000183 stopped: send_activity_pushes is not this file''s. Nothing was changed.';
  end if;
  if f.anon or f.signed_in then
    raise exception 'Migration 20261024000183 stopped: send_activity_pushes can be called from the app. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 3. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
--
-- (a) This file's function is live (expect 662ae4e0364d645f59480587a15c2b5c):
-- select md5(prosrc) from pg_proc where oid = 'public.send_activity_pushes(uuid, uuid[])'::regprocedure;
--
-- (b) Short sessions of the last week, filed but never alerted (expect pushed_at empty on each):
-- select source, minutes, notified_at, pushed_at from public.detected_activities
--  where minutes < 20 and created_at > now() - interval '7 days' order by created_at desc limit 20;
