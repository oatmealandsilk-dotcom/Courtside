-- 107: every workout from Apple Health, not only tennis, and the past week
-- picked up once.
--
-- NOT APPLIED — needs the owner's OK. This file has not been run on the live
-- database. Until it runs, the app reads tennis only, exactly as today (it
-- looks for the switch this file adds, and finds none).
--
-- What it does (the owner's request, Oct 5: "My brother is going to run now.
-- I want him to be able to log his workout and get a notification after,
-- maybe even see his old ones."):
--
--   * A workout of any kind that the Health app saved (a run, a walk, a bike
--     ride, strength training, HIIT, yoga, a swim…) can be kept the same way a
--     tennis session is: one private row, only its owner can read it, nothing
--     in the app can write it. detected_activities.sport now holds what it
--     was as a short name ('tennis', 'run', 'walk', 'ride', 'strength',
--     'hiit', 'yoga', 'swim', …; lower case letters, numbers and dashes), and
--     a new column distance_m holds its distance in metres when Health had
--     one (runs, walks, rides, swims). Tennis rows are unchanged.
--   * A new switch, 'flag:workouts-apple', starts 'on' (everyone), as
--     tennis from Apple Health already is. Turning it off stops new workouts
--     other than tennis at once, without an app update:
--       update server_settings set value = 'off', updated_at = now() where key = 'flag:workouts-apple';
--     Tennis keeps its own switches. WHOOP, Fitbit, Oura and Polar still only
--     ever send tennis (they have no 'workouts-' switch, so anything else
--     from them is turned away).
--   * The alert row in Notifications names the workout: "Run · 32 min · from
--     your Apple Watch". Tennis keeps today's words exactly ("32 min · from
--     your Apple Watch"). A session the app only finds more than 20 hours
--     after it ended gets its weekday too ("Run · Tue · 32 min · from …").
--   * The past week, once (the owner, Oct 5): a session that ended up to 8
--     days ago now gets its alert row (before, only up to 48 hours), so the
--     first look after this update (the phone looks back a week and six
--     hours) puts each of the past week's workouts in Notifications, ready to
--     log. The lock-screen alert still only goes out for a session that ended
--     in the last 12 hours, never between 10pm and 7am, so catching up never
--     buzzes a phone. A phone may now hand over 60 sessions a day (was 40),
--     so a week of workouts fits.
--   * The same session seen twice (the Watch and WHOOP) is only a copy when
--     it is the same sport: a gym session never silences a tennis match. And
--     a session logged by hand only stands for a tracker's session of the
--     same kind: a practice, match or drills for tennis, a fitness session
--     for any other workout. (Before, any session logged that evening hid
--     that morning's run.)
--   * The lock-screen alert (WHOOP only today; Apple Health never sends one)
--     says "Workout detected" / "Run · Log it on CourtSide." for anything
--     that is not tennis. Tennis keeps "Tennis detected" / "Log it on
--     CourtSide.". Still no numbers on the lock screen.
--   * practice_sessions.workout: what a fitness session logged from a
--     workout was ('run'), so Your sessions can still say "Run" after the
--     workout's own row goes at 30 days. Private, like the rest of the log
--     (its owner's own rules, migration 39).
--   * Posts: a workout's post says what it was ("Run", or the log's own word
--     once logged), as kind 'fitness' with "workout", and carries its
--     distance ("distanceM", metres) beside its time, read from the private
--     row, never the phone's word. Distance goes on like the time does
--     (an owner question: see the report). Heart rate, zones, Strain and
--     calories keep migration 72's rules exactly. A tennis post is unchanged.
--
-- Replaces record_activity (65), report_activity (65), note_detected_activity
-- (69), sweep_activities (58), put_session_with (72) and post_session_stats
-- (72), as they are live (all six bodies checked against the files they came
-- from), and stops without changing anything if any of them was changed
-- since, or if the posts trigger runs something else. After this has run, do
-- not run 58, 65, 69 or 72 again (they would put the tennis-only versions
-- back); if one ever is, run this again.
--
-- Mentions nobody's age (migration 64, not run yet, looks for that).
-- Needs 39, 58, 62, 65, 69 and 72 (all live). Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
-- md5 of each function's body: as it is live, or as this file leaves it.
do $$
declare
  expected constant text[][] := array[
    -- name, live (Oct 5), as 107 leaves it
    ['record_activity', 'e872943428d16808ef64dfb4f2f997cf', '204b3c5b813b86e4128786eb7bddabfc'],
    ['report_activity', '1da946533886a6c87cf3a2812a383140', '3570c287b136c7fa38f972809c77104e'],
    ['note_detected_activity', '2f2e50a737115c4ccce92ef65d71154f', 'c4ed53d3c64a97039126d84033c2ea7f'],
    ['sweep_activities', '2bee888baacd4653daa7d1cfc4fe4707', '7c356d369f3806b1ab7f2cd4111c23d2'],
    ['put_session_with', '6faff87c098ccc412732c47233c04fd5', 'fdec3bfa130321b3e37a6d8e5176aeef'],
    ['post_session_stats', 'b1ce4a311a2558cd9a3542dc9b6bef89', 'c1425ad4aa68b6fad6f1ffa855382d59']
  ];
  i int;
  now_is text;
  wrong text[] := '{}';
  v_fn text;
begin
  if to_regclass('public.detected_activities') is null or to_regclass('public.tracker_tokens') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'detected_activities' and column_name = 'hr_zones') then
    raise exception 'Migration 107 stopped before changing anything: migrations 58, 65 and 69 have to run first.';
  end if;
  if to_regprocedure('public.health_share_list(jsonb)') is null or to_regprocedure('public.known_adult(uuid)') is null
     or to_regprocedure('public.post_session_ref(jsonb, uuid)') is null or to_regprocedure('public.session_with(uuid)') is null then
    raise exception 'Migration 107 stopped before changing anything: migrations 62 and 72 have to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    select md5(p.prosrc) into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1];
    if now_is is null or now_is not in (expected[i][2], expected[i][3]) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  -- The posts trigger runs migration 72's post_session_stats.
  select t.tgfoid::regproc::text into v_fn from pg_trigger t
    where t.tgrelid = 'public.posts'::regclass and t.tgname = 'fill_post_session_stats' and not t.tgisinternal;
  if v_fn is distinct from 'post_session_stats' then
    wrong := wrong || 'the posts trigger fill_post_session_stats'::text;
  end if;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 107 stopped before changing anything: % changed since it was written. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ---------------------------------------------------------------- 1. switch
-- 'on': everyone, as tennis from Apple Health already is (Oct 4). my_flags()
-- hands it to the app as 'workouts-apple' with nothing else to change.
insert into public.server_settings (key, value) values ('flag:workouts-apple', 'on') on conflict (key) do nothing;

-- --------------------------------------------------------------- 2. columns
-- What it was, as a short name. Was: tennis only.
alter table public.detected_activities drop constraint if exists detected_activities_sport_check;
alter table public.detected_activities add constraint detected_activities_sport_check
  check (sport ~ '^[a-z][a-z0-9-]{1,39}$');
-- Its distance in metres, when the tracker had one. Private like the rest of the row.
alter table public.detected_activities add column if not exists distance_m int check (distance_m between 0 and 1000000);
-- What a session logged from a workout was ('run'), kept in your own log.
alter table public.practice_sessions add column if not exists workout text check (workout is null or workout ~ '^[a-z][a-z0-9-]{1,39}$');

-- --------------------------------------------------------------- 3. helpers
-- A workout's short name in words: 'run' → 'Run', 'hiit' → 'HIIT'. The app
-- has the same list (src/features/activity/workouts.ts, NAMES): keep the two in step.
create or replace function public.workout_name(s text) returns text
language sql immutable set search_path = public as $$
  select case s
    when 'tennis' then 'Tennis'
    when 'run' then 'Run'
    when 'walk' then 'Walk'
    when 'ride' then 'Bike ride'
    when 'hike' then 'Hike'
    when 'swim' then 'Swim'
    when 'strength' then 'Strength training'
    when 'functional-strength' then 'Functional strength training'
    when 'hiit' then 'HIIT'
    when 'core' then 'Core training'
    when 'yoga' then 'Yoga'
    when 'pilates' then 'Pilates'
    when 'barre' then 'Barre'
    when 'stretching' then 'Stretching'
    when 'cooldown' then 'Cooldown'
    when 'recovery' then 'Recovery'
    when 'mind-body' then 'Mind and body'
    when 'elliptical' then 'Elliptical'
    when 'rowing' then 'Rowing'
    when 'stairs' then 'Stair climbing'
    when 'jump-rope' then 'Jump rope'
    when 'cardio' then 'Cardio'
    when 'cross-training' then 'Cross training'
    when 'dance' then 'Dance'
    when 'boxing' then 'Boxing'
    when 'kickboxing' then 'Kickboxing'
    when 'martial-arts' then 'Martial arts'
    when 'pickleball' then 'Pickleball'
    when 'table-tennis' then 'Table tennis'
    when 'squash' then 'Squash'
    when 'badminton' then 'Badminton'
    when 'racquetball' then 'Racquetball'
    when 'padel' then 'Padel'
    when 'soccer' then 'Soccer'
    when 'basketball' then 'Basketball'
    when 'volleyball' then 'Volleyball'
    when 'golf' then 'Golf'
    when 'climbing' then 'Climbing'
    when 'skating' then 'Skating'
    when 'skiing' then 'Skiing'
    when 'snowboarding' then 'Snowboarding'
    when 'surfing' then 'Surfing'
    when 'paddling' then 'Paddling'
    when 'track' then 'Track and field'
    when 'wheelchair' then 'Wheelchair workout'
    when 'workout' then 'Workout'
    -- Anything else in its own words, the first letter a capital: 'water-polo' → 'Water polo'.
    else coalesce(upper(left(replace(nullif(s, ''), '-', ' '), 1)) || substr(replace(s, '-', ' '), 2), 'Workout') end
$$;

-- Whether this person may have this kind of session from this source:
-- tennis by its own switch (migration 58, unchanged), anything else by the
-- source's 'workouts-' switch (only 'workouts-apple' exists). Either way,
-- only once they turned sessions on for that source.
create or replace function public.activity_allowed(u uuid, src text, a_sport text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when a_sport = 'tennis' then public.tennis_allowed(u, src)
    else public.flag_on_for('workouts-' || case src when 'apple-health' then 'apple' else src end, u)
         and exists (select 1 from public.health_connections c where c.user_id = u and c.provider = src and c.reads_workouts) end
$$;

-- ------------------------------------------- 4. a tracker's session comes in
-- Migration 65's, plus what it was ("sport", tennis when the sender does not
-- say) and its distance. Everything else (the heart-rate and zone rules, the
-- 30-day and 5-to-600-minute limits) is exactly as before.
create or replace function public.record_activity(u uuid, src text, ext text, p jsonb, quiet boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t0 timestamptz;
  t1 timestamptz;
  mins int;
  pct int;
  hr_ok boolean;
  v_strain numeric;
  v_sport text;
  v_id uuid;
  v_note text;
  v_status text;
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
  pct := public.activity_int(p->>'percent_recorded', 0, 100);
  hr_ok := pct is null or pct >= 50;
  v_strain := case when p->>'strain' ~ '^[0-9]+([.][0-9]+)?$' then case when (p->>'strain')::numeric <= 21 then round((p->>'strain')::numeric, 1) end end;

  insert into public.detected_activities as d (user_id, source, external_id, sport, started_at, ended_at, tz_offset_min, minutes, avg_hr, max_hr, kcal, strain, score_state, device, hr_zones, distance_m)
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
    public.activity_int(p->>'distance_m', 0, 1000000)
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
    -- The tracker took it back and then sent it again: it is news once more.
    status = case when d.status = 'withdrawn' then 'new' else d.status end,
    updated_at = now()
  returning d.id into v_id;

  v_note := public.note_detected_activity(v_id, quiet);
  select status into v_status from public.detected_activities where id = v_id;
  perform public.expire_activities(u);
  return jsonb_build_object('id', v_id, 'status', v_status, 'note', v_note);
end $$;

-- The phone's way in for Apple Health (migration 65's), as the signed-in
-- player. Now 60 a day (was 40), so the past week's workouts fit in one go.
create or replace function public.report_activity(ext text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_r jsonb;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  -- A day's worth (and a week caught up) is plenty; this stops a runaway phone, not a player.
  if (select count(*) from public.detected_activities where user_id = v_me and created_at > now() - interval '1 day') >= 60 then return null; end if;
  -- Only WHOOP has Strain, a scoring state and zone times.
  v_r := public.record_activity(v_me, 'apple-health', ext, coalesce(p, '{}'::jsonb) - 'strain' - 'score_state' - 'percent_recorded' - 'hr_zones', true);
  if v_r is null then return null; end if;
  return jsonb_build_object('id', v_r->'id', 'status', v_r->'status', 'notify', (v_r->>'note') = 'filed');
end $$;

-- ------------------------------------------------ 5. the alert, once each
-- Migration 69's, with four changes: a copy is only a copy of the same
-- sport; up to 8 days old still gets its row (was 48 hours); a session
-- logged by hand only stands for one of the same kind; and the words name
-- the workout (tennis's words are unchanged when found the same day).
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
  -- between the start and 12 hours after the end): tennis for tennis, a
  -- fitness session for any other workout.
  if exists (select 1 from public.practice_sessions s where s.user_id = v_a.user_id and s.activity_id is null
               and s.created_at between v_a.started_at and v_a.ended_at + interval '12 hours'
               and case when v_a.sport = 'tennis' then s.kind in ('practice', 'match', 'drills') else s.kind = 'fitness' end) then
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
    perform public.send_push(v_a.user_id, 'Workout detected', public.workout_name(v_a.sport) || ' · Log it on CourtSide.', '/log-session?activity=' || v_a.id);
  end if;
  return 'pushed';
end $$;

-- Migration 58's sweep, asking each session's own switch (tennis or workouts).
create or replace function public.sweep_activities() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in select id from public.detected_activities
            where status = 'new' and notified_at is null and score_state = 'PENDING_SCORE'
              and ended_at between now() - interval '12 hours' and now() - interval '45 minutes'
              and public.activity_allowed(user_id, source, sport) loop
    perform public.note_detected_activity(r.id, false, true);
  end loop;
  perform public.expire_activities(null);
  -- WHOOP sign-ins nobody collected.
  delete from public.whoop_pending where expires_at < now();
end $$;

-- ----------------------------------------------- 6. what a post's stats carry
-- Migration 72's, plus a workout: what it was ("workout", with kind
-- 'fitness' and its name as the focus) and its distance ("distanceM"),
-- both from the author's own private row while it is there, else as the
-- server wrote them. From the author's log once logged ("Run" for a fitness
-- session logged from a run). Never on tennis or on a session logged by
-- hand. Everything else, the health numbers included, is exactly as 72 left it.
create or replace function public.put_session_with(sess jsonb, author uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_out jsonb;
  v_ref uuid;
  v_ps public.practice_sessions;
  v_a public.detected_activities;
  v_with jsonb;
  v_hr boolean;
  v_day text;
  v_share text[];
  v_whoop boolean;
  v_kept text;
begin
  if sess is null or jsonb_typeof(sess) <> 'object' then return sess; end if;
  v_out := sess - 'with' - 'zones' - 'day' - 'distanceM';
  if v_out ? 'activityId' then
    select * into v_a from public.detected_activities where id::text = lower(v_out->>'activityId') and user_id = author;
  end if;
  if v_a.id is not null then
    select * into v_ps from public.practice_sessions where activity_id = v_a.id and user_id = author;
  else
    v_ref := public.post_session_ref(v_out, author);
    if v_ref is not null then select * into v_ps from public.practice_sessions where id = v_ref and user_id = author; end if;
  end if;
  v_ref := v_ps.id;

  if v_ref is not null then
    v_out := (v_out - 'won' - 'kind' - 'focus' - 'workout')
      || jsonb_build_object(
           'sessionId', v_ref::text,
           'kind', v_ps.kind,
           'focus', case when v_ps.kind = 'match' and v_ps.won is not null then 'Match · ' || case when v_ps.won then 'Won' else 'Lost' end
                         when v_ps.kind = 'fitness' and v_ps.workout is not null then public.workout_name(v_ps.workout)
                         else initcap(v_ps.kind) end)
      || case when v_ps.kind = 'match' and v_ps.won is not null then jsonb_build_object('won', v_ps.won) else '{}'::jsonb end
      || case when v_ps.kind = 'fitness' and v_ps.workout is not null then jsonb_build_object('workout', v_ps.workout) else '{}'::jsonb end
      || case when v_out ? 'activityId' then '{}'::jsonb else jsonb_build_object('minutes', v_ps.minutes) end;
  elsif v_out ? 'activityId' then
    -- Not logged: a workout says what it was; tennis says "Tennis", as before.
    v_kept := case when v_a.id is not null then v_a.sport
                   when sess->>'workout' ~ '^[a-z][a-z0-9-]{1,39}$' then sess->>'workout' end;
    if v_kept is not null and v_kept <> 'tennis' then
      v_out := (v_out - 'won' - 'kind' - 'sessionId' - 'workout') || jsonb_build_object('kind', 'fitness', 'focus', public.workout_name(v_kept), 'workout', v_kept);
    else
      v_out := (v_out - 'won' - 'kind' - 'sessionId' - 'workout') || jsonb_build_object('focus', 'Tennis');
    end if;
  end if;

  -- distance (107): a workout's, from its row while it is there, else as the server wrote it.
  if v_out ? 'activityId' then
    if v_a.id is not null then
      if v_a.sport <> 'tennis' and v_a.distance_m is not null then v_out := v_out || jsonb_build_object('distanceM', v_a.distance_m); end if;
    elsif v_out ? 'workout' and sess->>'distanceM' ~ '^[0-9]{1,7}$' and (sess->>'distanceM')::int <= 1000000 then
      v_out := v_out || jsonb_build_object('distanceM', (sess->>'distanceM')::int);
    end if;
  end if;

  v_day := case
    when v_ref is not null then to_char(v_ps.day, 'YYYY-MM-DD')
    when v_a.id is not null then
      case when v_a.tz_offset_min is not null
        then to_char((v_a.started_at at time zone 'UTC') + make_interval(mins => v_a.tz_offset_min), 'YYYY-MM-DD') end
    else public.session_day_text(sess->>'day') end;
  if v_day is not null then v_out := v_out || jsonb_build_object('day', v_day); end if;

  -- health numbers
  v_share := case when v_out ? 'activityId' then public.health_share_list(sess->'share') end;
  if not (v_out ? 'activityId') then
    -- A session logged by hand never carries any.
    v_out := v_out - 'share' - 'strain' - 'kcal';
  elsif v_share is not null then
    -- Chosen (72), any age: only the chosen numbers, from the author's own
    -- tracker row while it is there, else as the server wrote them.
    v_out := v_out - 'share' - 'avgHr' - 'maxHr' - 'strain' - 'kcal';
    v_whoop := case when v_a.id is not null then v_a.source = 'whoop' else sess->>'source' = 'whoop' end;
    if not v_whoop then v_share := array_remove(v_share, 'strain'); end if;
    if v_a.id is not null then
      if 'hr' = any (v_share) then
        v_out := v_out || jsonb_strip_nulls(jsonb_build_object('maxHr', v_a.max_hr, 'avgHr', v_a.avg_hr));
      end if;
      if 'zones' = any (v_share) and v_a.hr_zones is not null then
        v_out := v_out || jsonb_build_object('zones', to_jsonb(v_a.hr_zones));
      end if;
      if 'strain' = any (v_share) and v_a.strain is not null then
        v_out := v_out || jsonb_build_object('strain', v_a.strain);
      end if;
      if 'kcal' = any (v_share) and v_a.kcal is not null then
        v_out := v_out || jsonb_build_object('kcal', v_a.kcal);
      end if;
    else
      if 'hr' = any (v_share) then
        if sess->>'maxHr' ~ '^[0-9]{2,3}$' and (sess->>'maxHr')::int between 30 and 250 then v_out := v_out || jsonb_build_object('maxHr', (sess->>'maxHr')::int); end if;
        if sess->>'avgHr' ~ '^[0-9]{2,3}$' and (sess->>'avgHr')::int between 30 and 250 then v_out := v_out || jsonb_build_object('avgHr', (sess->>'avgHr')::int); end if;
      end if;
      if 'zones' = any (v_share) and public.session_zones_ok(sess->'zones') then
        v_out := v_out || jsonb_build_object('zones', sess->'zones');
      end if;
      if 'strain' = any (v_share) and sess->>'strain' ~ '^[0-9]{1,2}([.][0-9])?$' and (sess->>'strain')::numeric <= 21 then
        v_out := v_out || jsonb_build_object('strain', (sess->>'strain')::numeric);
      end if;
      if 'kcal' = any (v_share) and sess->>'kcal' ~ '^[0-9]{1,5}$' and (sess->>'kcal')::int <= 10000 then
        v_out := v_out || jsonb_build_object('kcal', (sess->>'kcal')::int);
      end if;
    end if;
    v_out := v_out || jsonb_build_object('share', to_jsonb(v_share));
  else
    -- No list (an older phone): migration 65's rule, unchanged. Heart rate
    -- as post_session_stats wrote it; zones beside it for a known adult;
    -- never Strain or calories.
    v_out := v_out - 'share' - 'strain' - 'kcal';
    if v_out ? 'maxHr' or v_out ? 'avgHr' then
      v_hr := public.known_adult(author);
      if v_hr and v_a.id is not null then
        if v_a.hr_zones is not null then v_out := v_out || jsonb_build_object('zones', to_jsonb(v_a.hr_zones)); end if;
      elsif v_hr and public.session_zones_ok(sess->'zones') then
        v_out := v_out || jsonb_build_object('zones', sess->'zones');
      end if;
    end if;
  end if;

  if v_ref is not null then
    v_with := public.session_with(v_ref);
    if v_with is not null then v_out := v_out || jsonb_build_object('with', v_with); end if;
  end if;
  return v_out;
end $$;

-- ------------------------------------------------ 7. a post's stats come in
-- Migration 72's, plus: a workout's post starts from its name rather than
-- "Tennis" (put_session_with then adds what it was and its distance from the
-- private row), and a phone's own "workout" or "distanceM" never stays on a
-- post that is not a tracker's.
create or replace function public.post_session_stats()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_a public.detected_activities; v_adult boolean; v_src text; v_s jsonb; v_share text[];
begin
  if new.session is null or jsonb_typeof(new.session) <> 'object' then return new; end if;
  if tg_op = 'UPDATE' and old.session is not null and jsonb_typeof(old.session) = 'object'
     and (new.session - 'with') is not distinct from (old.session - 'with') then
    -- Nothing changed but (at most) the list of players: keep the stats, work the list out again.
    if new.session is distinct from old.session then new.session := public.put_session_with(new.session, new.author_id); end if;
    if new.session ? 'activityId' then new.feature_ok := false; end if;
    return new;
  end if;
  if pg_column_size(new.session) > 4000 then raise exception 'session too large'; end if;
  if not (new.session ? 'activityId') then
    new.session := public.put_session_with(new.session - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show' - 'with' - 'share' - 'workout' - 'distanceM', new.author_id);
    return new;
  end if;
  select * into v_a from public.detected_activities where id::text = new.session->>'activityId' and user_id = new.author_id;
  if not found then
    new.session := public.put_session_with(new.session - 'activityId' - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show' - 'with' - 'share' - 'workout' - 'distanceM', new.author_id);
    return new;
  end if;
  v_src := case v_a.source when 'apple-health' then case when v_a.device ~ '^Watch[0-9]+,[0-9]+$' then 'apple-watch' else 'apple-health' end else v_a.source end;
  v_s := jsonb_build_object('focus', case when v_a.sport = 'tennis' then 'Tennis' else public.workout_name(v_a.sport) end, 'minutes', v_a.minutes, 'drills', '[]'::jsonb, 'activityId', v_a.id, 'source', v_src);
  v_share := public.health_share_list(new.session->'share');
  if v_share is not null then
    -- Chosen on the post (72): any age. put_session_with reads the numbers.
    v_s := v_s || jsonb_build_object('share', to_jsonb(v_share));
  else
    v_adult := public.known_adult(new.author_id);
    if v_adult and new.session ? 'maxHr' then v_s := v_s || jsonb_strip_nulls(jsonb_build_object('maxHr', v_a.max_hr, 'avgHr', v_a.avg_hr)); end if;
  end if;
  if (new.session->>'intensity') in ('1', '2', '3', '4', '5') then v_s := v_s || jsonb_build_object('intensity', (new.session->>'intensity')::int); end if;
  new.session := public.put_session_with(v_s, new.author_id);
  new.feature_ok := false;
  return new;
end $$;
drop trigger if exists fill_post_session_stats on public.posts;
create trigger fill_post_session_stats before insert or update of session, feature_ok on public.posts
  for each row execute function public.post_session_stats();

-- ------------------------------------------------------------ 8. who may call
-- Server only (as 58, 65, 69 and 72 have them, plus the two new helpers).
revoke all on function public.workout_name(text) from public, anon, authenticated;
revoke all on function public.activity_allowed(uuid, text, text) from public, anon, authenticated;
revoke all on function public.record_activity(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.note_detected_activity(uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.sweep_activities() from public, anon, authenticated;
revoke all on function public.put_session_with(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.post_session_stats() from public, anon, authenticated;
grant execute on function public.activity_allowed(uuid, text, text) to service_role;
grant execute on function public.record_activity(uuid, text, text, jsonb, boolean) to service_role;
grant execute on function public.sweep_activities() to service_role;
-- Signed-in players.
revoke all on function public.report_activity(text, jsonb) from public, anon;
grant execute on function public.report_activity(text, jsonb) to authenticated;

-- ------------------------------------------------------------- 9. last check
-- Nothing here reads anyone's age (so migration 64 finds nothing to object to, before or after).
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosrc ~* 'age_group'
      and p.proname in ('workout_name', 'activity_allowed', 'record_activity', 'report_activity', 'note_detected_activity', 'sweep_activities', 'put_session_with', 'post_session_stats');
  if bad is not null then
    raise exception 'Migration 107 stopped: % read the age directly. Nothing was changed.', bad;
  end if;
end $$;

commit;

-- ------------------------------------------------------- 10. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The switches (expect workouts-apple 'on', and the tennis ones as they were):
-- select key, value from server_settings where key like 'flag:%' order by 1;
--
-- (b) The new columns (expect detected_activities.distance_m integer, practice_sessions.workout text):
-- select table_name, column_name, data_type from information_schema.columns
--   where table_schema = 'public' and (table_name, column_name) in (('detected_activities', 'distance_m'), ('practice_sessions', 'workout')) order by 1;
--
-- (c) Who may call what (expect report_activity true; activity_allowed, put_session_with, record_activity, workout_name false):
-- select p.proname, has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
--   where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('report_activity', 'record_activity', 'activity_allowed', 'workout_name', 'put_session_with') order by 1;
--
-- (d) No function name exists twice (expect no rows):
-- select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace group by 1 having count(*) > 1;
--
-- (e) The posts trigger still runs the new function (expect post_session_stats):
-- select tgfoid::regproc from pg_trigger where tgrelid = 'public.posts'::regclass and tgname = 'fill_post_session_stats';
