-- CourtSide · migration 20261029000206: a big club's court reaches further.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece, AFTER
-- migrations 203 and 204 (it stops, changing nothing, if they are not in yet).
-- All-or-nothing: if a check fails, it stops and nothing at all changes. Safe
-- to run more than once. Undo: supabase/rollback/206_undo.sql (back to 204).
--
-- (Numbered 206, not 205: 205 is already "Played here today",
-- court_played_today, on the branch feat/played-here-today. The two touch
-- different functions and can go in either order.)
--
-- SHIP ORDER: 203, then 204, then this, on live, then merge the branch
-- feat/map-court-playing-here to main.
--
-- Why (owner, Oct 29): "But what if like my club has 20 courts. The area is
-- much bigger". The app counts you as at a court within 0.15 mi of its pin;
-- now that grows with the place: 0.01 mi more for each court past 4, at most
-- 0.35 mi (20 courts: 0.31 mi, about 500 m). The "I'm playing here" check
-- itself (check_in_at_court) already allows anything within 5 km, so it needs
-- nothing. The one tighter check on the server is in map_players: a friend
-- checked in at a court shows ON the court only while their exact spot is
-- within 150 m of its pin; further out their pin stays where they are. At a
-- big club that left a friend on the far courts beside the club, not on it.
--
-- What changes, and nothing else:
--   * map_players: at a place with more than 4 courts (same-named courts
--     within 800 m; an unnamed court, any within 250 m), that 150 m becomes
--     0.15 mi + 0.01 mi per court past 4, at most 0.35 mi, the app's own
--     reach. Up to 4 courts: 150 m, exactly as before. Still only friends who
--     follow each other with you, only while their check-in lasts, as since
--     migration 189; nobody new sees anything, and nothing new is said.
--
-- Not needed for "It should glow when someone taps busy or full" (owner,
-- Oct 29): court_right_now already gives every signed-in player, teens too,
-- the latest Free / Busy / Full / Wet / Locked answer at each court asked
-- about, with its time, for 90 minutes and with no name (as the court card
-- shows it today). The app lights a court from it; no change here.
--
-- Left as they are: check_in_at_court, court_right_now, every table, policy
-- and grant. Teens still never check in anywhere. Nothing is ever automatic.

begin;

-- ------------------------------------------------------------------ 0. check
-- map_players exactly as migration 204 leaves it (the md5 of its body), or
-- already as this file makes it (run twice); and 204's other two functions in,
-- so this never lands before 203 and 204.
do $$
begin
  if to_regprocedure('public.check_in_at_court(text, double precision, double precision, integer)') is null
     or not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.check_in_at_court(text, double precision, double precision, integer)') and md5(p.prosrc) = '86b6465ede2eeb852104871129d6bfd3')
     or not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.court_right_now(text[])') and md5(p.prosrc) = 'edbebe69561ce181c8876a60de755221') then
    raise exception 'Migration 206 stopped before changing anything: run migrations 203 and 204 first.';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.map_players(double precision, double precision, double precision, double precision)') and md5(p.prosrc) in ('4d3aa4a33d453779c38eaaaca6a158cd', '16609abeec95b432a3ec6262d632bc86')) then
    raise exception 'Migration 206 stopped before changing anything: map_players changed since 204. Ask Claude to look.';
  end if;
end $$;

-- ------------------------------- 1. a friend on a big club's far courts shows on the club
-- (The same columns as 204's: replaced in place.)
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
             and public.km_between(x.lat, x.lng, kc.lat, kc.lng) <= (
               -- A big place reaches further (migration 206): over 4 courts, 0.15 mi and 0.01 mi more for each
               -- court past 4, at most 0.35 mi (the app's atCourtMiles); up to 4 courts, 150 m as before. Its
               -- courts: same-named ones within 800 m (an unnamed court: any within 250 m).
               select case when count(*) > 4 then least(0.35, 0.15 + 0.01 * (count(*) - 4)) * 1.609344 else 0.15 end
               from public.courts o
               where o.lat between kc.lat - 0.008 and kc.lat + 0.008
                 and o.lng between kc.lng - 0.008 / greatest(cos(radians(kc.lat)), 0.2) and kc.lng + 0.008 / greatest(cos(radians(kc.lat)), 0.2)
                 and case when kc.name is null then public.km_between(o.lat, o.lng, kc.lat, kc.lng) <= 0.25
                          else o.name = kc.name and public.km_between(o.lat, o.lng, kc.lat, kc.lng) <= 0.8 end) then 'checkin'
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

-- ------------------------------------------------------------------ 2. check again
do $$
begin
  if md5((select prosrc from pg_proc where oid = to_regprocedure('public.map_players(double precision, double precision, double precision, double precision)'))) is distinct from '16609abeec95b432a3ec6262d632bc86' then
    raise exception 'Migration 206 stopped: map_players did not come out as written. Nothing changed.';
  end if;
  if not has_function_privilege('authenticated', 'public.map_players(double precision, double precision, double precision, double precision)', 'execute')
     or has_function_privilege('anon', 'public.map_players(double precision, double precision, double precision, double precision)', 'execute') then
    raise exception 'Migration 206 stopped: who may call map_players changed. Nothing changed.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
