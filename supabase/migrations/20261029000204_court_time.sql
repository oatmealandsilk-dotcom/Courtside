-- CourtSide · migration 20261029000204: "How long are you here?" for "I'm playing here".
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece, AFTER
-- migration 203 (it stops, changing nothing, if 203 is not in yet).
-- All-or-nothing: if a check fails, it stops and nothing at all changes. Safe
-- to run more than once. Undo: supabase/rollback/204_undo.sql (back to 203).
--
-- SHIP ORDER (hard rule): apply 203, then 204, on live BEFORE the branch
-- feat/map-court-playing-here is merged to main. That branch's privacy page
-- (public/privacy.html) says a court check-in lasts "30 minutes to 4 hours";
-- until 204 is in, the server still gives every check-in 2 hours.
--
-- Why (owner, Oct 29): "Right now if you tap in here at a court, should a
-- card pop up that's satisfying with a like + and - screen that asks like how
-- long you're going to be there." Then: "Build it". Tapping "I'm playing here"
-- now opens a small card, "How long are you here?", with - and + in
-- 30-minute steps from 30 minutes to 4 hours. Until now every check-in lasted
-- exactly 2 hours.
--
-- What changes, and nothing else:
--   * check_in_at_court takes a fourth, optional answer, p_minutes: how long
--     you are here. The server holds it to 30 minutes ... 4 hours whatever the
--     app sends (a smaller number is 30 minutes, a bigger one 4 hours). An app
--     that does not send it (every build out today) gets 2 hours, exactly as
--     before. Every other rule is word for word as 203 left it: adults only,
--     a yes to "Who can see you on the map?" first, within 5 km of the court,
--     never at someone's home court, 6 courts a day, one court at a time.
--     (A function's list of answers cannot grow in place, so the old one is
--     dropped and the new one made in the same go; the old app's call, with
--     three answers, reaches the new one.)
--   * map_players: a friend's row says until when they are playing at the
--     court (here_until), so their card reads "here till 6:30pm". Only for a
--     friend whose pin is already on that court (people who follow each other
--     with you, as since 189); nobody new sees anything. A friend checked in
--     for longer than 2 hours stays on the court for as long as they chose
--     (it was held to 2 hours).
--   * court_right_now: your own row says when yours ends (you_until), so
--     "You're here · till 6:30pm" is still right after the app reopens.
--     Nothing about anyone else changes in it.
--
-- Left as they are: Up to hit's own "till 10pm" (last_seen), check_out_of_court,
-- every table, policy and grant. Teens still never check in anywhere. Nothing
-- is ever automatic: each check-in is a tap in the app (Apple 5.1.2(i)).

begin;

-- ------------------------------------------------------------------ 0. check
-- Each function is exactly as migration 203 leaves it (the md5 of its body),
-- or already as this file makes it (run twice), so nothing written since is
-- overwritten.
do $$
begin
  if not (exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.check_in_at_court(text, double precision, double precision)') and md5(p.prosrc) = '69aa7d46ac7c1843b28e3262306b2bad')
    and to_regprocedure('public.check_in_at_court(text, double precision, double precision, integer)') is null
    and exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.map_players(double precision, double precision, double precision, double precision)') and md5(p.prosrc) = 'd41ca670950bc59309e65dce033a9f27')
    and exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.court_right_now(text[])') and md5(p.prosrc) = '1f128ec9388cfbdf0f1747224e84df4a'))
     and not (exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.check_in_at_court(text, double precision, double precision, integer)') and md5(p.prosrc) = '86b6465ede2eeb852104871129d6bfd3')
    and to_regprocedure('public.check_in_at_court(text, double precision, double precision)') is null
    and exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.map_players(double precision, double precision, double precision, double precision)') and md5(p.prosrc) = '4d3aa4a33d453779c38eaaaca6a158cd')
    and exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.court_right_now(text[])') and md5(p.prosrc) = 'edbebe69561ce181c8876a60de755221')) then
    if exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.check_in_at_court(text, double precision, double precision)') and md5(p.prosrc) = '70bef71b3e1fefc4f1ebac5058f8beee') then
      raise exception 'Migration 204 stopped before changing anything: run migration 203 first.';
    end if;
    raise exception 'Migration 204 stopped before changing anything: check_in_at_court, map_players or court_right_now changed since 203. Ask Claude to look.';
  end if;
end $$;

-- --------------------------------------- 1. "I'm playing here" for as long as you chose
drop function if exists public.check_in_at_court(text, double precision, double precision);
CREATE OR REPLACE FUNCTION public.check_in_at_court(p_court text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_minutes integer DEFAULT NULL::integer)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  c public.courts;
  spot public.last_seen;
  real_at timestamptz;
  -- How long you are here, as you chose it (migration 204): 30 minutes to 4 hours; an app that does not say, 2 hours.
  ends timestamptz := now() + case when p_minutes is null then interval '2 hours' else make_interval(mins => least(240, greatest(30, p_minutes))) end;
  tries integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.known_adult(me) then raise exception 'adults_only'; end if;
  -- A yes to "Who can see you on the map?" first (migration 191, Apple 5.1.2(i)): no answer is not a yes.
  if not exists (select 1 from public.user_state where user_id = me and map_visibility in ('nearby', 'mutuals')) then
    if exists (select 1 from public.user_state where user_id = me and map_visibility = 'none') then raise exception 'hidden'; end if;
    raise exception 'ask_first';
  end if;
  select * into c from public.courts where id = p_court;
  if c.id is null then raise exception 'court?'; end if;
  -- Any court but someone's home (migration 203, Oct 29: a club's members-only court is fine; owner: "if your playing there your playing there").
  if c.access = 'private' then raise exception 'closed_court'; end if;
  if p_lat is not null and p_lng is not null and abs(p_lat) <= 90 and abs(p_lng) <= 180 then
    -- Where the phone is now, only to check you are at the court; it is never kept.
    if public.km_between(p_lat, p_lng, c.lat, c.lng) > 5 then raise exception 'too_far'; end if;
  else
    -- An older app sends only the court: then a live map check-in near it.
    select * into spot from public.last_seen where user_id = me and until > now();
    if spot.user_id is null then raise exception 'location_off'; end if;
    select x.seen_at into real_at from public.exact_spots x where x.user_id = me;
    if coalesce(real_at, spot.seen_at) < now() - interval '12 hours' or public.km_between(spot.lat, spot.lng, c.lat, c.lng) > 5 then
      raise exception 'too_far';
    end if;
  end if;
  if not exists (select 1 from public.court_checkins where user_id = me and court_id = c.id and until > now()) then
    insert into public.court_checkin_days as d (user_id, day, n) values (me, current_date, 1)
      on conflict (user_id) do update set n = case when d.day = current_date then d.n + 1 else 1 end, day = current_date
      returning n into tries;
    if tries > 6 then raise exception 'slow down'; end if;
  end if;
  insert into public.court_checkins (user_id, court_id, created_at, until) values (me, c.id, now(), ends)
    on conflict (user_id) do update set court_id = excluded.court_id, created_at = excluded.created_at, until = excluded.until;
  delete from public.court_checkins where until < now();
  return ends;
end $function$;
revoke all on function public.check_in_at_court(text, double precision, double precision, integer) from public, anon;
grant execute on function public.check_in_at_court(text, double precision, double precision, integer) to authenticated, service_role;

-- ------------------------------------- 2. a friend's card: "here till 6:30pm"
-- (A function's columns cannot grow in place either: dropped and made again in the same go.)
drop function if exists public.map_players(double precision, double precision, double precision, double precision);
CREATE OR REPLACE FUNCTION public.map_players(min_lat double precision DEFAULT NULL::double precision, min_lng double precision DEFAULT NULL::double precision, max_lat double precision DEFAULT NULL::double precision, max_lng double precision DEFAULT NULL::double precision)
 RETURNS TABLE(user_id uuid, lat double precision, lng double precision, place text, court_id text, court_name text, city text, seen_at timestamp with time zone, open_until timestamp with time zone, mutual boolean, until timestamp with time zone, here_until timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- (The box is no longer used: you and your friends come back wherever they are, nobody else.)
  with me as (select auth.uid() as id),
  cand as (
    select me.id as user_id from me where me.id is not null
    union
    select f.following_id from public.follows f join me on f.follower_id = me.id
      where exists (select 1 from public.follows b where b.follower_id = f.following_id and b.following_id = me.id)
  ),
  shown as (
    select s.user_id, s.lat, s.lng, s.city, s.seen_at, s.show_activity, s.until, s.user_id = me.id as mine
    from cand c join public.last_seen s on s.user_id = c.user_id cross join me
    where me.id is not null and s.until > now() and (
      s.user_id = me.id
      or (s.visibility <> 'none' and public.map_pair_ok(me.id, s.user_id, s.visibility)))
  ),
  placed as (
    select sh.user_id, sh.city, sh.show_activity, sh.mine, sh.until, sh.seen_at, x.seen_at as real_at,
      sh.lat as rlat, sh.lng as rlng, x.lat as xlat, x.lng as xlng,
      kc.id as kid, kc.name as kname, kc.lat as klat, kc.lng as klng, k.until as kuntil,
      c.id as cid, c.name as cname, c.lat as clat, c.lng as clng,
      case
        when x.lat is null then 'approx'
        -- Their spot as fresh as the check-in is long: 2 hours, or up to 4 when they chose longer (migration 204).
        when kc.id is not null and x.seen_at > now() - greatest(interval '2 hours', k.until - k.created_at)
             and public.km_between(x.lat, x.lng, kc.lat, kc.lng) <= 0.15 then 'checkin'
        when c.id is not null then 'court'
        else 'exact'
      end as how
    from shown sh
    left join public.exact_spots x on x.user_id = sh.user_id
    left join public.court_checkins k on k.user_id = sh.user_id and k.until > now()
    left join public.courts kc on kc.id = k.court_id and kc.access <> 'private'
    left join public.courts c on c.id = x.court_id and c.access in ('public', 'pay')
  ),
  pos as (
    select pl.user_id, pl.mine, pl.until, pl.city,
      case pl.how when 'checkin' then pl.klat when 'court' then pl.clat when 'exact' then pl.xlat else pl.rlat end as lat,
      case pl.how when 'checkin' then pl.klng when 'court' then pl.clng when 'exact' then pl.xlng else pl.rlng end as lng,
      case pl.how when 'checkin' then 'court' when 'court' then 'court' when 'exact' then 'exact' else 'approx' end as place,
      case pl.how when 'checkin' then pl.kid when 'court' then pl.cid end as court_id,
      case pl.how when 'checkin' then pl.kname when 'court' then pl.cname end as court_name,
      case when pl.mine then coalesce(pl.real_at, pl.seen_at) when pl.show_activity then pl.seen_at end as seen_at,
      -- Playing at the court until then ("here till 6:30pm"), as they chose it (migration 204).
      case when pl.how = 'checkin' then pl.kuntil end as here_until
    from placed pl
  )
  select o.user_id, o.lat, o.lng, o.place, o.court_id, o.court_name, o.city, o.seen_at,
    case when greatest(p.open_to_hit_until, us.open_to_hit_until) > now() then greatest(p.open_to_hit_until, us.open_to_hit_until) end,
    not o.mine,
    case when o.mine then o.until end,
    o.here_until
  from pos o join public.profiles p on p.id = o.user_id
  left join public.user_state us on us.user_id = o.user_id
  -- (Those who hide their activity status come last, so the order cannot tell when they were seen.)
  order by o.mine desc, o.seen_at desc nulls last, o.user_id
  limit 2000
$function$;
revoke all on function public.map_players(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.map_players(double precision, double precision, double precision, double precision) to authenticated, service_role;

-- ------------------------------------- 3. your own court: when yours ends
drop function if exists public.court_right_now(text[]);
CREATE OR REPLACE FUNCTION public.court_right_now(ids text[])
 RETURNS TABLE(court_id text, status text, status_at timestamp with time zone, playing integer, friend_ids uuid[], you_here boolean, you_until timestamp with time zone)
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
    (select k.until from public.court_checkins k where k.user_id = me.id and k.court_id = w.id and k.until > now())
  from wanted w cross join me
  left join lateral (
    select s.status, s.created_at from public.court_status s
    where s.court_id = w.id and s.created_at > now() - interval '90 minutes'
    order by s.created_at desc limit 1) st on true
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
  if to_regprocedure('public.check_in_at_court(text, double precision, double precision)') is not null
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.check_in_at_court(text, double precision, double precision, integer)'))) is distinct from '86b6465ede2eeb852104871129d6bfd3'
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.map_players(double precision, double precision, double precision, double precision)'))) is distinct from '4d3aa4a33d453779c38eaaaca6a158cd'
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.court_right_now(text[])'))) is distinct from 'edbebe69561ce181c8876a60de755221' then
    raise exception 'Migration 204 stopped: a function did not come out as written. Nothing changed.';
  end if;
  if not has_function_privilege('authenticated', 'public.check_in_at_court(text, double precision, double precision, integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.map_players(double precision, double precision, double precision, double precision)', 'execute')
     or not has_function_privilege('authenticated', 'public.court_right_now(text[])', 'execute')
     or has_function_privilege('anon', 'public.check_in_at_court(text, double precision, double precision, integer)', 'execute')
     or has_function_privilege('anon', 'public.map_players(double precision, double precision, double precision, double precision)', 'execute')
     or has_function_privilege('anon', 'public.court_right_now(text[])', 'execute') then
    raise exception 'Migration 204 stopped: who may call the functions changed. Nothing changed.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
