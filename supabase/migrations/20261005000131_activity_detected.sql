-- CourtSide · migration 131: "Activity detected", not "Workout detected".
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. It is
-- all-or-nothing: if the check below fails, it stops and nothing at all
-- changes. Safe to run more than once.
--
-- What it does (the owner, Oct 5: "Activity detected"): the lock-screen
-- alert the server sends for a session that is not tennis (WHOOP's, today)
-- now says "Activity detected" on top, with what it was on the line under
-- it, the way WHOOP's own alert reads:
--
--     Activity detected
--     Run · Log it on CourtSide.
--
-- Tennis keeps "Tennis detected" / "Log it on CourtSide." exactly. Nothing
-- else changes: the same sessions alert at the same times, still never a
-- number on the lock screen, and the row in Notifications keeps its words
-- ("Run · 32 min · from your WHOOP"; the app puts "Activity detected." in
-- front of it). The app (this branch, fix/activity-detected) and the
-- iPhone's own Apple Health alert (build 15's native module) say the same.
--
-- How: note_detected_activity is put back exactly as migration 107 left it
-- (the version live on Oct 5), with that one word changed. The check
-- stops without changing anything if the live function is anything other
-- than 107's (or this file's own, so a second run passes), so it can never
-- undo a later change to it. Who may call it is unchanged (the server
-- only, as 107 set it).
--
-- Needs 107 (live). Mentions nobody's age.

begin;

-- ------------------------------------------------------------------ 0. check
-- md5 of the function's body: as 107 left it (live Oct 5), or as this file leaves it.
do $$
declare
  now_is text;
  n int;
begin
  select count(*), max(md5(p.prosrc)) into n, now_is from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'note_detected_activity';
  if n <> 1 or to_regprocedure('public.note_detected_activity(uuid, boolean, boolean)') is null
     or to_regprocedure('public.send_push(uuid, text, text, text)') is null or to_regprocedure('public.workout_name(text)') is null then
    raise exception 'Migration 131 stopped before changing anything: migration 107 has to run first. Ask Claude to look.';
  end if;
  if now_is not in ('772a7a28edd2cdc8d55000b87634142d', '6bc1468904ea0039f73991c3822c4e65') then
    raise exception 'Migration 131 stopped before changing anything: note_detected_activity changed after migration 107. This file must be brought up to date with that change first.';
  end if;
end $$;

-- ----------------------------------------------- 1. the alert, word changed
-- Migration 107's, word for word, but for 'Activity detected' near the end.
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
  -- No numbers on the lock screen: the time and stats show only in the app.
  if v_a.sport = 'tennis' then
    perform public.send_push(v_a.user_id, 'Tennis detected', 'Log it on CourtSide.', '/log-session?activity=' || v_a.id);
  else
    perform public.send_push(v_a.user_id, 'Activity detected', public.workout_name(v_a.sport) || ' · Log it on CourtSide.', '/log-session?activity=' || v_a.id);
  end if;
  return 'pushed';
end $$;

-- ------------------------------------------------------------ 2. who may call
-- Server only, as 107 has it (create or replace keeps it; said again to be sure).
revoke all on function public.note_detected_activity(uuid, boolean, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------- 3. last check
do $$
begin
  if (select md5(p.prosrc) from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = 'note_detected_activity') is distinct from '6bc1468904ea0039f73991c3822c4e65'
     or has_function_privilege('authenticated', 'public.note_detected_activity(uuid, boolean, boolean)', 'execute')
     or has_function_privilege('anon', 'public.note_detected_activity(uuid, boolean, boolean)', 'execute') then
    raise exception 'Migration 131 stopped: the result was not as planned; nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------- 4. check to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- "). Expect
-- one row, 6bc1468904ea0039f73991c3822c4e65:
-- select md5(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'note_detected_activity';
--
-- The rolled-back test that goes with this file (run before applying it):
-- scratchpad act131/t131_rollback.sql — the whole file twice, then a WHOOP
-- run and a WHOOP tennis session put through it, inside one transaction
-- that is undone.
