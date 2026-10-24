-- CourtSide · migration 20261024000185: tennis logs itself, privately.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece, AFTER 183
-- and 184 (both live) and AFTER (or with) the trackers function that sends
-- "unsure"; deploying the function first is safe (record_activity reads the
-- payload by name, so today's version simply ignores "unsure"). The other
-- way round, a Fitbit "Sport" session filed in between would be logged as
-- tennis. It is all-or-nothing: if a check fails, it stops and nothing at
-- all changes. Safe to run more than once.
--
-- What it does (the owner, Oct 24): "auto logged so that your streaks always
-- show up, but it will auto log privately so only you can see and then you
-- still get a notification to post it and then if you [tap] that you could
-- add a photo, the score, tag people, etc. and then post it". And: "Cancel
-- the 10pm to 7am thing".
--
--   * Where: note_detected_activity, the one place every tracker's session
--     goes through (WHOOP's webhook and its 15-minute sweep, Fitbit/Oura/
--     Polar's /sync and the twice-hourly /sync-all, and the iPhone's
--     report_activity). A session the tracker itself called Tennis, 20
--     minutes or more, becomes a practice session in Your sessions at once:
--     kind 'practice', its length, its day where it was played, no place,
--     no score, no heart rate (heart rate stays on the tracker's row, seen
--     by its owner only). Only the player sees it (practice_sessions is own
--     rows only). It counts for the streak and the hours.
--   * Not auto-logged, filed as before for the player to log or dismiss: a
--     session under 20 minutes, a Fitbit "Sport" or racket catch-all
--     ("Was this tennis?", the new unsure flag), any other workout, one that
--     ended over 8 days ago, one already logged by hand, the second copy of
--     a session two trackers saw, and anyone who turned off Settings →
--     "Log tennis automatically" (user_state.auto_log, on unless switched off).
--   * If the session cannot be saved (30 in a day, or the same session saved
--     a moment earlier) the row is filed exactly as before, nothing breaks.
--   * The alert for an auto-logged session: "Tennis logged" / "Saved
--     privately · tap to add the score or post it." It opens that session's
--     post page (photo, score, tags, court, caption, Post). Still no length
--     or stats on the lock screen (public/privacy.html). An unsure one:
--     "Was this tennis?" / "Tap to log it on CourtSide."
--   * Night: alerts now go out at any hour (the 10pm-7am skip is gone from
--     note_detected_activity and sweep_activities). Unchanged: only for a
--     session that ended in the last 12 hours, never when alerts are off,
--     one alert per session, 20 minutes or more (183), teen rules.
--   * Undo: remove_auto_log(a) (the app's "Not tennis? Remove") deletes that
--     session and hides the row for good. Removing an auto-logged session
--     from Your sessions does the same (it no longer comes back to To do).
--     A tracker that takes the session back (WHOOP deleted it) takes the
--     auto-logged session with it, unless it was posted or has tags. A
--     tracker that changes its length changes the untouched session's too
--     (never minutes the player changed, never one logged on a twin's length).
--   * The player's own log wins: logging a session (any app build, even one
--     that never saw the auto log) takes the place of an untouched auto log
--     of it (no post, no tags, no score or other change) instead of failing
--     with "Already logged.".
--   * Invites: a session the server logged by itself is not the invitee
--     doing something (invite_first_action, invite_second_day).
--   * No backfill: sessions already waiting in To do stay there.
--
-- Needs the live versions read on Oct 24 (138's note_detected_activity and
-- sweep_activities, record_activity, mark_activity_logged, withdraw_activity,
-- 183's send_activity_pushes, 116's invite_second_day, invite_first_action).
-- The check stops without changing anything if any of them is other than
-- those (or this file's own, so a second run passes).
--
-- To undo: run supabase/rollback/185_undo.sql in the SQL editor (it puts
-- back the exact live versions from before this file and takes out its new
-- functions and trigger; the new columns stay, unused).

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  r record;
  want jsonb := '{
    "note_detected_activity": ["804e5d88e5a616bd9890a116f8d749bd", "ef023031bab2d4e925e42b010d05c3eb"],
    "send_activity_pushes":   ["662ae4e0364d645f59480587a15c2b5c", "42d79ffd3e542dd6c7bf0d59a26e67b5"],
    "sweep_activities":       ["f4f320c3bf39edc4bb488c1966b4900b", "e0ae64033e3d782af7b04a8cc7a3a726"],
    "record_activity":        ["7dd7db000e6fe7421b6147c4d8b18eca", "be86a0c3b9b708784d420575f42cdd48"],
    "mark_activity_logged":   ["044c9ee535f1637deae6e5efea2e9bfe", "22ed463e49e4793805aeb63cd3174390"],
    "withdraw_activity":      ["18f79010bf2780b2719160e9a7d44962", "d9571fe1d56ac2f53891d4979cce908a"],
    "invite_first_action":    ["d908956bf0346e22406b4ba45e4b6ba2", "921304feccd26712d5098653ecce73b6"],
    "invite_second_day":      ["b2da94c30b820977f86e3b77c8ceb0f7", "f1c199bd787c4e2f55115e25d8b8156d"]
  }';
begin
  if to_regclass('public.detected_activities') is null or to_regclass('public.practice_sessions') is null
     or to_regclass('public.user_state') is null or to_regprocedure('public.tennis_allowed(uuid, text)') is null then
    raise exception 'Migration 20261024000185 stopped before changing anything: the tennis tables or tennis_allowed are missing. Ask Claude to look.';
  end if;
  for r in select k.key as fn, (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = k.key) as n,
                  (select max(md5(p.prosrc)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = k.key) as now_is,
                  k.value as ok
             from jsonb_each(want) k loop
    if r.n <> 1 or not coalesce(r.ok @> to_jsonb(r.now_is), false) then
      raise exception 'Migration 20261024000185 stopped before changing anything: % changed since it was read on Oct 24. This file must be brought up to date with that change first.', r.fn;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------- 1. new columns
-- Saved by the server, not the player (Your sessions says "Logged for you").
alter table public.practice_sessions add column if not exists auto_logged boolean not null default false;
-- A tracker's "maybe tennis" (Fitbit's Sport / racket catch-all): asked, never auto-logged.
alter table public.detected_activities add column if not exists unsure boolean not null default false;
-- Settings → "Log tennis automatically". On unless the player switches it off.
alter table public.user_state add column if not exists auto_log boolean not null default true;

-- ------------------------------------------------------------- 2. helpers
-- The day a session was played, where it was played (the app's activityDay):
-- its start at the tracker's own clock, else at the player's saved time zone,
-- else in UTC.
create or replace function public.activity_day(u uuid, t0 timestamptz, off int) returns date
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
begin
  if off is not null then return ((t0 at time zone 'UTC') + make_interval(mins => off))::date; end if;
  select tz into v_tz from public.user_state where user_id = u;
  if v_tz is not null then
    begin
      return (t0 at time zone v_tz)::date;
    exception when others then
      null;
    end;
  end if;
  return (t0 at time zone 'UTC')::date;
end $$;

-- An auto-logged session the player has not touched in public: no post carries it.
create or replace function public.session_unposted(s_id uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.posts p where p.author_id = u and p.session->>'sessionId' = s_id::text)
$$;

revoke all on function public.activity_day(uuid, timestamptz, int) from public, anon, authenticated;
revoke all on function public.session_unposted(uuid, uuid) from public, anon, authenticated;

-- Saves row a_id as a private practice session, on the facts of row by_id
-- (the same row, or its later twin from a second tracker). True when saved.
-- Never raises: anything in the way (30 sessions in a day, the same session
-- saved a moment earlier) leaves the row filed as before.
create or replace function public.auto_log_activity(a_id uuid, by_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_a public.detected_activities;
  v_by public.detected_activities;
begin
  select * into v_a from public.detected_activities where id = a_id;
  if not found then return false; end if;
  select * into v_by from public.detected_activities where id = by_id;
  if not found or v_by.user_id <> v_a.user_id then return false; end if;
  -- Filed, waiting, not logged. Tennis, the tracker sure of it, 20 minutes or more, this week.
  if v_a.status <> 'new' or v_a.session_id is not null or v_a.notified_at is null
     or v_a.sport <> 'tennis' or v_by.sport <> 'tennis' or v_by.unsure or v_by.minutes < 20
     or v_by.ended_at < now() - interval '8 days' then
    return false;
  end if;
  if not public.tennis_allowed(v_by.user_id, v_by.source) then return false; end if;
  -- Settings → "Log tennis automatically" (on unless switched off).
  if (select us.auto_log from public.user_state us where us.user_id = v_a.user_id) is false then return false; end if;
  -- Already logged by hand (a tennis session of theirs saved between the
  -- start and 12 hours after the end of either copy): never a second one.
  if exists (select 1 from public.practice_sessions s where s.user_id = v_a.user_id and s.activity_id is null and not s.auto_logged
               and s.kind in ('practice', 'match', 'drills')
               and s.created_at between least(v_a.started_at, v_by.started_at) and greatest(v_a.ended_at, v_by.ended_at) + interval '12 hours') then
    return false;
  end if;
  begin
    -- No place, score or heart rate: the player adds what they like when they post it.
    -- mark_activity_logged then marks the row 'logged' with this session.
    insert into public.practice_sessions (user_id, day, minutes, kind, activity_id, auto_logged)
      values (v_a.user_id, public.activity_day(v_a.user_id, v_a.started_at, v_a.tz_offset_min), v_by.minutes, 'practice', v_a.id, true);
  exception when others then
    return false;
  end;
  return exists (select 1 from public.detected_activities where id = a_id and status = 'logged');
end $$;

revoke all on function public.auto_log_activity(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------- 3. the one funnel
-- Migration 138's, but for the auto log (marked "auto log") and without the
-- 10pm-7am skip (owner, Oct 24: "Cancel the 10pm to 7am thing").
create or replace function public.note_detected_activity(a_id uuid, quiet boolean default false, force_pending boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_a public.detected_activities;
  v_twin uuid;
  v_label text;
  v_who text;
  v_day text;
  v_push boolean;
  v_logged boolean;
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
  -- carries the alert, this one stays quiet. Only ever the same sport. A copy
  -- already logged counts whichever was filed first: two copies filed at the
  -- same moment (a webhook and a sync) never both log themselves, and a copy
  -- already filed (noted under this lock) counts as the earlier one (185).
  select o.id into v_twin from public.detected_activities o
   where o.user_id = v_a.user_id and o.id <> v_a.id and o.sport = v_a.sport and o.status in ('new', 'logged', 'dismissed')
     and (o.created_at <= v_a.created_at or o.status = 'logged' or o.notified_at is not null)
     and (abs(extract(epoch from o.started_at - v_a.started_at)) <= 600
          or extract(epoch from least(o.ended_at, v_a.ended_at) - greatest(o.started_at, v_a.started_at))
             >= 0.5 * least(extract(epoch from o.ended_at - o.started_at), extract(epoch from v_a.ended_at - v_a.started_at)))
   order by (o.status = 'logged') desc, o.created_at limit 1;
  if v_twin is not null then
    update public.detected_activities set status = 'duplicate', duplicate_of = v_twin, notified_at = now(), updated_at = now() where id = v_a.id;
    -- auto log: the earlier copy was too short, or only "maybe tennis", to log
    -- itself; this one is sure, 20 minutes or more. The session is logged
    -- after all, under the earlier copy (the app follows a duplicate to it).
    -- Asked first, on its own line: inside one "and" the database may skip
    -- the call once "not quiet" is false, and the session would never log.
    v_logged := public.auto_log_activity(v_twin, v_a.id);
    if v_logged and not quiet and v_a.ended_at >= now() - interval '12 hours'
       and (select push_activity from public.user_state where user_id = v_a.user_id) is distinct from false then
      perform public.send_activity_pushes(v_a.user_id, array[v_twin]);
    end if;
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
  -- auto log: tennis the tracker is sure of, 20 minutes or more, saved as a
  -- private practice session (only the player sees it; it counts for the
  -- streak). The alert below then says "Tennis logged" and opens its post page.
  perform public.auto_log_activity(v_a.id, v_a.id);
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
  -- it is from long ago, or the player turned these alerts off. Any hour of
  -- the day or night (the 10pm-7am skip is gone).
  if quiet then return 'filed'; end if;
  if v_a.ended_at < now() - interval '12 hours' then return 'filed-old'; end if;
  select push_activity into v_push from public.user_state where user_id = v_a.user_id;
  if v_push is false then return 'filed-off'; end if;
  -- The lock-screen alert: on its own ("Tennis logged", "Tennis detected",
  -- "Activity detected"), unless it is the fourth or more in one go, when ONE
  -- "4 workouts found" stands for them all ('pushed-found'; any more, 'folded').
  return public.send_activity_pushes(v_a.user_id, array[v_a.id]);
end $$;

revoke all on function public.note_detected_activity(uuid, boolean, boolean) from public, anon, authenticated;

-- ------------------------------------------------- 4. the alerts
-- Migration 183's, but an auto-logged session (logged by the server, not yet
-- posted) is due an alert too, with its own words, and an unsure one asks.
-- Still no length or stats on the lock screen; still 20 minutes and up.
create or replace function public.send_activity_pushes(u uuid, ids uuid[]) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_due uuid[];
  v_ones uuid[];
  v_go uuid[];
  v_found boolean;
  v_n int;
  v_tennis boolean;
  v_auto boolean;
  r record;
begin
  if u is null or coalesce(cardinality(ids), 0) = 0 then return 'none'; end if;
  -- One person's alerts one at a time (note_detected_activity holds the same lock).
  perform pg_advisory_xact_lock(hashtextextended('activity:' || u::text, 0));
  -- Theirs, waiting to be logged or logged for them and not posted, not
  -- alerted since they were filed: newest first. Only sessions of 20 minutes
  -- or more buzz (183); a shorter one is filed quietly in To do and Notifications.
  select array_agg(d.id order by d.ended_at desc) into v_due
    from public.detected_activities d left join public.practice_sessions s on s.id = d.session_id
   where d.user_id = u and d.id = any(ids)
     and (d.status = 'new' and d.minutes >= 20
          or d.status = 'logged' and s.auto_logged and public.session_unposted(s.id, u))
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
  -- Its single alerts, those still waiting (one logged by the player or hidden since is not counted).
  select coalesce(array_agg(d.id order by d.ended_at desc), '{}') into v_ones
    from public.detected_activities d left join public.practice_sessions s on s.id = d.session_id
   where d.user_id = u and d.pushed_as = 'one'
     and (d.status = 'new' or d.status = 'logged' and s.auto_logged and public.session_unposted(s.id, u))
     and d.pushed_at > now() - interval '10 minutes' and not (d.id = any(v_due));
  v_n := cardinality(v_ones) + cardinality(v_due);
  -- Three or fewer in the go: one each. No numbers on the lock screen: the time and stats show only in the app.
  if v_n <= 3 then
    for r in select d.id, d.sport, d.status, d.unsure from public.detected_activities d where d.id = any(v_due) order by d.ended_at loop
      if r.status = 'logged' then
        -- Opens its post page (photo, score, tags, court, caption).
        perform public.send_push(u, 'Tennis logged', 'Saved privately · tap to add the score or post it.', '/log-session?activity=' || r.id);
      elsif r.sport = 'tennis' and r.unsure then
        perform public.send_push(u, 'Was this tennis?', 'Tap to log it on CourtSide.', '/log-session?activity=' || r.id);
      elsif r.sport = 'tennis' then
        perform public.send_push(u, 'Tennis detected', 'Log it on CourtSide.', '/log-session?activity=' || r.id);
      else
        perform public.send_push(u, 'Activity detected', public.workout_name(r.sport) || ' · Log it on CourtSide.', '/log-session?activity=' || r.id);
      end if;
    end loop;
    update public.detected_activities set pushed_at = now(), pushed_as = 'one' where id = any(v_due);
    return 'pushed';
  end if;
  -- More than three: ONE alert for the go, opening its list in the app.
  select array_agg(d.id order by d.ended_at desc), coalesce(bool_and(d.sport = 'tennis'), false), coalesce(bool_and(d.status = 'logged'), false)
    into v_go, v_tennis, v_auto
    from public.detected_activities d where d.id = any(v_due || v_ones);
  perform public.send_push(u,
    v_n || case when v_auto then ' tennis sessions logged' when v_tennis then ' tennis sessions found' else ' workouts found' end,
    case when v_auto then 'Only you can see them · tap to post one.' else 'Tap to log them on CourtSide.' end,
    '/notifications?workouts=' || array_to_string(v_go[1:40], ','));
  update public.detected_activities set pushed_at = now(), pushed_as = case when id = v_due[1] then 'found' else 'folded' end where id = any(v_due);
  return 'pushed-found';
end $$;

-- Server only, as before (138).
revoke all on function public.send_activity_pushes(uuid, uuid[]) from public, anon, authenticated;

-- ------------------------------------------------- 5. the WHOOP sweep
-- 138's, without the 7am-9pm window: a scored session is alerted at any hour.
create or replace function public.sweep_activities() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_filed uuid[] := '{}';
  v_push boolean;
  v_note text;
  v_d uuid;
begin
  for r in select id from public.detected_activities
            where status = 'new' and notified_at is null and score_state = 'PENDING_SCORE'
              and ended_at between now() - interval '12 hours' and now() - interval '45 minutes'
              and public.activity_allowed(user_id, source, sport) loop
    v_note := public.note_detected_activity(r.id, true, true);
    if v_note = 'filed' then
      v_filed := v_filed || r.id;
    elsif v_note = 'duplicate' then
      -- The later copy that got its earlier, shorter copy logged after all
      -- (note_detected_activity's twin rule): that one's "Tennis logged" goes out here.
      -- Only a session logged in this very run: one logged before was announced then.
      select d.duplicate_of into v_d from public.detected_activities d where d.id = r.id;
      if v_d is not null and exists (select 1 from public.detected_activities o join public.practice_sessions s on s.id = o.session_id
                                      where o.id = v_d and o.status = 'logged' and s.auto_logged and s.created_at = now()) then
        v_filed := v_filed || v_d;
      end if;
    end if;
  end loop;
  for r in select distinct d.user_id from public.detected_activities d where d.id = any(v_filed) loop
    select push_activity into v_push from public.user_state where user_id = r.user_id;
    if v_push is false then continue; end if;
    perform public.send_activity_pushes(r.user_id, array(select d.id from public.detected_activities d where d.id = any(v_filed) and d.user_id = r.user_id));
  end loop;
  perform public.expire_activities(null);
  -- WHOOP sign-ins nobody collected.
  delete from public.whoop_pending where expires_at < now();
end $$;

revoke all on function public.sweep_activities() from public, anon, authenticated;

-- ------------------------------------------------- 6. filing a session
-- 138's, but it keeps the unsure flag, and an untouched auto-logged session
-- follows a change of length of its own row (only while it still has that
-- row's earlier length: never a twin's, never one the player changed). Its
-- answer says 'auto' when logged for them.
create or replace function public.record_activity(u uuid, src text, ext text, p jsonb, quiet boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t0 timestamptz;
  t1 timestamptz;
  mins int;
  pct int;
  v_pct text;
  hr_ok boolean;
  v_strain numeric;
  v_sport text;
  v_id uuid;
  v_note text;
  v_status text;
  v_prev int;
begin
  -- What it was: 'tennis' when the sender does not say (WHOOP and the other trackers, older phones).
  v_sport := coalesce(nullif(lower(btrim(p->>'sport')), ''), 'tennis');
  if u is null or src not in ('whoop', 'apple-health', 'health-connect', 'fitbit', 'oura', 'polar') or coalesce(char_length(ext), 0) not between 1 and 100
     or v_sport !~ '^[a-z][a-z0-9-]{1,39}$' or not public.activity_allowed(u, src, v_sport) then
    return null;
  end if;
  begin
    t0 := (p->>'started_at')::timestamptz;
    t1 := (p->>'ended_at')::timestamptz;
  exception when others then
    return null;
  end;
  if t0 is null or t1 is null or t1 <= t0 or t1 > now() + interval '10 minutes' or t0 < now() - interval '30 days' then return null; end if;
  mins := round(extract(epoch from t1 - t0) / 60)::int;
  if mins not between 5 and 600 then return null; end if;
  -- Heart rate (and its zones) from a strap that was barely on is not worth showing.
  -- How much of it the strap heard, as a percent. WHOOP sends a fraction, 0 to
  -- 1 (1 for a whole session), though its docs say 0 to 100: so 1 or less is a
  -- fraction (migration 155). Anything else is read exactly as before.
  v_pct := p->>'percent_recorded';
  if v_pct ~ '^[0-9]+([.][0-9]+)?$' then
    if v_pct::numeric <= 1 then v_pct := (v_pct::numeric * 100)::text; end if;
  end if;
  pct := public.activity_int(v_pct, 0, 100);
  hr_ok := pct is null or pct >= 50;
  v_strain := case when p->>'strain' ~ '^[0-9]+([.][0-9]+)?$' then case when (p->>'strain')::numeric <= 21 then round((p->>'strain')::numeric, 1) end end;
  -- This row's length before this filing (null when it is new): see below.
  select d.minutes into v_prev from public.detected_activities d where d.user_id = u and d.source = src and d.external_id = ext;

  insert into public.detected_activities as d (user_id, source, external_id, sport, started_at, ended_at, tz_offset_min, minutes, avg_hr, max_hr, kcal, strain, score_state, device, hr_zones, distance_m, unsure)
  values (
    u, src, ext, v_sport, t0, t1,
    public.activity_int(p->>'tz_offset_min', -840, 840),
    mins,
    case when hr_ok then public.activity_int(p->>'avg_hr', 30, 250) end,
    case when hr_ok then public.activity_int(p->>'max_hr', 30, 250) end,
    public.activity_int(p->>'kcal', 0, 10000),
    v_strain,
    case when p->>'score_state' in ('SCORED', 'PENDING_SCORE', 'UNSCORABLE') then p->>'score_state' end,
    nullif(left(btrim(p->>'device'), 60), ''),
    case when hr_ok then public.activity_zones(p->'hr_zones', mins) end,
    public.activity_int(p->>'distance_m', 0, 1000000),
    -- A tracker's "maybe tennis" (Fitbit's Sport): asked, never auto-logged (185).
    coalesce(p->>'unsure', '') = 'true'
  )
  on conflict (user_id, source, external_id) do update set
    sport = excluded.sport,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    minutes = excluded.minutes,
    tz_offset_min = coalesce(excluded.tz_offset_min, d.tz_offset_min),
    -- A re-score from a strap that was barely on takes the heart rate (and
    -- its zones) off, rather than keeping the earlier numbers.
    avg_hr = case when hr_ok then coalesce(excluded.avg_hr, d.avg_hr) end,
    max_hr = case when hr_ok then coalesce(excluded.max_hr, d.max_hr) end,
    kcal = coalesce(excluded.kcal, d.kcal),
    strain = coalesce(excluded.strain, d.strain),
    score_state = coalesce(excluded.score_state, d.score_state),
    device = coalesce(excluded.device, d.device),
    hr_zones = case when hr_ok then coalesce(excluded.hr_zones, d.hr_zones) end,
    distance_m = coalesce(excluded.distance_m, d.distance_m),
    unsure = excluded.unsure,
    -- The tracker took it back and then sent it again: it is news once more.
    status = case when d.status = 'withdrawn' then 'new' else d.status end,
    updated_at = now()
  returning d.id into v_id;

  -- A tracker that changed the length (a WHOOP re-score): an auto-logged
  -- session nobody posted yet follows it (185), only while it still has this
  -- row's earlier length. One logged on a longer twin's length (Apple's 15
  -- minutes, WHOOP's 60) keeps it when the short copy is sent again, and
  -- minutes the player changed are never overwritten.
  update public.practice_sessions s set minutes = mins
    from public.detected_activities d
   where d.id = v_id and s.id = d.session_id and s.user_id = u and s.auto_logged
     and s.minutes = v_prev and s.minutes <> mins
     and public.session_unposted(s.id, u);

  v_note := public.note_detected_activity(v_id, quiet);
  select status into v_status from public.detected_activities where id = v_id;
  perform public.expire_activities(u);
  -- 'auto': logged by the server just now or before, privately (185).
  return jsonb_build_object('id', v_id, 'status', v_status, 'note', v_note,
                            'auto', exists (select 1 from public.practice_sessions s where s.activity_id = v_id and s.auto_logged));
end $$;

revoke all on function public.record_activity(uuid, text, text, jsonb, boolean) from public, anon, authenticated;

-- ------------------------------------------------- 7. removing one
-- 58's trigger, but taking away a session the server logged means "not
-- tennis": its row is hidden for good (never back in To do) and its
-- notification goes. A session the player logged goes back to To do, as before.
create or replace function public.mark_activity_logged() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.activity_id is not null then
    update public.detected_activities set status = 'logged', session_id = new.id, updated_at = now() where id = new.activity_id and user_id = new.user_id;
  elsif tg_op = 'DELETE' and current_setting('courtside.replacing_auto', true) = '1' then
    -- The player's own log of it is taking its place (replace_auto_log): the
    -- row stays, and its notification, and the new session marks it below.
    return null;
  elsif tg_op = 'DELETE' and old.activity_id is not null and old.auto_logged then
    update public.detected_activities set status = 'dismissed', session_id = null, updated_at = now() where id = old.activity_id and status = 'logged';
    delete from public.notifications where user_id = old.user_id and kind = 'activity' and target_id = old.activity_id::text;
  elsif tg_op = 'DELETE' and old.activity_id is not null then
    update public.detected_activities set status = 'new', session_id = null, updated_at = now() where id = old.activity_id and status = 'logged';
  end if;
  return null;
end $$;

revoke all on function public.mark_activity_logged() from public, anon, authenticated;

-- The player logs a session the server already logged for them (an app
-- build from before this file, or a phone that has not read the auto log
-- yet): their log, with what they chose (match, score, minutes), takes its
-- place instead of failing with "Already logged.". Only while the auto log
-- is untouched (no post, nobody tagged, still a plain practice with no score,
-- result, opponent, note or court); otherwise the unique index answers
-- as before. Runs after guard_session_activity (names go in order), so the
-- activity is already known to be theirs.
create or replace function public.replace_auto_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.activity_id is not null and not new.auto_logged then
    perform set_config('courtside.replacing_auto', '1', true);
    delete from public.practice_sessions s
     where s.activity_id = new.activity_id and s.user_id = new.user_id and s.auto_logged
       and s.kind = 'practice' and s.sets is null and s.won is null and coalesce(s.opponent, '') = '' and coalesce(s.note, '') = '' and s.court_id is null
       and public.session_unposted(s.id, s.user_id)
       and not exists (select 1 from public.session_tags t where t.session_id = s.id);
    perform set_config('courtside.replacing_auto', '', true);
  end if;
  return new;
end $$;

revoke all on function public.replace_auto_log() from public, anon, authenticated;
drop trigger if exists hand_log_replaces_auto on public.practice_sessions;
create trigger hand_log_replaces_auto before insert on public.practice_sessions
  for each row execute function public.replace_auto_log();

-- The app's "Not tennis? Remove": the player's own auto-logged session for
-- row a goes, and the row is hidden for good. True when something changed.
create or replace function public.remove_auto_log(a uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_n int;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  delete from public.practice_sessions where activity_id = a and user_id = v_me and auto_logged;
  get diagnostics v_n = row_count;
  -- Already gone (or never logged): hide the row all the same.
  if v_n = 0 then
    update public.detected_activities set status = 'dismissed', updated_at = now() where id = a and user_id = v_me and status in ('new', 'duplicate');
    get diagnostics v_n = row_count;
    delete from public.notifications where user_id = v_me and kind = 'activity' and target_id = a::text and v_n > 0;
  end if;
  return v_n > 0;
end $$;

revoke all on function public.remove_auto_log(uuid) from public, anon;
grant execute on function public.remove_auto_log(uuid) to authenticated;

-- The tracker took a session back (WHOOP deleted it, or it is no longer
-- tennis): 138's, but an auto-logged session nobody posted or tagged goes
-- with it, so a wrong label never stays in the streak.
create or replace function public.withdraw_activity(u uuid, src text, ext text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  with gone as (
    delete from public.practice_sessions s using public.detected_activities d
     where d.user_id = u and d.source = src and d.external_id = ext and d.status = 'logged'
       and s.id = d.session_id and s.user_id = u and s.auto_logged and public.session_unposted(s.id, u)
       and not exists (select 1 from public.session_tags t where t.session_id = s.id)
    returning d.id)
  select array_agg(id) into v_ids from gone;
  update public.detected_activities set status = 'withdrawn', notified_at = null, session_id = null, updated_at = now()
   where user_id = u and source = src and external_id = ext and (status in ('new', 'duplicate') or id = any(coalesce(v_ids, '{}')));
  delete from public.notifications n using public.detected_activities d
   where d.user_id = u and d.source = src and d.external_id = ext and d.status = 'withdrawn' and n.user_id = u and n.kind = 'activity' and n.target_id = d.id::text;
end $$;

revoke all on function public.withdraw_activity(uuid, text, text) from public, anon, authenticated;

-- ------------------------------------------------- 7b. invites ($1 each)
-- The live versions (invite_first_action 80/102, invite_second_day 116), but
-- a session the server logged by itself is not the invitee doing anything:
-- a WHOOP connected once must not "do a first thing" or "come back on a
-- second day" with nobody opening the app. A session they log themselves
-- still counts, as before.
create or replace function public.invite_first_action(u uuid, inviter uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select min(t) from (
              select created_at as t from public.follows           where follower_id = u and following_id is distinct from inviter
    union all select created_at        from public.posts             where author_id = u
    union all select created_at        from public.questions         where author_id = u
    union all select created_at        from public.answers           where author_id = u
    union all select created_at        from public.comments          where author_id = u
    union all select created_at        from public.hit_requests      where author_id = u
    union all select created_at        from public.hit_joins         where user_id = u
    union all select created_at        from public.messages          where sender_id = u
    union all select created_at        from public.practice_sessions where user_id = u and not auto_logged
  ) s
$$;

create or replace function public.invite_second_day(u uuid, joined timestamptz) returns timestamptz
language sql stable security definer set search_path = public as $$
  with s(t) as (
              select updated_at        from public.push_tokens    where user_id = u
    union all select last_seen_at      from public.device_sightings where user_id = u
    union all select first_seen_at     from public.device_sightings where user_id = u
    union all select seen_at           from public.last_seen      where user_id = u
    union all select seen_at           from public.exact_spots    where user_id = u
    union all select first_seen_at     from public.feed_signals   where user_id = u
    union all select last_seen_at      from public.feed_signals   where user_id = u
    union all select updated_at        from public.user_state     where user_id = u
    union all select first_at          from public.app_opens      where user_id = u
    union all select created_at        from public.posts          where author_id = u
    union all select created_at        from public.comments       where author_id = u
    union all select created_at        from public.post_likes     where user_id = u
    union all select created_at        from public.questions      where author_id = u
    union all select created_at        from public.answers        where author_id = u
    union all select created_at        from public.messages       where sender_id = u
    union all select viewed_at         from public.story_views    where user_id = u
    union all select created_at        from public.hit_joins      where user_id = u
    union all select created_at        from public.hit_requests   where author_id = u
    union all select created_at        from public.court_checkins where user_id = u
    union all select created_at        from public.follows        where follower_id = u
    union all select created_at        from public.practice_sessions where user_id = u and not auto_logged
  )
  select min(t) from s
   where t >= joined + interval '20 hours' and t < joined + interval '14 days' and t <= now()
$$;

revoke all on function public.invite_first_action(uuid, uuid) from public, anon, authenticated;
revoke all on function public.invite_second_day(uuid, timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------- 8. last check
do $$
declare
  f record;
  want jsonb := '{
    "note_detected_activity(uuid,boolean,boolean)": "ef023031bab2d4e925e42b010d05c3eb",
    "send_activity_pushes(uuid,uuid[])": "42d79ffd3e542dd6c7bf0d59a26e67b5",
    "sweep_activities()": "e0ae64033e3d782af7b04a8cc7a3a726",
    "record_activity(uuid,text,text,jsonb,boolean)": "be86a0c3b9b708784d420575f42cdd48",
    "mark_activity_logged()": "22ed463e49e4793805aeb63cd3174390",
    "withdraw_activity(uuid,text,text)": "d9571fe1d56ac2f53891d4979cce908a",
    "auto_log_activity(uuid,uuid)": "1798d5cf3efbfa7ae723372209347ff4",
    "remove_auto_log(uuid)": "3d98c7b6be1719f47bc0d10ecfb592ac",
    "activity_day(uuid,timestamp with time zone,integer)": "c89246ac98557b36d290aa63d9e44329",
    "session_unposted(uuid,uuid)": "67a5c254f1a37d6c700f64fb88fa05d6",
    "replace_auto_log()": "0a214f57016f1731e7202588dc8d5fda",
    "invite_first_action(uuid,uuid)": "921304feccd26712d5098653ecce73b6",
    "invite_second_day(uuid,timestamp with time zone)": "f1c199bd787c4e2f55115e25d8b8156d"
  }';
  k text;
begin
  for k in select jsonb_object_keys(want) loop
    select md5(p.prosrc) as src, p.prosecdef as definer, p.proconfig as config,
           has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as signed_in
      into f from pg_proc p where p.oid = ('public.' || k)::regprocedure;
    if f.src is distinct from want->>k or not f.definer or f.config is distinct from array['search_path=public'] then
      raise exception 'Migration 20261024000185 stopped: % is not this file''s. Nothing was changed.', k;
    end if;
    if f.anon or (f.signed_in and k <> 'remove_auto_log(uuid)') or (not f.signed_in and k = 'remove_auto_log(uuid)') then
      raise exception 'Migration 20261024000185 stopped: who may call % is wrong. Nothing was changed.', k;
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'auto_log')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'practice_sessions' and column_name = 'auto_logged')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'detected_activities' and column_name = 'unsure') then
    raise exception 'Migration 20261024000185 stopped: a new column is missing. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 9. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
--
-- (a) Sessions logged for players since this ran (expect tennis, 20+ minutes):
-- select s.day, s.minutes, s.kind, d.source, d.status from public.practice_sessions s
--   join public.detected_activities d on d.id = s.activity_id where s.auto_logged order by s.created_at desc limit 20;
--
-- (b) Alerts of the last day, by what they said (pushed_as) and hour:
-- select pushed_as, status, minutes, pushed_at from public.detected_activities
--  where pushed_at > now() - interval '1 day' order by pushed_at desc limit 20;
