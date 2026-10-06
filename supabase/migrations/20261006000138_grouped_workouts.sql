-- CourtSide · migration 20261006000138: several workouts found at once, one alert.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. It is
-- all-or-nothing: if the check below fails, it stops and nothing at all
-- changes. Safe to run more than once.
--
-- What it does (the owner, Oct 5: "go for … grouped noti"): when WHOOP
-- catches up and the server alerts several sessions in a row, the lock
-- screen no longer buzzes once for each. Up to three in one go still get
-- an alert each, exactly as today ("Tennis detected" / "Log it on
-- CourtSide.", or "Activity detected" / "Run · Log it on CourtSide."). From
-- the fourth in one go, ONE alert stands for them all:
--
--     4 workouts found            (or "4 tennis sessions found")
--     Tap to log them on CourtSide.
--
-- which opens their list in the app (Workouts found, each with its own Log
-- it), and any more in that go stay quiet. "One go" is ten minutes: alerts
-- to the same person less than ten minutes after their last one (the app's
-- one row and the iPhone's own alert use the same ten minutes). Only those
-- still waiting to be logged are counted: one logged or hidden meanwhile is
-- not in the number.
--
-- Safe to apply before or after the app's code with the list is on phones:
-- the one alert opens Notifications ("/notifications?workouts=…", an
-- address every version of the app has), which the version with the list
-- turns into the list itself (src/features/push/push.ts).
--
--   * WHOOP's sessions still being scored, which the sweep alerts later
--     (sweep_activities, every 15 minutes), are counted first and alerted
--     together: three or fewer one each, more than three ONE alert. Before,
--     a sweep that found five buzzed five times.
--   * WHOOP's own alerts arrive one by one (one webhook per workout), so the
--     server can't know a fourth is coming when it sends the first: the
--     first three still buzz on their own, the fourth sends the one "4
--     workouts found", and the rest of that go are quiet.
--   * Every session still gets its own row in Notifications, as today; the
--     app shows more than three filed in one go as ONE row, "4 workouts
--     found. Tap to log." (src/features/activity/found.ts), and the iPhone's
--     own Apple Health alert folds the same way (modules/workout-watch).
--   * The same session from WHOOP and the Apple Watch is still one session
--     (the later copy is a duplicate, with no row and no alert): never
--     counted twice.
--   * Nothing else changes: the same sessions alert at the same times (only
--     one that ended in the last 12 hours, never between 10pm and 7am where
--     it was played, never for someone who turned these alerts off), a
--     session WHOOP took back and sent again alerts again, and still no
--     times or stats on the lock screen.
--
-- How: two columns on detected_activities, private like the rest of the
-- row (only its owner can read it, nothing in the app can write it): when
-- its alert went out (pushed_at), and how ('one' on its own, 'found' the
-- one alert for a go, 'folded' counted in that alert). A new server-only
-- send_activity_pushes() sends the alerts by that rule. note_detected_activity
-- is put back exactly as migration 131 left it (live Oct 5) but for its
-- last lines, which now hand the alert to send_activity_pushes; sweep_activities
-- is migration 107's (live Oct 5) but files first, then alerts each person
-- once. The check stops without changing anything if either live function
-- is anything other than those (or this file's own, so a second run passes),
-- so it can never undo a later change to them. Who may call them is
-- unchanged (the server only).
--
-- Needs 107 and 131 (both live). Mentions nobody's age.

begin;

-- ------------------------------------------------------------------ 0. check
-- md5 of each function's body: as it is live (Oct 5), or as this file leaves it.
do $$
declare
  expected constant text[][] := array[
    -- name, live (Oct 5), as this file leaves it
    ['note_detected_activity', '6bc1468904ea0039f73991c3822c4e65', '804e5d88e5a616bd9890a116f8d749bd'],
    ['sweep_activities', '7c356d369f3806b1ab7f2cd4111c23d2', 'f4f320c3bf39edc4bb488c1966b4900b']
  ];
  i int;
  n int;
  now_is text;
  wrong text[] := '{}';
begin
  if to_regclass('public.detected_activities') is null or to_regclass('public.user_state') is null or to_regclass('public.whoop_pending') is null
     or to_regprocedure('public.note_detected_activity(uuid, boolean, boolean)') is null or to_regprocedure('public.sweep_activities()') is null
     or to_regprocedure('public.send_push(uuid, text, text, text)') is null or to_regprocedure('public.workout_name(text)') is null
     or to_regprocedure('public.activity_allowed(uuid, text, text)') is null or to_regprocedure('public.expire_activities(uuid)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'push_activity') then
    raise exception 'Migration 20261006000138 stopped before changing anything: migrations 107 and 131 have to run first. Ask Claude to look.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    select count(*), max(md5(p.prosrc)) into n, now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1];
    if n <> 1 or now_is not in (expected[i][2], expected[i][3]) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  -- The new function: not there yet, or this file's own.
  select count(*), max(md5(p.prosrc)) into n, now_is from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'send_activity_pushes';
  if n > 1 or (n = 1 and now_is <> '53e074d640f3f446e61c3c8c612c60f1') then
    wrong := wrong || 'send_activity_pushes'::text;
  end if;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 20261006000138 stopped before changing anything: % changed since it was written. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- --------------------------------------------------------------- 1. columns
-- When a session's lock-screen alert went out, and how: 'one' (its own),
-- 'found' (the one "N workouts found" for its go), 'folded' (counted in it).
-- Private like the rest of the row; nothing in the app writes it.
alter table public.detected_activities add column if not exists pushed_at timestamptz;
alter table public.detected_activities add column if not exists pushed_as text;
alter table public.detected_activities drop constraint if exists detected_activities_pushed_as_check;
alter table public.detected_activities add constraint detected_activities_pushed_as_check
  check (pushed_as is null or pushed_as in ('one', 'found', 'folded'));
-- The last ten minutes of a person's alerts, found quickly.
create index if not exists detected_activities_pushed on public.detected_activities (user_id, pushed_at) where pushed_at is not null;

-- --------------------------------------------- 2. the alerts, folded past 3
-- One person's sessions whose alert is due (every rule for an alert already
-- passed: see note_detected_activity and sweep_activities). Three or fewer
-- in the go (these, and those alerted on their own in the last ten minutes
-- that still wait to be logged): one each, as before, oldest first so the
-- newest sits on top. More than three: ONE "N workouts found" for the go.
-- Already told that in the go: quiet. Answers 'pushed', 'pushed-found',
-- 'folded' or 'none'. Server only.
--
-- A session WHOOP took back and then sent again is news once more (record_activity):
-- filed again since its alert (notified_at after pushed_at), it is due again.
--
-- The one alert opens Notifications with the go's workouts in its address
-- ("/notifications?workouts=…", newest first, at most 40), an address every
-- version of the app has. The version with the list (app/workouts-found)
-- opens their list from it (src/features/push/push.ts); an older one simply
-- opens Notifications, so this can go live before or after the app's code.
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
  select array_agg(d.id order by d.ended_at desc) into v_due from public.detected_activities d
   where d.user_id = u and d.id = any(ids) and d.status = 'new'
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

-- ----------------------------------------------- 3. one session's alert
-- Migration 131's, word for word, but for its last lines: the alert itself
-- is sent by send_activity_pushes (on its own, as before, unless it is the
-- fourth or more in one go).
create or replace function public.note_detected_activity(a_id uuid, quiet boolean default false, force_pending boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_a public.detected_activities;
  v_twin uuid;
  v_label text;
  v_who text;
  v_day text;
  v_hour int;
  v_push boolean;
begin
  select * into v_a from public.detected_activities where id = a_id;
  if not found then return 'missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended('activity:' || v_a.user_id::text, 0));
  -- Again, under the lock: another request may have just filed it.
  select * into v_a from public.detected_activities where id = a_id;
  if v_a.status <> 'new' or v_a.notified_at is not null then return 'already'; end if;
  -- WHOOP is still scoring it; the scored copy (or the sweep) announces it.
  if v_a.score_state = 'PENDING_SCORE' and not force_pending then return 'pending'; end if;

  -- The same session seen twice (WHOOP and the Watch, say): the earlier row
  -- carries the alert, this one stays quiet. Only ever the same sport.
  select o.id into v_twin from public.detected_activities o
   where o.user_id = v_a.user_id and o.id <> v_a.id and o.sport = v_a.sport and o.status in ('new', 'logged', 'dismissed') and o.created_at <= v_a.created_at
     and (abs(extract(epoch from o.started_at - v_a.started_at)) <= 600
          or extract(epoch from least(o.ended_at, v_a.ended_at) - greatest(o.started_at, v_a.started_at))
             >= 0.5 * least(extract(epoch from o.ended_at - o.started_at), extract(epoch from v_a.ended_at - v_a.started_at)))
   order by o.created_at limit 1;
  if v_twin is not null then
    update public.detected_activities set status = 'duplicate', duplicate_of = v_twin, notified_at = now(), updated_at = now() where id = v_a.id;
    return 'duplicate';
  end if;

  -- Too old to be news: it stays in the list, without an alert. Eight days,
  -- so the phone's first look back over the past week files each one.
  if v_a.ended_at < now() - interval '8 days' then return 'stale'; end if;

  -- The player already logged it by hand (a session of the same kind, saved
  -- between the start and 12 hours after the end): tennis for tennis. For any
  -- other workout, a fitness session about as long (within 30%, or 5
  -- minutes) that no other workout already stands for, so one session logged
  -- by hand never hides a whole day's workouts.
  if exists (select 1 from public.practice_sessions s where s.user_id = v_a.user_id and s.activity_id is null
               and s.created_at between v_a.started_at and v_a.ended_at + interval '12 hours'
               and case when v_a.sport = 'tennis' then s.kind in ('practice', 'match', 'drills')
                        else s.kind = 'fitness' and abs(s.minutes - v_a.minutes) <= greatest(5, 0.3 * v_a.minutes)
                             and not exists (select 1 from public.detected_activities o
                                              where o.user_id = v_a.user_id and o.id <> v_a.id and o.sport <> 'tennis'
                                                and o.status = 'duplicate' and o.duplicate_of is null
                                                and s.created_at between o.started_at and o.ended_at + interval '12 hours'
                                                and abs(s.minutes - o.minutes) <= greatest(5, 0.3 * o.minutes)) end) then
    update public.detected_activities set status = 'duplicate', notified_at = now(), updated_at = now() where id = v_a.id;
    return 'logged-by-hand';
  end if;

  update public.detected_activities set notified_at = now(), updated_at = now() where id = v_a.id;
  v_label := case when v_a.minutes < 60 then v_a.minutes || ' min'
                  else (v_a.minutes / 60) || ' hr' || case when v_a.minutes % 60 > 0 then ' ' || (v_a.minutes % 60) || ' min' else '' end end;
  v_who := case v_a.source when 'whoop' then 'your WHOOP'
                           when 'apple-health' then case when v_a.device ~ '^Watch[0-9]+,[0-9]+$' then 'your Apple Watch' else 'Apple Health' end
                           when 'fitbit' then 'your Fitbit'
                           when 'oura' then 'your Oura Ring'
                           when 'polar' then 'your Polar'
                           else 'your tracker' end;
  -- Found long after it ended (catching up on the past week): which day, where it was played.
  if v_a.ended_at < now() - interval '20 hours' and v_a.tz_offset_min is not null then
    v_day := to_char((v_a.started_at at time zone 'UTC') + make_interval(mins => v_a.tz_offset_min), 'Dy');
  end if;
  -- From the player to themselves: the Notifications page shows it, and
  -- push_for_notification skips it (the buzz, if any, is sent below).
  -- "32 min · from your Apple Watch" (tennis, as before); "Run · 32 min · from your Apple Watch".
  insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
    values (v_a.user_id, v_a.user_id, 'activity', v_a.id::text, 'activity',
            concat_ws(' · ', case when v_a.sport <> 'tennis' then public.workout_name(v_a.sport) end, v_day, v_label) || ' · from ' || v_who);

  -- In the app only: the phone found it itself (it shows its own banner),
  -- it is from long ago, the player turned these alerts off, or it is night
  -- where they played.
  if quiet then return 'filed'; end if;
  if v_a.ended_at < now() - interval '12 hours' then return 'filed-old'; end if;
  select push_activity into v_push from public.user_state where user_id = v_a.user_id;
  if v_push is false then return 'filed-off'; end if;
  if v_a.tz_offset_min is not null then
    v_hour := extract(hour from (now() at time zone 'UTC') + make_interval(mins => v_a.tz_offset_min))::int;
    if v_hour >= 22 or v_hour < 7 then return 'filed-night'; end if;
  end if;
  -- The lock-screen alert: on its own, as before ("Tennis detected", "Activity
  -- detected"), unless it is the fourth or more in one go, when ONE "4 workouts
  -- found" stands for them all ('pushed-found'; any more in that go, 'folded').
  return public.send_activity_pushes(v_a.user_id, array[v_a.id]);
end $$;

-- ------------------------------------------------- 4. the sweep, in one go
-- Migration 107's, but WHOOP's sessions that were still being scored are
-- filed first (quietly), then each person's alerted together by the same
-- rules as one at a time: never for someone who turned these alerts off,
-- never at night where it was played; three or fewer one each, more than
-- three ONE "N workouts found" (send_activity_pushes).
create or replace function public.sweep_activities() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_filed uuid[] := '{}';
  v_due uuid[];
  v_push boolean;
begin
  for r in select id from public.detected_activities
            where status = 'new' and notified_at is null and score_state = 'PENDING_SCORE'
              and ended_at between now() - interval '12 hours' and now() - interval '45 minutes'
              and public.activity_allowed(user_id, source, sport) loop
    if public.note_detected_activity(r.id, true, true) = 'filed' then v_filed := v_filed || r.id; end if;
  end loop;
  for r in select distinct d.user_id from public.detected_activities d where d.id = any(v_filed) loop
    select push_activity into v_push from public.user_state where user_id = r.user_id;
    if v_push is false then continue; end if;
    select array_agg(d.id) into v_due from public.detected_activities d
     where d.id = any(v_filed) and d.user_id = r.user_id
       and (d.tz_offset_min is null
            or extract(hour from (now() at time zone 'UTC') + make_interval(mins => d.tz_offset_min))::int between 7 and 21);
    perform public.send_activity_pushes(r.user_id, v_due);
  end loop;
  perform public.expire_activities(null);
  -- WHOOP sign-ins nobody collected.
  delete from public.whoop_pending where expires_at < now();
end $$;

-- ------------------------------------------------------------ 5. who may call
-- Server only, as before (create or replace keeps it; said again to be sure).
revoke all on function public.send_activity_pushes(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.note_detected_activity(uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.sweep_activities() from public, anon, authenticated;
grant execute on function public.sweep_activities() to service_role;

-- ------------------------------------------------------------- 6. last check
do $$
declare
  fn text;
begin
  if (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'note_detected_activity') is distinct from '804e5d88e5a616bd9890a116f8d749bd'
     or (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sweep_activities') is distinct from 'f4f320c3bf39edc4bb488c1966b4900b'
     or (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'send_activity_pushes') is distinct from '53e074d640f3f446e61c3c8c612c60f1'
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'detected_activities' and column_name = 'pushed_as') then
    raise exception 'Migration 20261006000138 stopped: the result was not as planned; nothing was changed.';
  end if;
  foreach fn in array array['public.send_activity_pushes(uuid, uuid[])', 'public.note_detected_activity(uuid, boolean, boolean)', 'public.sweep_activities()'] loop
    if has_function_privilege('authenticated', fn, 'execute') or has_function_privilege('anon', fn, 'execute') then
      raise exception 'Migration 20261006000138 stopped: % could be called from the app; nothing was changed.', fn;
    end if;
  end loop;
end $$;

commit;

-- ------------------------------------------------- 7. check to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- "). Expect
-- three rows: note_detected_activity 804e5d88e5a616bd9890a116f8d749bd, send_activity_pushes
-- 53e074d640f3f446e61c3c8c612c60f1, sweep_activities f4f320c3bf39edc4bb488c1966b4900b:
-- select proname, md5(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('note_detected_activity', 'send_activity_pushes', 'sweep_activities') order by 1;
--
-- The rolled-back test that goes with this file (run before applying it):
-- scratchpad grp-fix/t18_rollback.sql — the whole file twice, then WHOOP
-- sessions put through it one at a time and in a sweep (and one taken back
-- and sent again, and one logged in the middle of a go), inside one
-- transaction that is undone.
