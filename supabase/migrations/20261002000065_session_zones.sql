-- 65: heart-rate zones, and what a session was, on a session's post.
--
-- NOT APPLIED — needs the owner's OK. This file has not been run on the live
-- database. It adds one private column, changes how a post's session stats
-- are filled in, and keeps posts in step with the log they came from.
-- Until it runs, the app shows a tracker's post with its time, heart rate and
-- source only ("TENNIS", no day, no zone bar), as it does today.
--
-- What it does (the owner's answers, Oct 2):
--
--   * detected_activities.hr_zones: for a tennis session from WHOOP, how many
--     minutes were spent in each of five heart-rate zones, easiest first
--     [zone 1, zone 2, zone 3, zone 4, zone 5]. WHOOP's own zone 0 (below
--     zone 1) is counted in zone 1. Private like the rest of the row: only
--     its owner can read it, nobody can write it from the app. It is kept
--     only with heart rate that is worth showing (the strap was on for at
--     least half the session), and only when the five numbers make sense
--     (none below 0 or over 600, together no more than the session's length
--     plus 10). It goes when the row goes (30 days, or disconnecting WHOOP).
--     When WHOOP scores the same workout again and the strap turns out to
--     have been on for less than half of it, the heart rate and zones come
--     off the row (before this, the earlier heart rate was kept).
--     Apple Health gives no zone times and CourtSide does not make them up,
--     so a session from the phone never has any: report_activity drops them.
--   * A post's stats get "zones" (the same five numbers) only when they show
--     heart rate, which is only when the author switched it on for that post
--     and is known to be an adult (migration 58's rule, through known_adult).
--     A phone can never put its own zones on a post: they are always taken
--     from the private row, or, once that row has gone after 30 days, kept
--     as the server wrote them.
--   * What the session was, from the author's own log: a tracker's post that
--     was logged now says what the log says ("kind": practice, match, drills
--     or fitness; "won" for a match with a result; "focus" "Match · Won"),
--     and carries the log's "sessionId" so it can still be found after the
--     tracker row goes. Its time on court stays the tracker's. A post from a
--     session logged by hand says what its log says (kind, result, time),
--     with or without names on it. Nothing is taken from the phone's word
--     when the log is there.
--   * "day" (YYYY-MM-DD, the date only): the log's day, or for a tracker's
--     session not logged, the day it started where it was played (when the
--     tracker said where). Never the start time.
--   * Posts follow their log: logging a tracker's session after posting it,
--     changing a log's kind, result, day or length, or deleting the log,
--     updates every post of the author's that carries it, at once. (Before
--     this, only a log with accepted names did.) Deleting the log takes what
--     it said off the post again; the post goes back to "Tennis".
--   * Everything else is as migrations 58 and 62 left it: no start time,
--     calories, Strain or device on any post, never offered for CourtSide's
--     Instagram, names only once accepted.
--
-- Old posts are not rewritten when this runs. A post made before it picks
-- the new fields up the next time it is refreshed (a log edit, a tag answer,
-- a renamed player).
--
-- Works with or without migration 64 (who is an adult moves off the public
-- profile), run before or after it: it never reads the age itself, only
-- known_adult(), which 60 added and 64 keeps, and it does not change any of
-- the functions 64 checks before it runs. Replaces put_session_with (62),
-- record_activity and report_activity (58), as they are live (checked
-- against the live database on Oct 2), and stops without changing anything
-- if any of them, or fill_post_session_stats (which it relies on), was
-- changed since. After this has run, do not run 58 or 62 again (they would
-- put the older versions back); if one ever is, run this again.
--
-- The whoop function sends the zone times once it is deployed again (either
-- order works: until then nothing sends them, and a function deployed first
-- sends a number this database ignores).
--
-- Needs 39, 58, 60, 62 (all live). Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
-- md5 of each function's body: as it is live (Oct 2), or as this file leaves it.
do $$
declare
  expected constant text[][] := array[
    -- name, live (Oct 2), as 65 leaves it
    ['put_session_with', '170963d37883ee996632a575e92b6f92', 'fc74fda3439af054974aaaa22c504ed8'],
    ['record_activity', 'e33c62eb9c3517677017873cdd430600', 'fe7103ee3898a8fc7f04ae01b9e1f6e0'],
    ['report_activity', 'a9d9ad70a9c084c6b59f35027a9ea226', '1da946533886a6c87cf3a2812a383140'],
    -- Not replaced, but relied on: 63's (live) or 64's.
    ['fill_post_session_stats', 'e8312c41b2f36aa72ffa714a1857ede6', '29ce26bf1b7ed4b7b6dfe37472dc8cfd']
  ];
  i int;
  now_is text;
  wrong text[] := '{}';
begin
  if to_regprocedure('public.known_adult(uuid)') is null or to_regprocedure('public.post_session_ref(jsonb, uuid)') is null
     or to_regprocedure('public.refresh_session_posts(uuid, uuid)') is null then
    raise exception 'Migration 65 stopped before changing anything: migrations 60 and 62 have to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    select md5(p.prosrc) into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1];
    if now_is is null or now_is not in (expected[i][2], expected[i][3]) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 65 stopped before changing anything: % changed since it was written. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ------------------------------------------------------- 1. the private column
-- Minutes in zones 1 to 5, easiest first. Owner-only, like the whole row
-- (migration 58's rule); the app has no write rights on this table.
alter table public.detected_activities add column if not exists hr_zones smallint[]
  check (hr_zones is null or (cardinality(hr_zones) = 5 and array_ndims(hr_zones) = 1 and array_position(hr_zones, null) is null
                              and 0 <= all (hr_zones) and 600 >= all (hr_zones)));

-- ---------------------------------------------------------------- 2. helpers
-- Five zone times from a payload, as whole minutes, or null when they are
-- not five plain numbers from 0 to 600 that together fit the session.
create or replace function public.activity_zones(z jsonb, mins int) returns smallint[]
language plpgsql immutable as $$
declare
  i int;
  t text;
  v int;
  total int := 0;
  out_z smallint[] := '{}';
begin
  if z is null or mins is null or jsonb_typeof(z) <> 'array' then return null; end if;
  if jsonb_array_length(z) <> 5 then return null; end if;
  for i in 0 .. 4 loop
    if jsonb_typeof(z -> i) <> 'number' then return null; end if;
    t := z ->> i;
    if t !~ '^[0-9]+([.][0-9]+)?$' then return null; end if;
    if t::numeric > 600 then return null; end if;
    v := round(t::numeric)::int;
    out_z := out_z || v::smallint;
    total := total + v;
  end loop;
  if total < 1 or total > mins + 10 then return null; end if;
  return out_z;
end $$;

-- Zones already on a post, written by the server: five whole numbers from 0
-- to 600, not all 0.
create or replace function public.session_zones_ok(z jsonb) returns boolean
language plpgsql immutable as $$
declare
  i int;
  t text;
  total int := 0;
begin
  if z is null or jsonb_typeof(z) <> 'array' then return false; end if;
  if jsonb_array_length(z) <> 5 then return false; end if;
  for i in 0 .. 4 loop
    if jsonb_typeof(z -> i) <> 'number' then return false; end if;
    t := z ->> i;
    if t !~ '^[0-9]{1,3}$' or t::int > 600 then return false; end if;
    total := total + t::int;
  end loop;
  return total >= 1;
end $$;

-- A calendar day as YYYY-MM-DD, or null when it is not a real one.
create or replace function public.session_day_text(v text) returns text
language plpgsql immutable as $$
begin
  if v is null or v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
  return to_char(v::date, 'YYYY-MM-DD');
exception when others then
  return null;
end $$;

-- ------------------------------------------- 3. a tracker's session comes in
-- Migration 58's, plus the zone times (WHOOP only: report_activity drops
-- them), kept under the same rule as heart rate.
create or replace function public.record_activity(u uuid, src text, ext text, p jsonb, quiet boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t0 timestamptz;
  t1 timestamptz;
  mins int;
  pct int;
  hr_ok boolean;
  v_strain numeric;
  v_id uuid;
  v_note text;
  v_status text;
begin
  if u is null or src not in ('whoop', 'apple-health', 'health-connect') or coalesce(char_length(ext), 0) not between 1 and 100
     or coalesce(p->>'sport', 'tennis') <> 'tennis' or not public.tennis_allowed(u, src) then
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

  insert into public.detected_activities as d (user_id, source, external_id, started_at, ended_at, tz_offset_min, minutes, avg_hr, max_hr, kcal, strain, score_state, device, hr_zones)
  values (
    u, src, ext, t0, t1,
    public.activity_int(p->>'tz_offset_min', -840, 840),
    mins,
    case when hr_ok then public.activity_int(p->>'avg_hr', 30, 250) end,
    case when hr_ok then public.activity_int(p->>'max_hr', 30, 250) end,
    public.activity_int(p->>'kcal', 0, 10000),
    v_strain,
    case when p->>'score_state' in ('SCORED', 'PENDING_SCORE', 'UNSCORABLE') then p->>'score_state' end,
    nullif(left(btrim(p->>'device'), 60), ''),
    case when hr_ok then public.activity_zones(p->'hr_zones', mins) end
  )
  on conflict (user_id, source, external_id) do update set
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
    -- WHOOP took it back and then sent it again: it is news once more.
    status = case when d.status = 'withdrawn' then 'new' else d.status end,
    updated_at = now()
  returning d.id into v_id;

  v_note := public.note_detected_activity(v_id, quiet);
  select status into v_status from public.detected_activities where id = v_id;
  perform public.expire_activities(u);
  return jsonb_build_object('id', v_id, 'status', v_status, 'note', v_note);
end $$;

-- The phone's way in for Apple Health (migration 58's), as the signed-in
-- player. Apple gives no zone times, so none are taken from a phone.
create or replace function public.report_activity(ext text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_r jsonb;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  -- A day's worth is plenty; this stops a runaway phone, not a player.
  if (select count(*) from public.detected_activities where user_id = v_me and created_at > now() - interval '1 day') >= 40 then return null; end if;
  -- Only WHOOP has Strain, a scoring state and zone times.
  v_r := public.record_activity(v_me, 'apple-health', ext, coalesce(p, '{}'::jsonb) - 'strain' - 'score_state' - 'percent_recorded' - 'hr_zones', true);
  if v_r is null then return null; end if;
  return jsonb_build_object('id', v_r->'id', 'status', v_r->'status', 'notify', (v_r->>'note') = 'filed');
end $$;

-- ----------------------------------------------- 4. what a post's stats carry
-- Called by fill_post_session_stats (58, 62, 64) on every post that carries
-- session stats, after it has rebuilt a tracker's numbers from the private
-- row, and again whenever the post is refreshed. Works out, never taking the
-- phone's word for them:
--   * the author's own log entry the stats come from: for a tracker's stats,
--     while the tracker row is there, only the entry it was logged as;
--     afterwards the sessionId the server wrote; for a session logged by
--     hand, its sessionId;
--   * from that entry: kind, won (a match with a result), focus, sessionId,
--     day, and for a session logged by hand its length. A tracker's length
--     stays the tracker's. A tracker's stats with no entry say only "Tennis";
--   * day: the entry's, else a tracker's local start date (when it said
--     where it was played), else what was there (the server's own, on a
--     post whose tracker row has gone; the author's own word on stats from
--     neither);
--   * zones: only beside heart rate, and only for an author known to be an
--     adult: from the private row, or, once it has gone, as they were;
--   * the accepted players (migration 62).
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
begin
  if sess is null or jsonb_typeof(sess) <> 'object' then return sess; end if;
  v_out := sess - 'with' - 'zones' - 'day';
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
    v_out := (v_out - 'won' - 'kind' - 'focus')
      || jsonb_build_object(
           'sessionId', v_ref::text,
           'kind', v_ps.kind,
           'focus', case when v_ps.kind = 'match' and v_ps.won is not null then 'Match · ' || case when v_ps.won then 'Won' else 'Lost' end else initcap(v_ps.kind) end)
      || case when v_ps.kind = 'match' and v_ps.won is not null then jsonb_build_object('won', v_ps.won) else '{}'::jsonb end
      || case when v_out ? 'activityId' then '{}'::jsonb else jsonb_build_object('minutes', v_ps.minutes) end;
  elsif v_out ? 'activityId' then
    v_out := (v_out - 'won' - 'kind' - 'sessionId') || jsonb_build_object('focus', 'Tennis');
  end if;

  v_day := case
    when v_ref is not null then to_char(v_ps.day, 'YYYY-MM-DD')
    when v_a.id is not null then
      case when v_a.tz_offset_min is not null
        then to_char((v_a.started_at at time zone 'UTC') + make_interval(mins => v_a.tz_offset_min), 'YYYY-MM-DD') end
    else public.session_day_text(sess->>'day') end;
  if v_day is not null then v_out := v_out || jsonb_build_object('day', v_day); end if;

  if v_out ? 'activityId' and (v_out ? 'maxHr' or v_out ? 'avgHr') then
    v_hr := public.known_adult(author);
    if v_hr and v_a.id is not null then
      if v_a.hr_zones is not null then v_out := v_out || jsonb_build_object('zones', to_jsonb(v_a.hr_zones)); end if;
    elsif v_hr and public.session_zones_ok(sess->'zones') then
      v_out := v_out || jsonb_build_object('zones', sess->'zones');
    end if;
  end if;

  if v_ref is not null then
    v_with := public.session_with(v_ref);
    if v_with is not null then v_out := v_out || jsonb_build_object('with', v_with); end if;
  end if;
  return v_out;
end $$;

-- --------------------------------------------- 5. posts follow their log
-- A log entry saved (a tracker's session logged after it was posted),
-- changed (its kind, result, day or length) or deleted: every post of the
-- author's that carries it is worked out again (migration 62's refresh).
create or replace function public.session_posts_follow_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_session_posts(old.id, old.user_id);
    return null;
  end if;
  if tg_op = 'UPDATE' and (old.kind, old.won, old.day, old.minutes) is not distinct from (new.kind, new.won, new.day, new.minutes) then
    return null;
  end if;
  perform public.refresh_session_posts(new.id, new.user_id);
  return null;
end $$;
drop trigger if exists session_posts_follow_log on public.practice_sessions;
create trigger session_posts_follow_log after insert or update of kind, won, day, minutes or delete on public.practice_sessions
  for each row execute function public.session_posts_follow_log();

-- ------------------------------------------------------------ 6. who may call
-- Server only.
revoke all on function public.activity_zones(jsonb, int) from public, anon, authenticated;
revoke all on function public.session_zones_ok(jsonb) from public, anon, authenticated;
revoke all on function public.session_day_text(text) from public, anon, authenticated;
revoke all on function public.session_posts_follow_log() from public, anon, authenticated;
revoke all on function public.put_session_with(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.record_activity(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.record_activity(uuid, text, text, jsonb, boolean) to service_role;
-- Signed-in players.
revoke all on function public.report_activity(text, jsonb) from public, anon;
grant execute on function public.report_activity(text, jsonb) to authenticated;

-- ------------------------------------------------------------- 7. last check
-- Nothing here reads anyone's age except through known_adult (so migration
-- 64 finds nothing to object to, before or after).
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosrc ~* 'age_group'
      and p.proname in ('activity_zones', 'session_zones_ok', 'session_day_text', 'record_activity', 'report_activity', 'put_session_with', 'session_posts_follow_log');
  if bad is not null then
    raise exception 'Migration 65 stopped: % read the age directly. Nothing was changed.', bad;
  end if;
end $$;

commit;

-- ------------------------------------------------------- 8. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The new column (expect hr_zones | ARRAY):
-- select column_name, data_type from information_schema.columns where table_name = 'detected_activities' and column_name = 'hr_zones';
--
-- (b) Who may call what (expect report_activity true; activity_zones, put_session_with, record_activity, session_day_text, session_zones_ok false):
-- select p.proname, has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
--   where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('report_activity', 'record_activity', 'put_session_with', 'activity_zones', 'session_zones_ok', 'session_day_text') order by 1;
--
-- (c) The trigger that keeps posts in step with their log (expect session_posts_follow_log):
-- select tgname from pg_trigger where tgrelid = 'public.practice_sessions'::regclass and tgname = 'session_posts_follow_log';
--
-- (d) No function name exists twice (expect no rows):
-- select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace group by 1 having count(*) > 1;
