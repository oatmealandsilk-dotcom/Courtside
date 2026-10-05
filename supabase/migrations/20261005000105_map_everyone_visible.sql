-- CourtSide · migration 105: everyone on "Players nearby" is visible from
-- anywhere again, for now (Oct 5, owner: "Let's just make everyone visible
-- for now. We don't even have enough users. But once we get more we should
-- prolly fix. Also because the users can turn on and off themselves").
--
-- Undoes only the distance part of migration 98 for adult strangers:
--   * Two known adults: they follow each other, or the owner chose
--     "Players nearby" (any distance). Panning the map to another city
--     shows that city's players again, one map view (up to 2° across) at a
--     time, as before 98. Location off or Only me no longer hides strangers
--     from you either.
--   * Unchanged from 98: teens and anyone not known to be an adult are seen
--     only by friends who follow each other with them; a suspended account is
--     never shown and sees nobody; Only me hides you; mutual friends show at
--     any distance; pin placement (rough spot for strangers, exact or court
--     for friends) is the same.
-- map_near and map_anchors stay (unused) so the near-you rule can come back
-- with one change to map_pair_ok when the map has more players.
-- Safe to run more than once.

begin;

create or replace function public.map_pair_ok(viewer uuid, owner uuid, vis text) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and owner is not null and viewer <> owner
    and coalesce(vis, 'nearby') <> 'none'
    and not public.is_blocked_between(viewer, owner)
    and not exists (select 1 from public.profiles p where p.id in (viewer, owner) and p.suspended_at is not null)
    and case
      when public.known_adult(viewer) and public.known_adult(owner)
        then public.follow_each_other(viewer, owner) or coalesce(vis, 'nearby') = 'nearby'
      else not public.map_under_16(viewer) and not public.map_under_16(owner)
        and (public.known_adult(owner) or public.minor_shares_spot(owner))
        and public.follow_each_other(viewer, owner)
        and not public.map_hushed(viewer, owner)
    end
$$;
revoke all on function public.map_pair_ok(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.map_players(min_lat double precision default null, min_lng double precision default null,
  max_lat double precision default null, max_lng double precision default null)
returns table (user_id uuid, lat double precision, lng double precision, place text, court_id text, court_name text,
  city text, seen_at timestamptz, open_until timestamptz, mutual boolean)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  box as (
    select v.given,
      v.mlat - least(v.hlat, 1.0) as lat0, v.mlat + least(v.hlat, 1.0) as lat1,
      v.mlng - least(v.hlng, 1.0) as lng0, v.mlng + least(v.hlng, 1.0) as lng1
    from (select min_lat is not null and min_lng is not null and max_lat is not null and max_lng is not null as given,
            (min_lat + max_lat) / 2 as mlat, abs(max_lat - min_lat) / 2 as hlat,
            (min_lng + max_lng) / 2 as mlng, abs(max_lng - min_lng) / 2 as hlng) v
  ),
  cand as (
    select me.id as user_id from me where me.id is not null
    union
    select f.following_id from public.follows f join me on f.follower_id = me.id
      where exists (select 1 from public.follows b where b.follower_id = f.following_id and b.following_id = me.id)
    union
    select s.user_id from public.last_seen s cross join box b
      where b.given and s.lat between b.lat0 - 0.05 and b.lat1 + 0.05 and s.lng between b.lng0 - 0.05 and b.lng1 + 0.05
  ),
  shown as (
    select s.user_id, s.lat, s.lng, s.city, s.seen_at, s.show_activity, s.user_id = me.id as mine,
      (s.user_id = me.id or public.follow_each_other(me.id, s.user_id)) as close
    from cand c join public.last_seen s on s.user_id = c.user_id cross join me
    where me.id is not null and (
      s.user_id = me.id
      or (s.visibility <> 'none' and public.map_pair_ok(me.id, s.user_id, s.visibility)))
  ),
  placed as (
    select sh.user_id, sh.city, sh.show_activity, sh.mine, sh.close, sh.seen_at, x.seen_at as real_at,
      sh.lat as rlat, sh.lng as rlng, x.lat as xlat, x.lng as xlng,
      kc.id as kid, kc.name as kname, kc.lat as klat, kc.lng as klng,
      c.id as cid, c.name as cname, c.lat as clat, c.lng as clng,
      case
        when x.lat is null then 'approx'
        when kc.id is not null and x.seen_at > now() - interval '2 hours'
             and public.km_between(x.lat, x.lng, kc.lat, kc.lng) <= 0.15 then 'checkin'
        when sh.close and c.id is not null then 'court'
        when sh.close then 'exact'
        else 'approx'
      end as how
    from shown sh
    left join public.exact_spots x on x.user_id = sh.user_id
    left join public.court_checkins k on k.user_id = sh.user_id and k.until > now()
    left join public.courts kc on kc.id = k.court_id and kc.access not in ('members', 'private')
    left join public.courts c on c.id = x.court_id and c.access in ('public', 'pay')
  ),
  pos as (
    select pl.user_id, pl.mine, pl.close, pl.city,
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
    o.close and not o.mine
  from pos o cross join box join public.profiles p on p.id = o.user_id
  left join public.user_state us on us.user_id = o.user_id
  where o.mine or o.close
     or (box.given and o.lat between box.lat0 and box.lat1 and o.lng between box.lng0 and box.lng1)
  -- (Those who hide their activity status come last, so the order cannot tell when they were seen.)
  order by o.mine desc, o.close desc, o.seen_at desc nulls last, o.user_id
  limit 2000
$$;
revoke all on function public.map_players(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.map_players(double precision, double precision, double precision, double precision) to authenticated;

commit;

-- Checks afterwards:
-- (a) No one who is not known to be an adult is shown to a non-friend (expect 0):
-- select count(*) from public.last_seen v join public.last_seen o on o.user_id <> v.user_id
--   where public.map_pair_ok(v.user_id, o.user_id, o.visibility)
--     and not (public.known_adult(v.user_id) and public.known_adult(o.user_id))
--     and not public.follow_each_other(v.user_id, o.user_id);
