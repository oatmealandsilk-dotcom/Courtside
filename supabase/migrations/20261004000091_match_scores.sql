-- 91: the score of a match, head-to-head on a profile, and "Rematch?".
--
-- NOT APPLIED — needs the owner's OK. This file has not been run on the live
-- database. Until it runs, the app logs matches exactly as before (won or
-- lost, no score): a score typed on a phone with a newer app is dropped on
-- save rather than refusing the session, the profile shows no head-to-head,
-- and "Rematch?" still works (it is the ordinary hit invite, migration 76,
-- with nothing new on the server).
--
-- What it does (Oct 4, owner: save the score on matches, show a head-to-head
-- record on a player's profile, and offer a rematch):
--
--   * practice_sessions.sets: a match's score from the logger's side of the
--     net, as a list of sets, each [my games, their games]: 6-4 3-6 10-7 is
--     [[6,4],[3,6],[10,7]] (a match tiebreak counts as a set). 1 to 5 sets,
--     0 to 50 games each, never a tie. Anything else is refused ('bad_score').
--     Only on a match: changing a session to anything else clears it.
--   * The winner comes from the sets. When one side took more sets, `won`
--     (already the logger's side of the result, migration 39) is set to
--     match, whatever the phone said; an even count (a match stopped at one
--     set all) leaves `won` as the logger chose. So the score and the result
--     can never disagree.
--   * Who reads and changes it: the row's own rules (migration 39) already
--     say only its owner, the logger, reads or changes their log. A tagged
--     player reads the score through my_session_tags(), from THEIR side of
--     the net (flipped for an opponent), like the result already is. A copy
--     made on Accept (migration 62's "Add to my sessions") starts with the
--     score from the copier's side; that copy is theirs, as before.
--   * Changing the score after someone accepted asks them again (back to
--     waiting, no second buzz, off the posts meanwhile), as a changed result
--     does (migration 62): they said yes to the score that was there.
--   * Posts: a post carrying a match from your log shows the log's score
--     ("sets" on the post's stats), always the server's word, never the
--     phone's, and it follows the log when the score changes.
--   * head_to_head(other): your record against one player, for their
--     profile. It counts only matches with a score where both of you are
--     confirmed (one logged it, the other accepted being tagged across the
--     net), only matches you are in, never anyone else's, and nothing at all
--     between two people blocked either way. The same match logged by both
--     of you counts once.
--
-- Nothing here replaces a function another migration checks by its body
-- (put_session_with and fill_post_session_stats, migration 72, are left
-- alone): the posts get the score from a trigger of their own that runs
-- after fill_post_session_stats (triggers on one table run in order of
-- name). my_session_tags (migration 62's, unchanged since) is replaced to
-- add one column.
--
-- Needs 39, 62 and 65 (all live). Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
begin
  if to_regclass('public.session_tags') is null or to_regprocedure('public.refresh_session_posts(uuid, uuid)') is null then
    raise exception 'Migration 91 stopped before changing anything: migration 62 has to run first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'practice_sessions' and column_name = 'from_session_id') then
    raise exception 'Migration 91 stopped before changing anything: migration 62 has to run first.';
  end if;
end $$;

-- ------------------------------------------------------------------ 1. the column
alter table public.practice_sessions add column if not exists sets jsonb;

-- ------------------------------------------------------------------ 2. helpers
-- A score as the app sends it: 1 to 5 sets, each two whole numbers from 0 to
-- 50, never level. False for anything else (null included). Step by step
-- (plpgsql), so nothing is ever cast before it is known to be a number.
create or replace function public.match_sets_ok(j jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  e jsonb;
begin
  if j is null or jsonb_typeof(j) <> 'array' then return false; end if;
  if jsonb_array_length(j) not between 1 and 5 then return false; end if;
  for e in select x from jsonb_array_elements(j) x loop
    if jsonb_typeof(e) <> 'array' then return false; end if;
    if jsonb_array_length(e) <> 2 then return false; end if;
    if jsonb_typeof(e->0) <> 'number' or jsonb_typeof(e->1) <> 'number' then return false; end if;
    if (e->>0) !~ '^[0-9]{1,2}$' or (e->>1) !~ '^[0-9]{1,2}$' then return false; end if;
    if (e->>0)::int > 50 or (e->>1)::int > 50 or (e->>0)::int = (e->>1)::int then return false; end if;
  end loop;
  return true;
end $$;

-- The same score from the other side of the net: [[6,4],[3,6]] becomes [[4,6],[6,3]].
create or replace function public.flip_sets(j jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
begin
  if not public.match_sets_ok(j) then return null; end if;
  return (select jsonb_agg(jsonb_build_array(e->1, e->0) order by o) from jsonb_array_elements(j) with ordinality as x(e, o));
end $$;

-- Who took more sets, from the logger's side: true (they did), false (the
-- other side did), null (level, or no score).
create or replace function public.sets_winner(j jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  e jsonb;
  mine int := 0;
  theirs int := 0;
begin
  if not public.match_sets_ok(j) then return null; end if;
  for e in select x from jsonb_array_elements(j) x loop
    if (e->>0)::int > (e->>1)::int then mine := mine + 1; else theirs := theirs + 1; end if;
  end loop;
  return case when mine > theirs then true when theirs > mine then false end;
end $$;

-- ------------------------------------------------------------------ 3. a session's score
-- Every new or changed log entry: the score kept only on a match and only
-- in the shape above, and the result made to follow it. A copy made when a
-- tag is accepted (from_session_id, migration 62) starts with the tagger's
-- score from the copier's side, but only for someone actually tagged on
-- that session (a copy pointing anywhere else learns nothing). Runs with the
-- database's rights to read the tagger's session, and only ever for the
-- person on the tag.
create or replace function public.practice_session_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_sets jsonb;
  v_won boolean;
begin
  if new.kind is distinct from 'match' then
    new.sets := null;
    return new;
  end if;
  if tg_op = 'INSERT' and new.sets is null and new.from_session_id is not null then
    select t.role, s.sets into v_role, v_sets
      from public.session_tags t
      join public.practice_sessions s on s.id = t.session_id and s.user_id = t.tagger_id
     where t.session_id = new.from_session_id and t.tagged_id = new.user_id
       and t.status <> 'removed' and not t.tagger_dropped and s.kind = 'match'
     limit 1;
    if v_sets is not null then
      -- A doubles partner was on the logger's side; an opponent sees it the other way round.
      new.sets := case when v_role = 'partner' then v_sets else public.flip_sets(v_sets) end;
    end if;
  end if;
  if new.sets is null or new.sets = 'null'::jsonb then
    new.sets := null;
    return new;
  end if;
  if not public.match_sets_ok(new.sets) then raise exception 'bad_score'; end if;
  v_won := public.sets_winner(new.sets);
  if v_won is not null then new.won := v_won; end if;
  return new;
end $$;
drop trigger if exists practice_session_score on public.practice_sessions;
create trigger practice_session_score before insert or update on public.practice_sessions
  for each row execute function public.practice_session_score();

-- The score changed (or the result changed because of it): people who
-- accepted are asked again, as migration 62 does for a changed result, and
-- every post carrying the session shows the new score. (Migration 62's and
-- 65's triggers only notice the columns the app itself sent, so a score sent
-- on its own, which moves `won` here, needs this one.)
create or replace function public.session_score_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.sets is not distinct from new.sets and old.won is not distinct from new.won then return null; end if;
  update public.notifications n set read = false
    from public.session_tags t
   where t.session_id = new.id and t.status = 'accepted'
     and n.user_id = t.tagged_id and n.kind = 'session-tag' and n.target_id = new.id::text;
  update public.session_tags set status = 'pending', responded_at = null where session_id = new.id and status = 'accepted';
  perform public.refresh_session_posts(new.id, new.user_id);
  return null;
end $$;
drop trigger if exists session_score_changed on public.practice_sessions;
create trigger session_score_changed after update of sets on public.practice_sessions
  for each row when (old.sets is distinct from new.sets or old.won is distinct from new.won)
  execute function public.session_score_changed();

-- ------------------------------------------------------------------ 4. posts show the log's score
-- After fill_post_session_stats has worked a post's stats out (this
-- trigger's name sorts after it, so it runs second), the score is put on
-- from the author's own log entry the stats name (sessionId), or taken off.
-- Whatever a phone sent as "sets" never stays.
create or replace function public.post_session_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_sets jsonb;
begin
  if new.session is null or jsonb_typeof(new.session) <> 'object' then return new; end if;
  if new.session->>'sessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select s.sets into v_sets from public.practice_sessions s
     where s.id = lower(new.session->>'sessionId')::uuid and s.user_id = new.author_id and s.kind = 'match';
  end if;
  if v_sets is null then
    if new.session ? 'sets' then new.session := new.session - 'sets'; end if;
  elsif (new.session->'sets') is distinct from v_sets then
    new.session := new.session || jsonb_build_object('sets', v_sets);
  end if;
  return new;
end $$;
drop trigger if exists post_session_score on public.posts;
create trigger post_session_score before insert or update of session on public.posts
  for each row execute function public.post_session_score();

-- ------------------------------------------------------------------ 5. what a tagged player reads
-- Migration 62's my_session_tags, plus the score from YOUR side: the
-- tagger's own on tags you made, flipped on a tag of you as an opponent,
-- as it is on a tag of you as a doubles partner. Everything else unchanged.
drop function if exists public.my_session_tags();
create function public.my_session_tags()
returns table (
  id uuid, session_id uuid, tagger_id uuid, tagged_id uuid, role text, status text, dropped boolean,
  mirrored_session_id uuid, created_at timestamptz, responded_at timestamptz,
  kind text, day date, minutes int, won boolean, sets jsonb
) language sql stable security definer set search_path = public as $$
  select t.id, t.session_id, t.tagger_id, t.tagged_id, t.role, t.status, t.tagger_dropped,
         case when t.tagged_id = auth.uid() then t.mirrored_session_id end,
         t.created_at, t.responded_at,
         s.kind, s.day, s.minutes,
         case when t.tagger_id = auth.uid() then s.won
              when s.kind = 'match' and s.won is not null then case when t.role = 'partner' then s.won else not s.won end end,
         case when s.kind <> 'match' or s.sets is null then null
              when t.tagger_id = auth.uid() or t.role = 'partner' then s.sets
              else public.flip_sets(s.sets) end
  from public.session_tags t
  join public.practice_sessions s on s.id = t.session_id
  where auth.uid() is not null and (t.tagger_id = auth.uid() or t.tagged_id = auth.uid())
  order by t.created_at desc, t.id
$$;

-- ------------------------------------------------------------------ 6. head-to-head
-- Your record against one player: {"wins", "losses", "last"}, where last is
-- the newest match ({"sessionId", "day", "won", "sets"}, your side). Only
-- matches with a score and a winner, across the net from each other, that
-- one of you logged (not a copy) and the other accepted. Null when signed
-- out, for yourself, or when either of you blocked the other.
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
    select s.id, s.day, s.created_at, s.won, s.sets
      from public.practice_sessions s
      join public.session_tags t on t.session_id = s.id and t.tagger_id = s.user_id
     where s.user_id = me and t.tagged_id = other
       and t.role = 'opponent' and t.status = 'accepted' and not t.tagger_dropped
       and s.kind = 'match' and s.from_session_id is null and s.sets is not null and s.won is not null
    union all
    -- Logged by them, me across the net and confirmed: my side is the other side.
    select s.id, s.day, s.created_at, not s.won, public.flip_sets(s.sets)
      from public.practice_sessions s
      join public.session_tags t on t.session_id = s.id and t.tagger_id = s.user_id
     where s.user_id = other and t.tagged_id = me
       and t.role = 'opponent' and t.status = 'accepted' and not t.tagger_dropped
       and s.kind = 'match' and s.from_session_id is null and s.sets is not null and s.won is not null
  ), once as (
    -- The same match logged by both of us (same day, same score) counts once.
    select distinct on (day, sets) id, day, created_at, won, sets
      from played
     order by day, sets, created_at
  )
  select count(*) filter (where won), count(*) filter (where not won),
         (select jsonb_build_object('sessionId', o.id, 'day', to_char(o.day, 'YYYY-MM-DD'), 'won', o.won, 'sets', o.sets)
            from once o order by o.day desc, o.created_at desc limit 1)
    into v_wins, v_losses, v_last
    from once;
  return jsonb_build_object('wins', coalesce(v_wins, 0), 'losses', coalesce(v_losses, 0))
    || case when v_last is not null then jsonb_build_object('last', v_last) else '{}'::jsonb end;
end $$;

-- ------------------------------------------------------------------ 7. who may call what
-- match_sets_ok, flip_sets and sets_winner are plain arithmetic on the
-- numbers they are given, with nothing private in them: left callable.
-- Server only.
revoke all on function public.practice_session_score() from public, anon, authenticated;
revoke all on function public.session_score_changed() from public, anon, authenticated;
revoke all on function public.post_session_score() from public, anon, authenticated;
-- Signed-in players.
revoke all on function public.my_session_tags() from public, anon;
grant execute on function public.my_session_tags() to authenticated;
revoke all on function public.head_to_head(uuid) from public, anon;
grant execute on function public.head_to_head(uuid) to authenticated;

commit;

-- ------------------------------------------------------------------ 8. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The column is there (expect sets, jsonb):
-- select column_name, data_type from information_schema.columns where table_name = 'practice_sessions' and column_name = 'sets';
--
-- (b) The score rules (expect true, false, false, false, [[4,6],[6,3]], true):
-- select public.match_sets_ok('[[6,4],[3,6],[10,7]]'), public.match_sets_ok('[[6,6]]'), public.match_sets_ok('[]'), public.match_sets_ok('[[6,4],[6,4],[6,4],[6,4],[6,4],[6,4]]'), public.flip_sets('[[6,4],[3,6]]'), public.sets_winner('[[6,4],[3,6],[10,7]]');
--
-- (c) The triggers, in the order they run on posts (expect fill_post_session_stats before post_session_score):
-- select tgname from pg_trigger where tgrelid = 'public.posts'::regclass and not tgisinternal and tgname in ('fill_post_session_stats', 'post_session_score') order by tgname;
--
-- (d) Who may call what (expect head_to_head true, my_session_tags true, post_session_score false):
-- select p.proname, has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
--   where p.pronamespace = 'public'::regnamespace and p.proname in ('head_to_head', 'my_session_tags', 'post_session_score') order by 1;
--
-- (e) No function name exists twice (expect no rows):
-- select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace group by 1 having count(*) > 1;
