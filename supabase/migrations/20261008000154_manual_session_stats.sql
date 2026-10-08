-- CourtSide · migration 20261008000154: calories and average heart rate typed
-- into a session logged by hand, and shown on its post like a tracker's (Oct 8,
-- owner: "yes add it").
--
-- NOT APPLIED — the lead applies it. Run it in the Supabase SQL editor as one
-- piece. It is all-or-nothing: if the check below fails it stops, and nothing
-- at all changes. Safe to run more than once. The app works the same before it
-- runs: until it has, "+ Add calories & heart rate" is simply not offered.
--
-- In plain words, what changes:
--
--   1. Your sessions list (practice_sessions) gets two optional numbers for a
--      session logged by hand: calories (kcal, 1 to 3000) and average heart
--      rate (avg_hr, 40 to 220 beats a minute). The database refuses anything
--      outside those limits. They are private, like the rest of your log: the
--      existing rule (only you can read or change your own sessions) covers
--      them, unchanged. Nothing that counts or ranks (streaks, records, hours,
--      King of the Court, Flyby, the weekly recap) reads them.
--   2. A post made from such a session can show them, the same way a
--      tracker's numbers show: only the ones the author chose under "Share
--      health data" (any age; the app starts it on for adults and off for
--      everyone else, as for a tracker). The server writes them on the post
--      from the author's own log, never from what the phone sent, exactly as
--      it already does for a tracker's numbers and a match's score. A session
--      from a tracker (Apple Watch, WHOOP…) never takes typed numbers: its
--      tracker's own numbers stay the only ones.
--
-- What changes, by name:
--   practice_sessions: new columns kcal smallint and avg_hr smallint, each
--     with a check on its range.
--   put_session_with (migration 107's, word for word apart from its health
--     numbers: the line reading the "share" list and the block under it): a
--     post from a session logged by hand keeps its "share" list and gets
--     avgHr and kcal from the log, only those ticked. Before, it stripped all
--     health numbers from such a post. A tracker's post comes out exactly as
--     before.
--   post_session_stats (migration 107's, word for word, two lines changed):
--     no longer takes the "share" list off a post from your log before
--     put_session_with reads it.
--
-- Stops without changing anything if either function has changed since the
-- versions this file was written against (107, as live on Oct 8).

begin;

do $$
declare
  put_is text;
  stats_is text;
begin
  if to_regclass('public.practice_sessions') is null or to_regclass('public.posts') is null
     or to_regprocedure('public.health_share_list(jsonb)') is null or to_regprocedure('public.post_session_ref(jsonb, uuid)') is null
     or to_regprocedure('public.session_with(uuid)') is null or to_regprocedure('public.workout_name(text)') is null
     or to_regprocedure('public.session_day_text(text)') is null or to_regprocedure('public.session_zones_ok(jsonb)') is null
     or to_regprocedure('public.known_adult(uuid)') is null then
    raise exception 'Migration 154 stopped before changing anything: it needs practice_sessions, posts and the session helpers from migrations 62, 65, 72 and 107.';
  end if;
  select md5(p.prosrc) into put_is from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'put_session_with';
  -- Migration 107's version, or this file's own (run again).
  if put_is is distinct from 'fdec3bfa130321b3e37a6d8e5176aeef' and put_is is distinct from '645dadf7bb32daccd8946c6173d7bb01' then
    raise exception 'Migration 154 stopped before changing anything: put_session_with changed since migration 107. This file must be brought up to date with that change first.';
  end if;
  select md5(p.prosrc) into stats_is from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'post_session_stats';
  -- Migration 107's version, or this file's own (run again).
  if stats_is is distinct from 'c1425ad4aa68b6fad6f1ffa855382d59' and stats_is is distinct from 'd561fb9e21e84a2c4d298bb9f72fd835' then
    raise exception 'Migration 154 stopped before changing anything: post_session_stats changed since migration 107. This file must be brought up to date with that change first.';
  end if;
end $$;

-- ------------------------------------------------------------ 1. the two numbers
alter table public.practice_sessions add column if not exists kcal smallint;
alter table public.practice_sessions add column if not exists avg_hr smallint;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.practice_sessions'::regclass and conname = 'practice_sessions_kcal_check') then
    alter table public.practice_sessions add constraint practice_sessions_kcal_check check (kcal is null or kcal between 1 and 3000);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.practice_sessions'::regclass and conname = 'practice_sessions_avg_hr_check') then
    alter table public.practice_sessions add constraint practice_sessions_avg_hr_check check (avg_hr is null or avg_hr between 40 and 220);
  end if;
end $$;
comment on column public.practice_sessions.kcal is 'Calories typed in by hand on a session logged without a tracker (1-3000). Private to its owner; on a post only when shared (migration 154).';
comment on column public.practice_sessions.avg_hr is 'Average heart rate typed in by hand on a session logged without a tracker (40-220 bpm). Private to its owner; on a post only when shared (migration 154).';

-- ------------------------------------------------------------ 2. on the post
-- put_session_with: migration 107's, word for word, but for the health numbers
-- of a session logged by hand (the block under "-- health numbers").
CREATE OR REPLACE FUNCTION public.put_session_with(sess jsonb, author uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_share := public.health_share_list(sess->'share');
  if not (v_out ? 'activityId') then
    -- A session logged by hand (154): only the calories and average heart
    -- rate typed into the author's own log, only those chosen on the post
    -- ("Share health data", any age, as a tracker's), and never what the
    -- phone wrote on the post. No log, no list, or nothing typed: none.
    v_out := v_out - 'share' - 'strain' - 'kcal' - 'avgHr' - 'maxHr';
    if v_ref is not null and v_share is not null and v_ps.activity_id is null then
      v_share := array(select k.n from unnest(v_share) as k(n) where k.n in ('hr', 'kcal'));
      if 'hr' = any (v_share) and v_ps.avg_hr is not null then v_out := v_out || jsonb_build_object('avgHr', v_ps.avg_hr); end if;
      if 'kcal' = any (v_share) and v_ps.kcal is not null then v_out := v_out || jsonb_build_object('kcal', v_ps.kcal); end if;
      if v_ps.avg_hr is not null or v_ps.kcal is not null then v_out := v_out || jsonb_build_object('share', to_jsonb(v_share)); end if;
    end if;
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
end $function$;

-- post_session_stats: migration 107's, word for word, but a post from your log
-- keeps its "share" list on the way to put_session_with (no - 'share' on two lines).
CREATE OR REPLACE FUNCTION public.post_session_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    new.session := public.put_session_with(new.session - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show' - 'with' - 'workout' - 'distanceM', new.author_id);
    return new;
  end if;
  select * into v_a from public.detected_activities where id::text = new.session->>'activityId' and user_id = new.author_id;
  if not found then
    new.session := public.put_session_with(new.session - 'activityId' - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show' - 'with' - 'workout' - 'distanceM', new.author_id);
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
end $function$;

-- ------------------------------------------------------------ 3. who may call
-- Server only, as before (107): the posts trigger runs them, nobody calls them.
revoke all on function public.put_session_with(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.post_session_stats() from public, anon, authenticated;

-- ------------------------------------------------------------ 4. last check
do $$
declare
  cols int;
  checks int;
begin
  select count(*) into cols from information_schema.columns
    where table_schema = 'public' and table_name = 'practice_sessions' and column_name in ('kcal', 'avg_hr');
  select count(*) into checks from pg_constraint
    where conrelid = 'public.practice_sessions'::regclass and conname in ('practice_sessions_kcal_check', 'practice_sessions_avg_hr_check');
  if cols <> 2 or checks <> 2 then
    raise exception 'Migration 154 stopped: the two columns or their limits are not there. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.posts'::regclass and tgname = 'fill_post_session_stats' and tgfoid = 'public.post_session_stats()'::regprocedure) then
    raise exception 'Migration 154 stopped: the posts trigger no longer runs post_session_stats. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 5. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The new columns and their limits (expect kcal smallint, avg_hr smallint, and the two checks):
-- select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'practice_sessions' and column_name in ('kcal', 'avg_hr') order by 1;
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.practice_sessions'::regclass and conname like 'practice_sessions_%_check' order by 1;
--
-- (b) The rules on your sessions are the same four as before (expect read, add, change, remove, each "user_id = auth.uid()"):
-- select polname, polcmd from pg_policy where polrelid = 'public.practice_sessions'::regclass order by 1;
--
-- (c) The two functions are this file's (expect 645dadf7… and d561fb9e…):
-- select proname, md5(prosrc) from pg_proc where pronamespace = 'public'::regnamespace
--   and proname in ('put_session_with', 'post_session_stats') order by 1;
