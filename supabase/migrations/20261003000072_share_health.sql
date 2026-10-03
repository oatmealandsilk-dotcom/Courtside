-- 72: "Share health data" on a tracker session's post, the same for everyone.
--
-- NOT APPLIED — needs the owner's OK. This file has not been run on the live
-- database. Until it runs, a post keeps today's rule (below, "Old phones").
--
-- The owner's decision (Oct 3): the composer has one "Share health data"
-- switch, and a "Choose" sheet with a tick for each number the tracker has:
-- heart rate (average and max), heart-rate zones, Strain (WHOOP only) and
-- calories. Any age, any account. On by default for people known to be
-- adults, off for everyone else, who can still switch it on.
--
-- What it does:
--
--   * A new post (or an edited one) may say which numbers to share, as a
--     list called "share": any of "hr", "zones", "strain", "kcal". Anything
--     else in the list is ignored. An empty list shares none of them.
--   * Allowed for any age (the owner's decision): known_adult is not asked
--     when the list is there.
--   * The numbers themselves are never the phone's word. They are read from
--     the author's own tracker row, the same private row as before (only the
--     author's own; a row that has gone after 30 days, or that is someone
--     else's, gives nothing, and the post's tracker stats come off as
--     before). Only the chosen ones go on the post: "avgHr" and "maxHr" for
--     heart rate, "zones" (migration 65's five numbers), "strain" (only from
--     WHOOP; a 0–21 score) and "kcal". The list, as the server read it, is
--     kept on the post's stats too, so later refreshes know what was chosen.
--   * While the tracker row is there, a refresh of the post (a log edit, a
--     tag answer, a renamed player) reads the chosen numbers from it again,
--     so a re-scored workout shows its new numbers (and a strap that turned
--     out to be barely on takes the heart rate and zones off). Once the row
--     has gone, the post keeps the numbers the server wrote, never more.
--   * Everything else is as migrations 62 and 65 left it: what the session
--     was and its day from the author's own log, names only once accepted,
--     no start time or device, never offered for CourtSide's Instagram, and
--     group posts the same as any other post.
--
-- Old phones (an app without the switch) send no list. For them nothing
-- changes: heart rate only when the post asks for it (sends a maxHr) and the
-- author is known to be an adult, zones beside it, never Strain or calories.
-- And a phone with the switch on a database without this file sends maxHr
-- with heart rate chosen, so an adult's heart rate still shows there.
--
-- How the post's stats are worked out: the posts trigger fill_post_session_stats
-- now runs a new function, post_session_stats (migration 64's version of
-- fill_post_session_stats, which asks known_adult, plus the list). The old
-- function fill_post_session_stats is left as it is, unused, so migration
-- 64 (not yet run) still recognises it and can run before or after this;
-- 64 rewriting that unused function changes nothing. put_session_with
-- (migration 65's, live) is replaced to add the numbers.
--
-- Checked against the live database on Oct 3 (migrations through 71 run;
-- 64 not yet): stops without changing anything if put_session_with or
-- fill_post_session_stats was changed since, or if the posts trigger runs
-- something else. After this has run, do not run 62 or 65 again (they would
-- put the older put_session_with back, without the list); if one ever is,
-- run this again.
--
-- Needs 58, 60, 62 and 65 (all live). Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
-- md5 of each function's body: as it is live (Oct 3), or as this file leaves it.
do $$
declare
  expected constant text[][] := array[
    -- name, live (Oct 3), as 72 leaves it
    ['put_session_with', 'fc74fda3439af054974aaaa22c504ed8', '6faff87c098ccc412732c47233c04fd5'],
    -- Not replaced, but copied into post_session_stats: 63's (live) or 64's.
    ['fill_post_session_stats', 'e8312c41b2f36aa72ffa714a1857ede6', '29ce26bf1b7ed4b7b6dfe37472dc8cfd']
  ];
  i int;
  now_is text;
  wrong text[] := '{}';
  v_fn text;
begin
  if to_regprocedure('public.known_adult(uuid)') is null or to_regprocedure('public.post_session_ref(jsonb, uuid)') is null
     or to_regprocedure('public.refresh_session_posts(uuid, uuid)') is null or to_regprocedure('public.session_with(uuid)') is null then
    raise exception 'Migration 72 stopped before changing anything: migrations 60 and 62 have to run first.';
  end if;
  if to_regprocedure('public.session_zones_ok(jsonb)') is null or to_regprocedure('public.session_day_text(text)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'detected_activities' and column_name = 'hr_zones') then
    raise exception 'Migration 72 stopped before changing anything: migration 65 has to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    select md5(p.prosrc) into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1];
    if now_is is null or now_is not in (expected[i][2], expected[i][3]) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  -- post_session_stats: not there yet, or exactly as this file leaves it.
  select md5(p.prosrc) into now_is from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'post_session_stats';
  if now_is is not null and now_is <> 'b1ce4a311a2558cd9a3542dc9b6bef89' then
    wrong := wrong || 'post_session_stats'::text;
  end if;
  -- The posts trigger runs migration 58's function (live), or this file's (a re-run).
  select t.tgfoid::regproc::text into v_fn from pg_trigger t
    where t.tgrelid = 'public.posts'::regclass and t.tgname = 'fill_post_session_stats' and not t.tgisinternal;
  if v_fn is null or v_fn not in ('fill_post_session_stats', 'post_session_stats') then
    wrong := wrong || 'the posts trigger fill_post_session_stats'::text;
  end if;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 72 stopped before changing anything: % changed since it was written. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ---------------------------------------------------------------- 1. helper
-- The numbers a post asks to share, in one order: any of hr, zones, strain
-- and kcal, each once. Null when there is no list at all (an older phone).
create or replace function public.health_share_list(j jsonb) returns text[]
language sql immutable set search_path = public as $$
  select case when jsonb_typeof(j) = 'array' then
    array(select k.n from unnest(array['hr', 'zones', 'strain', 'kcal']) with ordinality as k(n, o)
           where j @> jsonb_build_array(k.n) order by k.o)
  end
$$;

-- ------------------------------------------------- 2. what a post's stats carry
-- Migration 65's, plus the chosen numbers (section "health numbers"). The
-- rest is unchanged: the author's own log entry, what it says, the day, the
-- accepted players.
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

-- ------------------------------------------------ 3. a post's stats come in
-- Migration 64's fill_post_session_stats (which asks known_adult, never the
-- age itself), plus the list: a post that sends one gets it read by the
-- server (any age) and its numbers added by put_session_with; a post that
-- sends none keeps the old rule. Only the author's own tracker row is ever
-- read; none (gone, or someone else's) and the tracker stats come off.
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
    new.session := public.put_session_with(new.session - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show' - 'with' - 'share', new.author_id);
    return new;
  end if;
  select * into v_a from public.detected_activities where id::text = new.session->>'activityId' and user_id = new.author_id;
  if not found then
    new.session := public.put_session_with(new.session - 'activityId' - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show' - 'with' - 'share', new.author_id);
    return new;
  end if;
  v_src := case v_a.source when 'apple-health' then case when v_a.device ~ '^Watch[0-9]+,[0-9]+$' then 'apple-watch' else 'apple-health' end else v_a.source end;
  v_s := jsonb_build_object('focus', 'Tennis', 'minutes', v_a.minutes, 'drills', '[]'::jsonb, 'activityId', v_a.id, 'source', v_src);
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

-- ------------------------------------------------------------ 4. who may call
-- Server only.
revoke all on function public.health_share_list(jsonb) from public, anon, authenticated;
revoke all on function public.put_session_with(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.post_session_stats() from public, anon, authenticated;

-- ------------------------------------------------------------- 5. last check
-- Nothing here reads anyone's age except through known_adult (so migration
-- 64 finds nothing to object to, before or after).
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosrc ~* 'age_group'
      and p.proname in ('health_share_list', 'put_session_with', 'post_session_stats');
  if bad is not null then
    raise exception 'Migration 72 stopped: % read the age directly. Nothing was changed.', bad;
  end if;
end $$;

commit;

-- ------------------------------------------------------- 6. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The posts trigger runs the new function (expect post_session_stats):
-- select tgfoid::regproc from pg_trigger where tgrelid = 'public.posts'::regclass and tgname = 'fill_post_session_stats';
--
-- (b) Nobody can call the helpers from the app (expect three rows, all false):
-- select p.proname, has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
--   where p.pronamespace = 'public'::regnamespace and p.proname in ('health_share_list', 'put_session_with', 'post_session_stats') order by 1;
--
-- (c) No function name exists twice (expect no rows):
-- select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace group by 1 having count(*) > 1;
