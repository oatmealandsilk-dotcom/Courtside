-- CourtSide · undo of migration 20261029000206: map_players back to exactly
-- as migration 204 left it (a friend shows on a court within 150 m of its pin,
-- whatever its size).
--
-- Run it in the Supabase SQL editor as one piece. All-or-nothing; safe to run
-- more than once. It stops, changing nothing, if map_players is neither 206's
-- nor already 204's. Does not undo 203 or 204 (their own undo files do,
-- 204_undo.sql first, then 203_undo.sql, and only after this one).

begin;

do $$
begin
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.map_players(double precision, double precision, double precision, double precision)') and md5(p.prosrc) in ('16609abeec95b432a3ec6262d632bc86', '4d3aa4a33d453779c38eaaaca6a158cd')) then
    raise exception 'Undo 206 stopped before changing anything: map_players is not as 206 or 204 left it. Ask Claude to look.';
  end if;
end $$;

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

do $$
begin
  if md5((select prosrc from pg_proc where oid = to_regprocedure('public.map_players(double precision, double precision, double precision, double precision)'))) is distinct from '4d3aa4a33d453779c38eaaaca6a158cd' then
    raise exception 'Undo 206 stopped: map_players did not come out as written. Nothing changed.';
  end if;
  if not has_function_privilege('authenticated', 'public.map_players(double precision, double precision, double precision, double precision)', 'execute')
     or has_function_privilege('anon', 'public.map_players(double precision, double precision, double precision, double precision)', 'execute') then
    raise exception 'Undo 206 stopped: who may call map_players changed. Nothing changed.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
