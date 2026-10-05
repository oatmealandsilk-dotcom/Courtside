-- 98: the map, round 3 (the database side): strangers only near you, friends anywhere.
--
-- NOT APPLIED. Nothing here has been run on any database yet.
--
-- The owner's decisions (Oct 4, "map round 3"), Snapchat style:
--   * Friends who follow each other show on the map at every zoom,
--     anywhere in the world: still only where they last shared their spot,
--     with their "2h ago", and gone the moment they turn sharing off.
--   * Everyone else ("Players nearby") shows only near you, however far out
--     you zoom and wherever you look on the map.
--   * Teens: exactly as before. Only friends who follow each other, never
--     under 16, only their rough area (about a kilometre), only once they
--     turned it on themselves.
--
-- The problem (found in review, Oct 4): the database already cut each
-- answer down to one part of the map about 220 km across (2° each way), but
-- that part could be anywhere. Panning the map to another city, or asking
-- the database directly for any spot, showed the strangers sharing a spot
-- there. And reading the table of spots directly (older versions of the app
-- do) had no distance limit at all: every stranger's rough spot, worldwide,
-- in one go. The app only ever showed people near you, but the database is
-- what has to say no.
--
-- What changes:
--   1. A new helper, map_near(viewer, owner): both have a spot on the map,
--      and the two are within 80 km (about 50 miles, how far the map's tray
--      lists people). It measures between the two rough spots (about a
--      kilometre out) the map already shows, never anyone's exact spot, so
--      its yes or no can never place anyone finer than their pin does. No
--      spot of your own (Location off): nobody counts as near you, so the
--      map shows you only your friends. This is the same as Snapchat, where
--      you share to see.
--   2. The one rule, map_pair_ok (migration 78), changes in one place: two
--      known adults who are not friends must also be near each other. Two
--      friends who follow each other: anywhere, as before. Anyone not known
--      to be an adult: unchanged (friends only, at any distance).
--      Also: a suspended account is never shown to anyone else on the map.
--      Everything that asks this rule gets both at once: map_players, the
--      rule "who sees a spot" on the table older phones read, and the map
--      alerts (which already only went within 50 km).
--   3. What the map reads, map_players: every answer now carries all your
--      friends who share a spot, wherever they are, with or without a part
--      of the map asked for (so they stay on the map at every zoom). Anyone
--      else comes back only inside the part asked for (still cut to 2° each
--      way) and near you. Friends come first, so none can fall off the
--      2,000 limit. One new column, `mutual`: true for a friend who follows
--      each other with you, so the map can put a friend's face first in a
--      crowded "+N" pin. Where each pin goes is exactly as before.
--
-- Left as they are: spot_shown_to, spot_shown_to_you and the rule "who sees
-- a spot" on last_seen (made again here with the same words, so the table
-- has no other way in), mark_last_seen, forget_last_seen, check-ins,
-- court_right_now (a count of two or more adults, and only friends' names),
-- set_map_visibility, the alerts.
--
-- Something it cannot fix (said plainly): where a phone says it is cannot be
-- checked, so someone who fakes their location moves where "near" is
-- measured from. Snapchat has the same limit.
--
-- Needs 46, 60, 63 and 78 (78 must have run: it made map_pair_ok). Works with
-- or without 64. Stops without changing anything if a function it replaces
-- has changed since it was written. After this has run, never run 78 again:
-- it would put back "Players nearby" from anywhere (its own check stops it
-- anyway). Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
-- md5 of each function's body: as migration 78 left it, or as this file leaves it (a re-run).
do $$
declare
  expected constant text[][] := array[
    ['map_pair_ok', '18fff50185a3437dc3323508e38d91d5', 'de498b74c4823fe6a50674d335ea5621'],
    ['map_players', '6476dd6b87649b842b656f3e3aea94f3', '3395a7b4fd3c7abec5c59cb27f5cfdad'],
    -- Not replaced, but this file counts on them asking map_pair_ok exactly as 78 wrote them.
    ['spot_shown_to', '576d16a22ca04acbe96f9a60647d5873', '576d16a22ca04acbe96f9a60647d5873'],
    ['spot_shown_to_you', 'b0225e84dee18f183091409c94b91794', 'b0225e84dee18f183091409c94b91794']
  ];
  i int;
  now_is text;
  wrong text[] := '{}';
begin
  if to_regclass('public.last_seen') is null or to_regclass('public.exact_spots') is null or to_regclass('public.follows') is null
     or to_regprocedure('public.known_adult(uuid)') is null or to_regprocedure('public.follow_each_other(uuid, uuid)') is null
     or to_regprocedure('public.is_blocked_between(uuid, uuid)') is null
     or to_regprocedure('public.km_between(double precision, double precision, double precision, double precision)') is null
     or to_regprocedure('public.map_under_16(uuid)') is null or to_regprocedure('public.map_hushed(uuid, uuid)') is null
     or to_regprocedure('public.minor_shares_spot(uuid)') is null
     or to_regprocedure('public.map_pair_ok(uuid, uuid, text)') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'profiles' and column_name = 'suspended_at') then
    raise exception 'Migration 98 stopped before changing anything: migrations 46, 60, 63 and 78 have to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    select md5(p.prosrc) into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1];
    if now_is is null or now_is not in (expected[i][2], expected[i][3]) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  -- This file's own helper, if it is there already, must be this file's.
  select md5(p.prosrc) into now_is from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'map_near';
  if now_is is not null and now_is <> 'c02d2e5940da9a01fe8682eae4ed9922' then
    wrong := wrong || 'map_near'::text;
  end if;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 98 stopped before changing anything: % changed since it was written. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ------------------------------------------------------------ 1. near you
-- Whether `owner` is near `viewer` on the map: both have a spot, and the two
-- rough spots (what last_seen keeps, about a kilometre out) are within
-- 80 km. Server only: asking it about anyone would say roughly where they are.
create or replace function public.map_near(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.last_seen v, public.last_seen o
    where v.user_id = viewer and o.user_id = owner
      and public.km_between(v.lat, v.lng, o.lat, o.lng) <= 80)
$$;
revoke all on function public.map_near(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ 2. the one rule
-- Migration 78's, with two changes: two known adults who do not follow each
-- other must be near each other ("Players nearby" means near you), and a
-- suspended account is never shown. Never yourself (the callers handle
-- that), never across a block, never Only me.
--   Both known adults: they follow each other (anywhere), or the owner chose
--     Players nearby and is near the viewer.
--   Anyone else: both follow each other, neither is under 16, neither has
--     muted or blocked the other, and an owner who is not known to be an
--     adult has turned sharing on themselves. At any distance, as before.
create or replace function public.map_pair_ok(viewer uuid, owner uuid, vis text) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and owner is not null and viewer <> owner
    and coalesce(vis, 'nearby') <> 'none'
    and not public.is_blocked_between(viewer, owner)
    and not exists (select 1 from public.profiles p where p.id = owner and p.suspended_at is not null)
    and case
      when public.known_adult(viewer) and public.known_adult(owner)
        then public.follow_each_other(viewer, owner)
          or (coalesce(vis, 'nearby') = 'nearby' and public.map_near(viewer, owner))
      else not public.map_under_16(viewer) and not public.map_under_16(owner)
        and (public.known_adult(owner) or public.minor_shares_spot(owner))
        and public.follow_each_other(viewer, owner)
        and not public.map_hushed(viewer, owner)
    end
$$;
revoke all on function public.map_pair_ok(uuid, uuid, text) from public, anon, authenticated;

-- Reading last_seen directly (older versions of the app do): the same rule,
-- by the same words as migrations 64 and 78, made again so it is the only
-- way in. (spot_shown_to_you asks spot_shown_to, which asks map_pair_ok.)
drop policy if exists "adults see adults' last spot" on public.last_seen;
drop policy if exists "who sees a spot" on public.last_seen;
create policy "who sees a spot" on public.last_seen for select to authenticated using (
  user_id = auth.uid() or public.spot_shown_to_you(user_id)
);

-- ------------------------------------------------------- 3. what the map reads
-- Migration 78's map_players, with who comes back changed:
--   * you;
--   * your friends who follow each other with you, wherever they are, in
--     every answer (with or without a part of the map asked for);
--   * anyone else the rule lets you see (so: near you), inside the part of
--     the map asked for (at most 2° tall and 2° wide round its middle).
-- Friends first, then the most recent. `mutual`: a friend who follows each
-- other with you (never yourself). Where each pin goes is exactly as in 78:
-- friends exactly or on their court, anyone else about a kilometre out (or
-- on the court they said "I'm playing here" at, while that lasts).
-- Only people who might be shown are looked at (you, your friends, and spots
-- within a degree of latitude of yours), then the rule decides for each.
drop function if exists public.map_players(double precision, double precision, double precision, double precision);
create function public.map_players(min_lat double precision default null, min_lng double precision default null,
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
  anchor as (select s.lat from public.last_seen s join me on s.user_id = me.id),
  cand as (
    select me.id as user_id from me where me.id is not null
    union
    select f.following_id from public.follows f join me on f.follower_id = me.id
      where exists (select 1 from public.follows b where b.follower_id = f.following_id and b.following_id = me.id)
    union
    select s.user_id from public.last_seen s cross join anchor a
      where s.lat between a.lat - 1.0 and a.lat + 1.0
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

-- ------------------------------------------------------------- 4. last check
-- Nothing this file made reads the age anywhere but through known_adult and
-- the birthday, and the rule above is the only way to read someone else's
-- spot from last_seen. Either failing undoes the whole file.
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosrc ~* 'age_group'
      and p.proname in ('map_near', 'map_pair_ok', 'map_players');
  if bad is not null then
    raise exception 'Migration 98 stopped: % read the age directly. Nothing was changed.', bad;
  end if;
  select string_agg(policyname, ', ' order by policyname) into bad
    from pg_policies
    where schemaname = 'public' and tablename = 'last_seen' and permissive = 'PERMISSIVE' and cmd in ('SELECT', 'ALL')
      and policyname <> 'who sees a spot';
  if bad is not null then
    raise exception 'Migration 98 stopped: last_seen has another way to read it (%). Nothing was changed.', bad;
  end if;
end $$;

commit;

-- ------------------------------------------------------- 5. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) Who may call what (expect map_players: app true, anon false;
--     map_near, map_pair_ok: both false):
-- select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') app
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('map_players', 'map_near', 'map_pair_ok') order by 1;
--
-- (b) What map_players answers with (expect it to end in "open_until timestamp with time zone, mutual boolean"):
-- select pg_get_function_result('public.map_players(double precision, double precision, double precision, double precision)'::regprocedure);
--
-- (c) Nobody is shown to someone who is not their friend from farther than 80 km (expect 0):
-- select count(*) from public.last_seen v join public.last_seen o on o.user_id <> v.user_id
--   where public.map_pair_ok(v.user_id, o.user_id, o.visibility) and not public.follow_each_other(v.user_id, o.user_id)
--     and public.km_between(v.lat, v.lng, o.lat, o.lng) > 80;
--
-- (d) Nobody who is not known to be an adult is shown to anyone but a friend who follows each other with them, and they see only such friends (expect 0):
-- select count(*) from public.last_seen v join public.last_seen o on o.user_id <> v.user_id
--   where public.map_pair_ok(v.user_id, o.user_id, o.visibility)
--     and not (public.known_adult(v.user_id) and public.known_adult(o.user_id))
--     and not public.follow_each_other(v.user_id, o.user_id);
--
-- (e) Friends far apart who now see each other (just a number to look at; 0 is fine):
-- select count(*) from public.last_seen v join public.last_seen o on o.user_id <> v.user_id
--   where public.map_pair_ok(v.user_id, o.user_id, o.visibility) and public.follow_each_other(v.user_id, o.user_id)
--     and public.km_between(v.lat, v.lng, o.lat, o.lng) > 80;
--
-- (f) The rule on last_seen, and nothing else on it (expect one row: who sees a spot | ((user_id = auth.uid()) OR spot_shown_to_you(user_id))):
-- select policyname, cmd, qual from pg_policies where tablename = 'last_seen';
