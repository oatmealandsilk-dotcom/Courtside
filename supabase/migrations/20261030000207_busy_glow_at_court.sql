-- CourtSide · migration 20261030000207: only answers made at the court light it up.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. All-or-nothing:
-- if a check fails, it stops and nothing at all changes. Safe to run more than
-- once. Undo: supabase/rollback/207_undo.sql (back to exactly as it is today).
--
-- (Numbered 207: 205 is "Played here today" on feat/played-here-today, 206 is
-- live. This touches neither of their functions; any order works.)
--
-- SHIP ORDER: apply this on live, THEN merge feat/busy-glow-at-court to main.
-- (Either order is safe: before this is in, the new app's call with a position
-- falls back to the old one by itself, and nothing glows from a Busy or Full
-- answer until it is, since no answer is marked at the court yet. Merged first,
-- the map simply stops glowing from answers until this goes in.)
--
-- Why (owner, Oct 30): "If someone flips it to light it up, we will pop smth up
-- like turn on location or smth, and when they turn it on and are within the
-- radius it will turn on." Since Oct 29 a Busy or Full answer to "How is it
-- right now?" makes a court glow on the map for 90 minutes, and anyone could
-- give one from their sofa.
--
-- What changes, and nothing else:
--   * court_status gets one yes/no, at_court: whether the answer was given at
--     the court. The SERVER works it out, from where the phone says it is,
--     sent with the answer: within the court's reach, the app's own rule
--     (atCourtMiles: 0.15 mi, 0.01 mi more for each court past 4 at a place
--     with more, at most 0.35 mi; a place's courts are same-named ones within
--     800 m, as migration 206 counts them). The position itself is NEVER
--     kept, in any table or log: it is compared and dropped.
--   * report_court_status takes two more, optional answers, p_lat and p_lng,
--     and says back whether the answer counts as at the court. Every other
--     rule is word for word as before (migration 60). An app that sends no
--     position (every build out today) is never at the court: its answers
--     still show on the court as before, they just do not light it up.
--     (A function's list of answers cannot grow in place, so the old one is
--     dropped and the new one made in the same go; the old app's call, with
--     two answers, reaches the new one.)
--   * court_right_now gives two more columns, lit_status and lit_at: the
--     latest answer GIVEN AT THE COURT in the last 90 minutes. The app lights
--     a court from those only. status and status_at, the latest answer of
--     all, are exactly as before (the court card's "Busy · 20 min ago").
--     Nothing new about anyone: still no name, no count, no position.
--
-- Left as they are: every other function, table, policy and grant.

begin;

-- ------------------------------------------------------------------ 0. check
-- report_court_status and court_right_now exactly as live has them today (the
-- md5 of their bodies), or already as this file makes them (run twice).
do $$
begin
  if not (
       (to_regprocedure('public.report_court_status(text, text)') is not null
        and exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.report_court_status(text, text)') and md5(p.prosrc) = 'ef84d740d834b759bdf88b704e9630ec')
        and to_regprocedure('public.report_court_status(text, text, double precision, double precision)') is null)
    or (to_regprocedure('public.report_court_status(text, text)') is null
        and exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.report_court_status(text, text, double precision, double precision)') and md5(p.prosrc) = '9cf4bfa335a3f9ad438086b6f7923c0c'))
  ) then
    raise exception 'Migration 207 stopped before changing anything: report_court_status changed since migration 60. Ask Claude to look.';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.court_right_now(text[])') and md5(p.prosrc) in ('edbebe69561ce181c8876a60de755221', '9cec8c465e92b02af972d8824d25f806')) then
    raise exception 'Migration 207 stopped before changing anything: court_right_now changed since migration 204. Ask Claude to look.';
  end if;
end $$;

-- ---------------------------------------------- 1. was it said at the court?
-- Old answers, and every answer from an app that sends no position: no.
alter table public.court_status add column if not exists at_court boolean not null default false;

-- ------------------------------------------ 2. the answer, and where from
drop function if exists public.report_court_status(text, text);
create or replace function public.report_court_status(p_court text, p_status text, p_lat double precision default null, p_lng double precision default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c public.courts%rowtype;
  n integer := 1;
  here boolean := false;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_status is null then
    delete from public.court_status where court_id = p_court and user_id = me;
    return false;
  end if;
  if p_status not in ('free', 'wait', 'full', 'wet', 'locked') then raise exception 'status?'; end if;
  select * into c from public.courts where id = p_court;
  if not found then raise exception 'court?'; end if;
  if c.access = 'private' then raise exception 'private_court'; end if;
  if (select count(*) from public.court_status where user_id = me and court_id <> p_court and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'slow down';
  end if;
  -- At the court: within its reach (the app's atCourtMiles). The position is only compared here, never kept.
  if p_lat between -90 and 90 and p_lng between -180 and 180 and c.lat is not null and c.lng is not null then
    -- A named place's courts: same-named ones within 800 m (as migration 206 counts them); a court with no name,
    -- or one only called "Tennis courts", is a place of its own.
    if c.name is not null and c.name !~* '^\s*(public\s+)?(tennis\s+)?courts?\s*$' then
      select count(*) into n from public.courts o
      where o.lat between c.lat - 0.008 and c.lat + 0.008
        and o.lng between c.lng - 0.008 / greatest(cos(radians(c.lat)), 0.2) and c.lng + 0.008 / greatest(cos(radians(c.lat)), 0.2)
        and o.name = c.name and public.km_between(o.lat, o.lng, c.lat, c.lng) <= 0.8;
    end if;
    here := public.km_between(p_lat, p_lng, c.lat, c.lng) <= least(0.35, 0.15 + 0.01 * greatest(0, n - 4)) * 1.609344;
  end if;
  insert into public.court_status (court_id, user_id, status, created_at, at_court) values (p_court, me, p_status, now(), here)
    on conflict (court_id, user_id) do update set status = excluded.status, created_at = excluded.created_at, at_court = excluded.at_court;
  delete from public.court_status where created_at < now() - interval '90 minutes';
  return here;
end $$;
revoke all on function public.report_court_status(text, text, double precision, double precision) from public, anon;
grant execute on function public.report_court_status(text, text, double precision, double precision) to authenticated, service_role;

-- ------------------------------- 3. the latest answer given at the court
drop function if exists public.court_right_now(text[]);
CREATE OR REPLACE FUNCTION public.court_right_now(ids text[])
 RETURNS TABLE(court_id text, status text, status_at timestamp with time zone, playing integer, friend_ids uuid[], you_here boolean, you_until timestamp with time zone, lit_status text, lit_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as id, public.known_adult(auth.uid()) as adult),
  wanted as (select distinct x as id from unnest(ids[1:50]) as x where x is not null),
  here as (
    select k.court_id, k.user_id, k.created_at, p.created_at < now() - interval '7 days' as settled,
      public.follow_each_other(me.id, k.user_id) as mutual
    from public.court_checkins k
    join public.profiles p on p.id = k.user_id
    left join public.user_state us on us.user_id = k.user_id
    cross join me
    where k.court_id in (select id from wanted) and k.until > now() and k.user_id <> me.id
      and public.known_adult(k.user_id)
      -- Only someone who said yes to "Who can see you on the map?" counts (migration 191); no answer is not a yes.
      and us.map_visibility in ('nearby', 'mutuals')
      and not public.is_blocked_between(me.id, k.user_id)
  )
  select w.id, st.status, st.created_at,
    case when me.adult and coalesce(h.settled, 0) >= 2 then h.n else 0 end,
    case when me.adult then coalesce(h.friends, '{}'::uuid[]) else '{}'::uuid[] end,
    exists (select 1 from public.court_checkins k where k.user_id = me.id and k.court_id = w.id and k.until > now()),
    -- When yours there ends, so "You're here · till 6:30pm" survives the app reopening (migration 204).
    (select k.until from public.court_checkins k where k.user_id = me.id and k.court_id = w.id and k.until > now()),
    -- The latest answer given AT the court (migration 207): only this lights it up on the map.
    lt.status, lt.created_at
  from wanted w cross join me
  left join lateral (
    select s.status, s.created_at from public.court_status s
    where s.court_id = w.id and s.created_at > now() - interval '90 minutes'
    order by s.created_at desc limit 1) st on true
  left join lateral (
    select s.status, s.created_at from public.court_status s
    where s.court_id = w.id and s.at_court and s.created_at > now() - interval '90 minutes'
    order by s.created_at desc limit 1) lt on true
  left join lateral (
    select count(*)::int as n, (count(*) filter (where here.settled))::int as settled,
      array_agg(here.user_id order by here.created_at desc) filter (where here.mutual) as friends
    from here where here.court_id = w.id) h on true
  where me.id is not null
$function$;
revoke all on function public.court_right_now(text[]) from public, anon;
grant execute on function public.court_right_now(text[]) to authenticated, service_role;

-- ------------------------------------------------------------------ 4. check again
do $$
begin
  if to_regprocedure('public.report_court_status(text, text)') is not null
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.report_court_status(text, text, double precision, double precision)'))) is distinct from '9cf4bfa335a3f9ad438086b6f7923c0c'
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.court_right_now(text[])'))) is distinct from '9cec8c465e92b02af972d8824d25f806' then
    raise exception 'Migration 207 stopped: a function did not come out as written. Nothing changed.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'court_status' and column_name = 'at_court') then
    raise exception 'Migration 207 stopped: court_status has no at_court. Nothing changed.';
  end if;
  if not has_function_privilege('authenticated', 'public.report_court_status(text, text, double precision, double precision)', 'execute')
     or not has_function_privilege('authenticated', 'public.court_right_now(text[])', 'execute')
     or has_function_privilege('anon', 'public.report_court_status(text, text, double precision, double precision)', 'execute')
     or has_function_privilege('anon', 'public.court_right_now(text[])', 'execute') then
    raise exception 'Migration 207 stopped: who may call the functions changed. Nothing changed.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
