-- CourtSide · migration 158, score_tiebreaks (Oct 10): a tiebreak's points
-- kept beside a session's score.
--
-- NOT APPLIED — the lead applies it. Run it in the Supabase SQL editor as one
-- piece, BEFORE the app that sends tiebreak points goes out (a push to main
-- or an update to phones). It is all-or-nothing: if the check below fails it
-- stops, and nothing at all changes. Safe to run more than once. Until it
-- runs, the new app still saves every score, only without the points.
--
-- William (owner), Oct 10, on the Score box: "You should be able to use ()
-- in caption for match score", then "Or if you play a tiebreaker in liu of
-- 3rd set". So "7-6(5) 6-4" keeps its (5): the points the set's loser won in
-- its tiebreak, the way tennis writes it. From the other side of the net the
-- same set reads "6-7(5)": the loser's points are the same from both sides.
--
-- In plain words, what changes:
--
--   1. Your sessions list (practice_sessions) gets one more optional column,
--      set_tiebreaks: one entry per set, in the same order as the sets, each
--      either empty (null) or the tiebreak loser's points, a whole number
--      from 0 to 50, and only on a set whose games differ by exactly one
--      (7-6, 6-7, or 4-3 in a short set). Anything else is refused with the
--      same 'bad_score' as a bad score. No points on any set is kept as
--      empty. It is private, like the rest of your log: the existing rule
--      (only you can read or change your own sessions) covers it, unchanged.
--   2. practice_sessions.sets itself does NOT change at all: still two
--      numbers per set. Phones on older builds (the App Store review build
--      included) read each set as exactly two numbers and would drop a whole
--      score with a third in it, so the points live in their own column and
--      those phones simply never see them. A match tiebreak played instead
--      of a deciding set ("6-4 3-6 (10-7)") is still a set, [10,7], exactly
--      as before: nothing here is needed for it.
--   3. An older app changing a score's games cannot see the points under
--      them: points left behind that no longer fit (say set one is now 6-4)
--      are taken off rather than refusing the new games. Points sent that
--      don't fit are refused.
--   4. A copy made when you accept being tagged in a match (migration 62's
--      "Add to my sessions") takes the tagger's points with the score, as
--      they are (the score is flipped for an opponent; the points never need
--      to be).
--   5. Posts: a post carrying a session from your log shows the log's points
--      too, as "tiebreaks" beside "sets" in its stats, always the server's
--      word, never the phone's, and taken off when there are none. Points
--      added or changed on their own refresh the posts the same way a
--      changed score does.
--   6. Who won never changes with points (the games decide), so points added
--      or changed on their own do NOT ask an accepted player to confirm
--      again (a changed score still does, as migration 91 says).
--   7. A tagged player reads the points with the score (my_session_tags gets
--      one more column, set_tiebreaks), and a head-to-head's last match
--      carries them as "tiebreaks". Older apps ignore both.
--
-- What changes, by name:
--   practice_sessions: new column set_tiebreaks jsonb.
--   set_tiebreaks_ok(sets, points): new, plain arithmetic, like
--     match_sets_ok (migration 91), and left callable like it.
--   practice_session_score (migration 136's, word for word apart from the
--     lines marked 158): checks and clears the points, copies them on Accept.
--   session_tiebreaks_changed: new trigger function and trigger, refreshing
--     the posts when only the points changed (session_score_changed,
--     migration 136's, is left alone: it already refreshes them when the
--     games or the result change).
--   post_session_score (migration 136's, word for word apart from the lines
--     marked 158): puts the log's points on the post, or takes them off.
--   my_session_tags (migration 91's, word for word apart from the lines
--     marked 158): one more column. A function's columns can only change by
--     dropping and making it again, as migration 91 did; its grants are put
--     back below exactly as they were.
--   head_to_head (migration 91's, word for word apart from the lines marked
--     158): the last match carries its points.
--
-- Stops without changing anything if any of the four functions it replaces
-- has changed since the versions this file was written against (136 and 91).
-- Needs 62, 91 and 136 (all live).

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  expected text[][] := array[
    -- name, the version this file was written against, this file's own (run again)
    array['practice_session_score', '4a2edd3566ee361cd0fb357b9be5efd0', 'ac0707aba13633dacd7cb208b2d5d45e'],
    array['post_session_score', 'db9fbd96ba76db482bec5a7393c85905', '812fc945d8966b8f79c92d57b7610855'],
    array['my_session_tags', '1af928b123e0d9e14718908d4c4f9090', 'd1b7cc0ec855fe7cd83447b9fce4b17c'],
    array['head_to_head', '44ebf954ed81f0be116a4f6d581f31a7', 'd4e4835fab55ce68a2173c7c4102b500']
  ];
  i int;
  now_is text;
begin
  if to_regclass('public.session_tags') is null
     or to_regprocedure('public.match_sets_ok(jsonb)') is null
     or to_regprocedure('public.flip_sets(jsonb)') is null
     or to_regprocedure('public.sets_winner(jsonb)') is null
     or to_regprocedure('public.refresh_session_posts(uuid, uuid)') is null
     or to_regprocedure('public.is_blocked_between(uuid, uuid)') is null
     or to_regprocedure('public.practice_session_score()') is null
     or to_regprocedure('public.session_score_changed()') is null
     or to_regprocedure('public.post_session_score()') is null
     or to_regprocedure('public.my_session_tags()') is null
     or to_regprocedure('public.head_to_head(uuid)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'practice_sessions' and column_name = 'sets') then
    raise exception 'Migration 158 (score_tiebreaks) stopped before changing anything: migrations 62, 91 and 136 have to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    select md5(p.prosrc) into now_is from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1];
    if now_is is distinct from expected[i][2] and now_is is distinct from expected[i][3] then
      raise exception 'Migration 158 (score_tiebreaks) stopped before changing anything: % changed since the version this file was written against. This file must be brought up to date with that change first.', expected[i][1];
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------ 1. the column
alter table public.practice_sessions add column if not exists set_tiebreaks jsonb;

-- ------------------------------------------------------------------ 2. the check
-- Whether `points` fits the score `s`: none (null) always does; otherwise a
-- list as long as the sets, each entry null or a whole number 0 to 50, a
-- number only on a set whose games differ by exactly one. False for a score
-- that is not a good one (match_sets_ok). Step by step (plpgsql), so nothing
-- is ever cast before it is known to be a number.
create or replace function public.set_tiebreaks_ok(s jsonb, points jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  e jsonb;
  o bigint;
  g jsonb;
begin
  if points is null or points = 'null'::jsonb then return true; end if;
  if not public.match_sets_ok(s) then return false; end if;
  if jsonb_typeof(points) <> 'array' or jsonb_array_length(points) <> jsonb_array_length(s) then return false; end if;
  for e, o in select x, n from jsonb_array_elements(points) with ordinality as t(x, n) loop
    continue when jsonb_typeof(e) = 'null';
    if jsonb_typeof(e) <> 'number' then return false; end if;
    if (e #>> '{}') !~ '^[0-9]{1,2}$' or (e #>> '{}')::int > 50 then return false; end if;
    g := s -> (o::int - 1);
    if abs((g->>0)::int - (g->>1)::int) <> 1 then return false; end if;
  end loop;
  return true;
end $$;

-- ------------------------------------------------------------------ 3. a session's score
-- Migration 136's, with the points checked beside the sets, cleared with
-- them, and copied with them on Accept.
create or replace function public.practice_session_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_sets jsonb;
  v_points jsonb;
  v_won boolean;
begin
  -- A workout (or anything that is not tennis) has no score.
  if new.kind is null or new.kind not in ('practice', 'match', 'drills') then
    new.sets := null;
    new.set_tiebreaks := null; -- 158
    return new;
  end if;
  if new.kind = 'match' and tg_op = 'INSERT' and new.sets is null and new.from_session_id is not null then
    select t.role, s.sets, s.set_tiebreaks into v_role, v_sets, v_points
      from public.session_tags t
      join public.practice_sessions s on s.id = t.session_id and s.user_id = t.tagger_id
     where t.session_id = new.from_session_id and t.tagged_id = new.user_id
       and t.status <> 'removed' and not t.tagger_dropped and s.kind = 'match'
     limit 1;
    if v_sets is not null then
      -- A doubles partner was on the logger's side; an opponent sees it the other way round.
      new.sets := case when v_role = 'partner' then v_sets else public.flip_sets(v_sets) end;
      -- 158: the tiebreak points as they are, from either side: they are the tiebreak loser's.
      new.set_tiebreaks := v_points;
    end if;
  end if;
  if new.sets is null or new.sets = 'null'::jsonb then
    new.sets := null;
    new.set_tiebreaks := null; -- 158
    return new;
  end if;
  if not public.match_sets_ok(new.sets) then raise exception 'bad_score'; end if;
  -- 158: the tiebreak points beside the sets.
  if new.set_tiebreaks = 'null'::jsonb then new.set_tiebreaks := null; end if;
  if new.set_tiebreaks is not null and not public.set_tiebreaks_ok(new.sets, new.set_tiebreaks) then
    -- Points sent that don't fit are refused. Points this change did not touch, left behind
    -- when an older app (which cannot see them) changed the games under them, are taken off.
    if tg_op <> 'UPDATE' then raise exception 'bad_score'; end if;
    if new.set_tiebreaks is distinct from old.set_tiebreaks then raise exception 'bad_score'; end if;
    new.set_tiebreaks := null;
  end if;
  -- 158: no points on any set is kept as none at all.
  if new.set_tiebreaks is not null
     and not exists (select 1 from jsonb_array_elements(new.set_tiebreaks) x where jsonb_typeof(x) <> 'null') then
    new.set_tiebreaks := null;
  end if;
  -- Only a match has a result: there, the winner follows the sets.
  if new.kind = 'match' then
    v_won := public.sets_winner(new.sets);
    if v_won is not null then new.won := v_won; end if;
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------ 4. points changed on their own
-- Every post carrying the session shows the new points. Nobody who accepted
-- is asked again: the games and the result they said yes to are the same.
-- (When the games or the result change too, migration 136's
-- session_score_changed does both, and this one stays out of the way.)
create or replace function public.session_tiebreaks_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_session_posts(new.id, new.user_id);
  return null;
end $$;
drop trigger if exists session_tiebreaks_changed on public.practice_sessions;
create trigger session_tiebreaks_changed after update of set_tiebreaks on public.practice_sessions
  for each row when (old.set_tiebreaks is distinct from new.set_tiebreaks and old.sets is not distinct from new.sets and old.won is not distinct from new.won)
  execute function public.session_tiebreaks_changed();

-- ------------------------------------------------------------------ 5. posts show the log's points
-- Migration 136's, putting the log's points on the post as "tiebreaks"
-- beside "sets", or taking them off. Whatever a phone sent never stays.
create or replace function public.post_session_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_sets jsonb;
  v_points jsonb; -- 158
begin
  if new.session is null or jsonb_typeof(new.session) <> 'object' then return new; end if;
  if new.session->>'sessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select s.sets, s.set_tiebreaks into v_sets, v_points from public.practice_sessions s
     where s.id = lower(new.session->>'sessionId')::uuid and s.user_id = new.author_id and s.kind in ('practice', 'match', 'drills');
  end if;
  if v_sets is null then
    if new.session ? 'sets' then new.session := new.session - 'sets'; end if;
  elsif (new.session->'sets') is distinct from v_sets then
    new.session := new.session || jsonb_build_object('sets', v_sets);
  end if;
  -- 158: the points the same way, only beside a score.
  if v_sets is null or v_points is null then
    if new.session ? 'tiebreaks' then new.session := new.session - 'tiebreaks'; end if;
  elsif (new.session->'tiebreaks') is distinct from v_points then
    new.session := new.session || jsonb_build_object('tiebreaks', v_points);
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------ 6. what a tagged player reads
-- Migration 91's my_session_tags, plus the score's points: the same from
-- either side of the net, shown whenever the score is. Everything else
-- unchanged.
drop function if exists public.my_session_tags();
create function public.my_session_tags()
returns table (
  id uuid, session_id uuid, tagger_id uuid, tagged_id uuid, role text, status text, dropped boolean,
  mirrored_session_id uuid, created_at timestamptz, responded_at timestamptz,
  kind text, day date, minutes int, won boolean, sets jsonb, set_tiebreaks jsonb
) language sql stable security definer set search_path = public as $$
  select t.id, t.session_id, t.tagger_id, t.tagged_id, t.role, t.status, t.tagger_dropped,
         case when t.tagged_id = auth.uid() then t.mirrored_session_id end,
         t.created_at, t.responded_at,
         s.kind, s.day, s.minutes,
         case when t.tagger_id = auth.uid() then s.won
              when s.kind = 'match' and s.won is not null then case when t.role = 'partner' then s.won else not s.won end end,
         case when s.kind <> 'match' or s.sets is null then null
              when t.tagger_id = auth.uid() or t.role = 'partner' then s.sets
              else public.flip_sets(s.sets) end,
         -- 158: the score's tiebreak points, as they are.
         case when s.kind <> 'match' or s.sets is null then null else s.set_tiebreaks end
  from public.session_tags t
  join public.practice_sessions s on s.id = t.session_id
  where auth.uid() is not null and (t.tagger_id = auth.uid() or t.tagged_id = auth.uid())
  order by t.created_at desc, t.id
$$;

-- ------------------------------------------------------------------ 7. head-to-head
-- Migration 91's, with the last match's points as "tiebreaks" (when it has
-- any). Which matches count, and who won them, are exactly as before: the
-- games decide.
create or replace function public.head_to_head(other uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_wins int;
  v_losses int;
  v_last jsonb;
begin
  if me is null or other is null or other = me then return null; end if;
  if public.is_blocked_between(me, other) then return null; end if;
  with played as (
    -- Logged by me, them across the net and confirmed.
    select s.id, s.day, s.created_at, s.won, s.sets, s.set_tiebreaks, true as by_me
      from public.practice_sessions s
      join public.session_tags t on t.session_id = s.id and t.tagger_id = s.user_id
     where s.user_id = me and t.tagged_id = other
       and t.role = 'opponent' and t.status = 'accepted' and not t.tagger_dropped
       and s.kind = 'match' and s.from_session_id is null and s.sets is not null and s.won is not null
    union all
    -- Logged by them, me across the net and confirmed: my side is the other side (158: the points are the same).
    select s.id, s.day, s.created_at, not s.won, public.flip_sets(s.sets), s.set_tiebreaks, false
      from public.practice_sessions s
      join public.session_tags t on t.session_id = s.id and t.tagger_id = s.user_id
     where s.user_id = other and t.tagged_id = me
       and t.role = 'opponent' and t.status = 'accepted' and not t.tagger_dropped
       and s.kind = 'match' and s.from_session_id is null and s.sets is not null and s.won is not null
  ), numbered as (
    -- Each side numbers its own logs of one day and score: my first and
    -- their first are the same match, my second and their second, and so on.
    select p.*, row_number() over (partition by p.by_me, p.day, p.sets order by p.created_at, p.id) as n
      from played p
  ), once as (
    -- The same match logged by both of us (same day, same score) counts
    -- once; two matches on one day with the same score still count twice
    -- (Oct 5, review: a plain "distinct on day and score" counted them once).
    select distinct on (day, sets, n) id, day, created_at, won, sets, set_tiebreaks
      from numbered
     order by day, sets, n, by_me desc, created_at
  )
  select count(*) filter (where won), count(*) filter (where not won),
         (select jsonb_build_object('sessionId', o.id, 'day', to_char(o.day, 'YYYY-MM-DD'), 'won', o.won, 'sets', o.sets)
                 -- 158: its tiebreak points, when it has any.
                 || case when o.set_tiebreaks is not null then jsonb_build_object('tiebreaks', o.set_tiebreaks) else '{}'::jsonb end
            from once o order by o.day desc, o.created_at desc limit 1)
    into v_wins, v_losses, v_last
    from once;
  return jsonb_build_object('wins', coalesce(v_wins, 0), 'losses', coalesce(v_losses, 0))
    || case when v_last is not null then jsonb_build_object('last', v_last) else '{}'::jsonb end;
end $$;

-- ------------------------------------------------------------------ 8. who may call what
-- set_tiebreaks_ok is plain arithmetic on the numbers it is given, with
-- nothing private in it: left callable, as match_sets_ok is (migration 91).
-- The rest exactly as migrations 91 and 136 left them. Server only:
revoke all on function public.practice_session_score() from public, anon, authenticated;
revoke all on function public.session_tiebreaks_changed() from public, anon, authenticated;
revoke all on function public.post_session_score() from public, anon, authenticated;
-- Signed-in players:
revoke all on function public.my_session_tags() from public, anon;
grant execute on function public.my_session_tags() to authenticated;
revoke all on function public.head_to_head(uuid) from public, anon;
grant execute on function public.head_to_head(uuid) to authenticated;

commit;

-- ------------------------------------------------------------------ 9. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The column is there (expect set_tiebreaks, jsonb):
-- select column_name, data_type from information_schema.columns where table_name = 'practice_sessions' and column_name = 'set_tiebreaks';
--
-- (b) The rules (expect true, true, true, false, false, false, false):
-- select public.set_tiebreaks_ok('[[7,6],[6,4]]', null), public.set_tiebreaks_ok('[[7,6],[6,4]]', '[5,null]'), public.set_tiebreaks_ok('[[6,7],[4,3]]', '[10,2]'),
--        public.set_tiebreaks_ok('[[6,4]]', '[5]'), public.set_tiebreaks_ok('[[7,6]]', '[51]'), public.set_tiebreaks_ok('[[7,6],[6,4]]', '[5]'), public.set_tiebreaks_ok('[[7,6]]', '["5"]');
--
-- (c) The new trigger is there (expect one row, session_tiebreaks_changed):
-- select tgname from pg_trigger where tgrelid = 'public.practice_sessions'::regclass and not tgisinternal and tgname = 'session_tiebreaks_changed';
--
-- (d) Who may call what (expect head_to_head true, my_session_tags true, post_session_score false, practice_session_score false, session_tiebreaks_changed false):
-- select p.proname, has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
--   where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('head_to_head', 'my_session_tags', 'post_session_score', 'practice_session_score', 'session_tiebreaks_changed') order by 1;
--
-- (e) No function name exists twice (expect no rows):
-- select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace group by 1 having count(*) > 1;
--
-- ------------------------------------------------------------------ 10. to undo
-- Run migration 136's sections 1 and 3 and migration 91's sections 5 and 6
-- again (the four functions as they were), then:
--   drop trigger if exists session_tiebreaks_changed on public.practice_sessions;
--   drop function if exists public.session_tiebreaks_changed();
-- The column and set_tiebreaks_ok can stay: nothing else reads them. Points
-- already saved stay in the column, unseen.
