-- CourtSide · migration 136, score_any_session (Oct 6): a score on any
-- tennis session, not only a match.
--
-- William (owner), Oct 5, on the Share page's Score box: "instead of having
-- the score here, would it be better to just have the score in the card.
-- like you fill it out before we get to this page", then "well practices
-- can have scores too". So the score moves into Log session (and its edit),
-- for a practice, a match or drills, and the Share page draws the score the
-- log has. A workout (a run, the gym: kind 'fitness') never has one.
--
-- What changes, on top of migration 91 (live since Oct 4):
--
--   * practice_sessions.sets is kept on a practice and on drills too, in the
--     same shape and with the same check as a match's (match_sets_ok: 1 to 5
--     sets, 0 to 50 games each, never level; anything else is 'bad_score').
--     A fitness session, or any kind that is not tennis, still has it
--     cleared, as before.
--   * Only a match has a result. On a practice or drills the sets are just
--     the sets: `won` is never set from them, and they never count toward a
--     head-to-head (head_to_head, unchanged, still reads matches only).
--   * A practice's score is the logger's own. A player tagged on a practice
--     is beside the logger as a "partner" (migration 62), so there is no way
--     to say which side of the net they were on: their tag never shows the
--     score (my_session_tags, unchanged, still gives a match's only), a copy
--     they make on Accept never takes it (only a match's is copied, as
--     before), and changing it does not ask them to accept again (a match's
--     still does, exactly as migration 91 does).
--   * Posts: a post carrying a practice or drills from your log shows the
--     log's score, as a match's already does, always the server's word.
--
-- Three functions from migration 91 are replaced, each the same as before
-- except where it said "only a match". Nothing else is touched, and no
-- table, column, rule or grant changes. Before this runs, the server
-- quietly drops a practice's score; the new app notices and says the score
-- didn't save (the session itself saves as always).
--
-- Run it in the Supabase SQL editor as one piece, BEFORE the app that lets
-- you score a practice goes out (a push to main or an update to phones).
-- Needs 91 (live). Safe to run more than once. If any step fails, the whole
-- file is undone.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
begin
  if to_regprocedure('public.match_sets_ok(jsonb)') is null
     or to_regprocedure('public.sets_winner(jsonb)') is null
     or to_regprocedure('public.flip_sets(jsonb)') is null
     or to_regprocedure('public.refresh_session_posts(uuid, uuid)') is null
     or to_regprocedure('public.practice_session_score()') is null
     or to_regprocedure('public.session_score_changed()') is null
     or to_regprocedure('public.post_session_score()') is null then
    raise exception 'Migration 136 (score_any_session) stopped before changing anything: migration 91 has to run first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'practice_sessions' and column_name = 'sets') then
    raise exception 'Migration 136 (score_any_session) stopped before changing anything: migration 91 has to run first.';
  end if;
end $$;

-- ------------------------------------------------------------------ 1. a session's score
-- Migration 91's, with a practice and drills keeping their sets. The copy
-- made on Accept still takes only a match's score; the result still follows
-- the sets on a match alone.
create or replace function public.practice_session_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_sets jsonb;
  v_won boolean;
begin
  -- A workout (or anything that is not tennis) has no score.
  if new.kind is null or new.kind not in ('practice', 'match', 'drills') then
    new.sets := null;
    return new;
  end if;
  if new.kind = 'match' and tg_op = 'INSERT' and new.sets is null and new.from_session_id is not null then
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
  -- Only a match has a result: there, the winner follows the sets.
  if new.kind = 'match' then
    v_won := public.sets_winner(new.sets);
    if v_won is not null then new.won := v_won; end if;
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------ 2. a score changed
-- Migration 91's, with the asking-again kept to a match: on a practice or
-- drills the tagged players never saw the score, so nothing they said yes
-- to has changed. Every post carrying the session shows the new score
-- either way.
create or replace function public.session_score_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.sets is not distinct from new.sets and old.won is not distinct from new.won then return null; end if;
  if new.kind = 'match' then
    update public.notifications n set read = false
      from public.session_tags t
     where t.session_id = new.id and t.status = 'accepted'
       and n.user_id = t.tagged_id and n.kind = 'session-tag' and n.target_id = new.id::text;
    update public.session_tags set status = 'pending', responded_at = null where session_id = new.id and status = 'accepted';
  end if;
  perform public.refresh_session_posts(new.id, new.user_id);
  return null;
end $$;

-- ------------------------------------------------------------------ 3. posts show the log's score
-- Migration 91's, reading the score from a practice or drills in the
-- author's log as well as a match. Whatever a phone sent as "sets" never
-- stays.
create or replace function public.post_session_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_sets jsonb;
begin
  if new.session is null or jsonb_typeof(new.session) <> 'object' then return new; end if;
  if new.session->>'sessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select s.sets into v_sets from public.practice_sessions s
     where s.id = lower(new.session->>'sessionId')::uuid and s.user_id = new.author_id and s.kind in ('practice', 'match', 'drills');
  end if;
  if v_sets is null then
    if new.session ? 'sets' then new.session := new.session - 'sets'; end if;
  elsif (new.session->'sets') is distinct from v_sets then
    new.session := new.session || jsonb_build_object('sets', v_sets);
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------ 4. who may call what
-- The same as migration 91 left them: server only. (create or replace keeps
-- a function's grants; this only makes sure.)
revoke all on function public.practice_session_score() from public, anon, authenticated;
revoke all on function public.session_score_changed() from public, anon, authenticated;
revoke all on function public.post_session_score() from public, anon, authenticated;

commit;

-- ------------------------------------------------------------------ 5. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) A practice keeps its score now (expect post_session_score true,
--     practice_session_score true):
-- select p.proname, p.prosrc like '%''practice'', ''match'', ''drills''%' from pg_proc p
--   where p.pronamespace = 'public'::regnamespace and p.proname in ('practice_session_score', 'post_session_score') order by 1;
--
-- (b) Nobody but the server may call them (expect three rows, each false):
-- select p.proname, has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
--   where p.pronamespace = 'public'::regnamespace and p.proname in ('practice_session_score', 'post_session_score', 'session_score_changed') order by 1;
--
-- ------------------------------------------------------------------ 6. to undo
-- Run migration 91's sections 3 and 4 again (the three functions as they
-- were). A practice's or drills' score already saved stays in the column but
-- is cleared the next time that row is changed, and posts stop showing it
-- the next time they are refreshed.
