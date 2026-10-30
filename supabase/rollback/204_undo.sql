-- CourtSide · undo for migration 20261029000204 ("How long are you here?").
--
-- Run it in the Supabase SQL editor as one piece. All-or-nothing; safe to run
-- more than once. It puts check_in_at_court, map_players and court_right_now
-- back exactly as migration 203 left them: every "I'm playing here" lasts 2
-- hours again (an app that sends how long is told the function is missing and
-- tries again without it, so it still checks in, for 2 hours), a friend's
-- card no longer says until when, and your own court no longer says when
-- yours ends. Check-ins already made for longer are left to end by themselves
-- (4 hours at most). Migration 203 itself stays in; nothing else changes.

begin;

do $$
begin
  if not (exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.check_in_at_court(text, double precision, double precision, integer)') and md5(p.prosrc) = '86b6465ede2eeb852104871129d6bfd3')
    and to_regprocedure('public.check_in_at_court(text, double precision, double precision)') is null
    and exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.map_players(double precision, double precision, double precision, double precision)') and md5(p.prosrc) = '4d3aa4a33d453779c38eaaaca6a158cd')
    and exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.court_right_now(text[])') and md5(p.prosrc) = 'edbebe69561ce181c8876a60de755221'))
     and not (exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.check_in_at_court(text, double precision, double precision)') and md5(p.prosrc) = '69aa7d46ac7c1843b28e3262306b2bad')
    and to_regprocedure('public.check_in_at_court(text, double precision, double precision, integer)') is null
    and exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.map_players(double precision, double precision, double precision, double precision)') and md5(p.prosrc) = 'd41ca670950bc59309e65dce033a9f27')
    and exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.court_right_now(text[])') and md5(p.prosrc) = '1f128ec9388cfbdf0f1747224e84df4a')) then
    raise exception 'Undo 204 stopped before changing anything: a function changed since migration 204. Ask Claude to look.';
  end if;
end $$;

drop function if exists public.check_in_at_court(text, double precision, double precision, integer);
CREATE OR REPLACE FUNCTION public.check_in_at_court(p_court text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
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
  ends timestamptz := now() + interval '2 hours';
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
revoke all on function public.check_in_at_court(text, double precision, double precision) from public, anon;
grant execute on function public.check_in_at_court(text, double precision, double precision) to authenticated, service_role;

drop function if exists public.map_players(double precision, double precision, double precision, double precision);
CREATE OR REPLACE FUNCTION public.map_players(min_lat double precision DEFAULT NULL::double precision, min_lng double precision DEFAULT NULL::double precision, max_lat double precision DEFAULT NULL::double precision, max_lng double precision DEFAULT NULL::double precision)
 RETURNS TABLE(user_id uuid, lat double precision, lng double precision, place text, court_id text, court_name text, city text, seen_at timestamp with time zone, open_until timestamp with time zone, mutual boolean, until timestamp with time zone)
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
      kc.id as kid, kc.name as kname, kc.lat as klat, kc.lng as klng,
      c.id as cid, c.name as cname, c.lat as clat, c.lng as clng,
      case
        when x.lat is null then 'approx'
        when kc.id is not null and x.seen_at > now() - interval '2 hours'
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
      case when pl.mine then coalesce(pl.real_at, pl.seen_at) when pl.show_activity then pl.seen_at end as seen_at
    from placed pl
  )
  select o.user_id, o.lat, o.lng, o.place, o.court_id, o.court_name, o.city, o.seen_at,
    case when greatest(p.open_to_hit_until, us.open_to_hit_until) > now() then greatest(p.open_to_hit_until, us.open_to_hit_until) end,
    not o.mine,
    case when o.mine then o.until end
  from pos o join public.profiles p on p.id = o.user_id
  left join public.user_state us on us.user_id = o.user_id
  -- (Those who hide their activity status come last, so the order cannot tell when they were seen.)
  order by o.mine desc, o.seen_at desc nulls last, o.user_id
  limit 2000
$function$;
revoke all on function public.map_players(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.map_players(double precision, double precision, double precision, double precision) to authenticated, service_role;

drop function if exists public.court_right_now(text[]);
CREATE OR REPLACE FUNCTION public.court_right_now(ids text[])
 RETURNS TABLE(court_id text, status text, status_at timestamp with time zone, playing integer, friend_ids uuid[], you_here boolean)
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
    exists (select 1 from public.court_checkins k where k.user_id = me.id and k.court_id = w.id and k.until > now())
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

do $$
begin
  if to_regprocedure('public.check_in_at_court(text, double precision, double precision, integer)') is not null
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.check_in_at_court(text, double precision, double precision)'))) is distinct from '69aa7d46ac7c1843b28e3262306b2bad'
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.map_players(double precision, double precision, double precision, double precision)'))) is distinct from 'd41ca670950bc59309e65dce033a9f27'
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.court_right_now(text[])'))) is distinct from '1f128ec9388cfbdf0f1747224e84df4a' then
    raise exception 'Undo 204 stopped: a function did not come out as written. Nothing changed.';
  end if;
  if not has_function_privilege('authenticated', 'public.check_in_at_court(text, double precision, double precision)', 'execute')
     or not has_function_privilege('authenticated', 'public.map_players(double precision, double precision, double precision, double precision)', 'execute')
     or not has_function_privilege('authenticated', 'public.court_right_now(text[])', 'execute')
     or has_function_privilege('anon', 'public.check_in_at_court(text, double precision, double precision)', 'execute')
     or has_function_privilege('anon', 'public.map_players(double precision, double precision, double precision, double precision)', 'execute')
     or has_function_privilege('anon', 'public.court_right_now(text[])', 'execute') then
    raise exception 'Undo 204 stopped: who may call the functions changed. Nothing changed.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
