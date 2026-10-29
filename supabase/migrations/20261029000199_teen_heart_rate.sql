-- CourtSide · migration 20261029000199: heart rate on sessions shows at every
-- age, under 18 too.
--
-- NOT APPLIED. Run it in the Supabase SQL editor as one piece, after 193
-- (live). It needs no app update first: the server already shows whatever
-- numbers a post's list names, at any age (migration 72). The app update on
-- the same branch only changes what "Share health data" starts as on a new
-- post, and the words that said under-18s' numbers never show.
-- All-or-nothing: if a check fails, it stops and nothing at all changes.
-- Safe to run more than once. Undo: supabase/rollback/199_undo.sql.
--
-- The owner, Oct 29: "Even under 18 should show heart rate for everyone".
-- Before that (Oct 27), about sessions that log themselves: "heart rate
-- showing is fine". Read together: an under-18 player's sessions (and those
-- of anyone whose age is not known) show their heart rate the same way an
-- adult's do, to whoever may already see the session. WHO sees a teen's
-- session does not change: friends who follow each other with them at most,
-- never public (193's rule), and every other teen rule (rough area on the
-- map, who can start a chat, city boards, no place on a post) stays as it is.
--
-- What changes:
--   1. A session that logged itself (193's server post) carries the same
--      numbers for every age: heart rate (average and max), heart-rate zones,
--      calories, and WHOOP's Strain, the ones its tracker recorded. Before
--      this, anyone not known to be an adult got none (an empty list).
--   2. The server posts already made for under-18s (and unknown ages) get
--      those numbers now: only their card's numbers change (the list on the
--      post, and the numbers it names, read from the player's own tracker
--      record as for any post). Not who sees them, not their time, likes,
--      comments or anything else. One whose tracker record is gone (they are
--      deleted 30 days after the session) has nothing left to read, so it is
--      left as it is.
--
-- Left as they are: posts players made themselves (each keeps the numbers
-- its player chose on it), the "old phone" rule for a post without a list
-- (heart rate only for a known adult; only apps from before Oct 3 send no
-- list), the audience rules, alerts (still no length or numbers on the lock
-- screen), and everything else.

begin;

-- ------------------------------------------------------------------ 0. check
-- The one function this file replaces, as 193 left it (live, read on Oct 29),
-- or as this file leaves it (so a second run passes).
do $$
declare
  v_n int;
  v_now text;
begin
  if to_regclass('public.posts') is null or to_regclass('public.detected_activities') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'auto_logged')
     or to_regprocedure('public.health_share_list(jsonb)') is null or to_regprocedure('public.post_session_stats()') is null then
    raise exception 'Migration 20261029000199 stopped before changing anything: migrations 72 and 193 have to run first.';
  end if;
  select count(*), max(md5(p.prosrc)) into v_n, v_now from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'auto_post_for_session';
  if v_n <> 1 or v_now not in ('4b66fb4ad57e0a41a0d27a218ee0028a', 'd9b2a33eb15b24cc0253f627b20455e4') then
    raise exception 'Migration 20261029000199 stopped before changing anything: auto_post_for_session changed since 193. This file must be brought up to date with that change first.';
  end if;
  -- The posts trigger that reads the numbers from the list is still 72's way (it asks the list first, any age).
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.posts'::regclass and t.tgname = 'fill_post_session_stats'
                   and t.tgfoid = 'public.post_session_stats()'::regprocedure) then
    raise exception 'Migration 20261029000199 stopped before changing anything: the posts trigger fill_post_session_stats is not post_session_stats (72).';
  end if;
end $$;

-- --------------------------------------------- 1. new sessions that log themselves
-- 193's auto_post_for_session, word for word, but for one thing: the numbers
-- on it (`share`) are heart rate, zones, Strain and calories for every age
-- (the owner, Oct 29: "Even under 18 should show heart rate for everyone").
-- What the tracker did not record is simply not there (post_session_stats
-- and put_session_with read each from the player's own tracker record).
create or replace function public.auto_post_for_session(s_id uuid, held boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_s public.practice_sessions;
  v_a public.detected_activities;
  v_id uuid;
  v_held boolean;
begin
  select * into v_s from public.practice_sessions where id = s_id;
  if not found or not v_s.auto_logged or v_s.activity_id is null then return null; end if;
  select * into v_a from public.detected_activities where id = v_s.activity_id and user_id = v_s.user_id;
  if not found then return null; end if;
  if exists (select 1 from public.posts p where p.author_id = v_s.user_id and jsonb_typeof(p.session) = 'object'
               and (lower(p.session->>'activityId') = v_a.id::text or lower(p.session->>'sessionId') = v_s.id::text)) then
    return null;
  end if;
  v_held := coalesce(held, false) or v_a.source in ('apple-health', 'health-connect')
    or not exists (select 1 from public.user_state us where us.user_id = v_s.user_id and us.auto_log_audience is not null)
    or ((v_a.unsure and not public.unsure_learned(v_a.user_id, v_a.source)) or v_a.minutes < 20)
       and exists (select 1 from public.detected_activities d
                    where d.user_id = v_a.user_id and d.duplicate_of = v_a.id and d.source in ('apple-health', 'health-connect'));
  begin
    perform set_config('courtside.auto_post', 'on', true);
    insert into public.posts (author_id, kind, body, session, auto_logged, auto_held)
      values (v_s.user_id, 'note', '', jsonb_build_object('activityId', v_a.id, 'drills', '[]'::jsonb,
                     'share', '["hr", "zones", "strain", "kcal"]'::jsonb), true, v_held)
      returning id into v_id;
    perform set_config('courtside.auto_post', '', true);
    -- When it was played, not when the tracker sent it (a week caught up arrives at once).
    perform set_config('courtside.counter_ok', 'on', true);
    update public.posts set created_at = least(v_a.ended_at, now()) where id = v_id;
    perform set_config('courtside.counter_ok', '', true);
  exception when others then
    perform set_config('courtside.auto_post', '', true);
    perform set_config('courtside.counter_ok', '', true);
    raise warning 'auto post for session %: %', s_id, sqlerrm;
    return null;
  end;
  return v_id;
end $$;

-- ------------------------------------------- 2. the ones already made, under 18
-- Each server post whose list has no heart rate (the empty list 193 gave
-- anyone not known to be an adult) gets the full list. The posts trigger
-- (post_session_stats, 72) then reads the numbers from the player's own
-- tracker record, exactly as for a new one, and keeps on the post the ones
-- that tracker can have (Strain only from WHOOP). Only while that
-- record is there: without it, the trigger would take the tracker's link off
-- the post, so those are left alone (counted below).
do $$
declare
  v_full constant jsonb := '["hr", "zones", "strain", "kcal"]'::jsonb;
  v_done int;
  v_gone int;
begin
  update public.posts p
     set session = jsonb_set(p.session, '{share}', v_full)
   where p.auto_logged and jsonb_typeof(p.session) = 'object'
     and not coalesce((p.session->'share') @> '["hr"]'::jsonb, false)
     and exists (select 1 from public.detected_activities d
                  where d.id::text = p.session->>'activityId' and d.user_id = p.author_id);
  get diagnostics v_done = row_count;
  select count(*) into v_gone from public.posts p
   where p.auto_logged and jsonb_typeof(p.session) = 'object'
     and not coalesce((p.session->'share') @> '["hr"]'::jsonb, false);
  raise notice 'Sessions that logged themselves given their heart rate now: %. Left as they were (tracker record gone): %.', v_done, v_gone;
end $$;

-- ------------------------------------------------------------- 3. last check
do $$
declare
  f record;
begin
  select md5(p.prosrc) as src, p.prosecdef as definer, p.proconfig as config,
         has_function_privilege('anon', p.oid, 'execute') as anon,
         has_function_privilege('authenticated', p.oid, 'execute') as signed_in
    into f from pg_proc p where p.oid = 'public.auto_post_for_session(uuid, boolean)'::regprocedure;
  if f.src is distinct from 'd9b2a33eb15b24cc0253f627b20455e4' or not f.definer or f.config is distinct from array['search_path=public'] then
    raise exception 'Migration 20261029000199 stopped: auto_post_for_session is not this file''s. Nothing was changed.';
  end if;
  -- Server only, as 193 left it.
  if f.anon or f.signed_in then
    raise exception 'Migration 20261029000199 stopped: auto_post_for_session can be called from a phone. Nothing was changed.';
  end if;
  -- Every server post whose tracker record is there shares its heart rate.
  if exists (select 1 from public.posts p
              where p.auto_logged and jsonb_typeof(p.session) = 'object'
                and not coalesce((p.session->'share') @> '["hr"]'::jsonb, false)
                and exists (select 1 from public.detected_activities d
                             where d.id::text = p.session->>'activityId' and d.user_id = p.author_id)) then
    raise exception 'Migration 20261029000199 stopped: a session that logged itself still has a short list. Nothing was changed.';
  end if;
end $$;

commit;

-- Check afterwards (read only):
-- select count(*) filter (where not public.known_adult(author_id)) as under_18_or_unknown,
--        count(*) filter (where not public.known_adult(author_id) and (session ? 'avgHr' or session ? 'maxHr')) as with_heart_rate,
--        count(*) filter (where not coalesce((session->'share') @> '["hr"]'::jsonb, false)) as no_heart_rate_on_list
--   from public.posts where auto_logged;
