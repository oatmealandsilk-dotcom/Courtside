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
-- A second problem (found in review, Oct 5): "near you" was measured from
-- the spot the database kept for you, and anyone could set that spot to
-- anywhere, as often as they liked, by asking the database directly (no
-- phone needed), even while on Only me, where nobody sees them. Two asks
-- per city listed the strangers sharing a spot there, and could be
-- scripted round the world.
--
-- What changes:
--   1. Where "near you" is measured from (a new table, map_anchors): your
--      rough spot, but it cannot jump about. It follows you no faster than
--      a plane, with at most four big moves (more than 80 km, or starting
--      again after Location off) a day. Location off empties the place
--      itself, as it empties everything else (nothing of where you were is
--      kept); only when it last moved and how many big moves today stay.
--      mark_last_seen moves it; forget_last_seen empties it.
--   2. A new helper, map_near(viewer, owner): the viewer shares a spot (has
--      one, and not on Only me), and the owner's rough spot is within 80 km
--      (about 50 miles, how far the map's tray lists people) of where "near"
--      is measured from for the viewer. It measures between rough spots
--      (about a kilometre out) only, never anyone's exact spot, so its yes
--      or no can never place anyone finer than their pin does. No spot of
--      your own (Location off), or Only me: nobody counts as near you, so
--      the map shows you only your friends. This is the same as Snapchat,
--      where you share to see.
--   3. The one rule, map_pair_ok (migration 78), changes in one place: two
--      known adults who are not friends must also be near each other. Two
--      friends who follow each other: anywhere, as before. Anyone not known
--      to be an adult: unchanged (friends only, at any distance).
--      Also: a suspended account neither shows on the map nor sees anyone
--      on it.
--      Everything that asks this rule gets all of it at once: map_players,
--      the rule "who sees a spot" on the table older phones read, and the
--      map alerts (which already only went within 50 km).
--   4. What the map reads, map_players: every answer now carries all your
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
-- has no other way in), check-ins, court_right_now (a count of two or more
-- adults, and only friends' names), set_map_visibility, the alerts. What
-- mark_last_seen and forget_last_seen do with your spots is exactly as
-- before; each only also moves or empties map_anchors.
--
-- Something it cannot fix (said plainly): where a phone says it is cannot be
-- checked, so someone who fakes their location still moves where "near" is
-- measured from. Now only as fast as a plane, and with at most four big
-- moves a day: no more city after city in seconds. Snapchat has the same
-- limit.
--
-- Needs 46, 60, 63 and 78 (78 must have run: it made map_pair_ok). Works with
-- or without 64. Stops without changing anything if a function it replaces
-- has changed since it was written. After this has run, never run 63 or 78
-- again: 78 would put back "Players nearby" from anywhere, 63 a
-- mark_last_seen that no longer moves map_anchors (their own checks stop
-- them anyway). Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
-- md5 of each function's body: as migrations 63 and 78 left it, or as this file leaves it (a re-run).
do $$
declare
  expected constant text[][] := array[
    ['map_pair_ok', '18fff50185a3437dc3323508e38d91d5', '7bab9f4e65958d82992040343aed599a'],
    ['map_players', '6476dd6b87649b842b656f3e3aea94f3', '65d7f4a21edc93b4a985b3ed34e4b6a0'],
    ['mark_last_seen', '228477328c0f7b6717f71992ed00cd00', 'b97f108ece9f30c7de387938b5c310b4'],
    ['forget_last_seen', '7faefc3e0e7470f8724e9a92a40cc845', '52c82954edf1a4d7af6220365dd616ac'],
    -- Not replaced, but this file counts on them asking map_pair_ok exactly as 78 wrote them.
    ['spot_shown_to', '576d16a22ca04acbe96f9a60647d5873', '576d16a22ca04acbe96f9a60647d5873'],
    ['spot_shown_to_you', 'b0225e84dee18f183091409c94b91794', 'b0225e84dee18f183091409c94b91794']
  ];
  -- This file's own helpers: if one is there already, it must be this file's.
  helpers constant text[][] := array[
    ['map_near', '19bdebb808b9a8a3c6b7479936a4f1b7'],
    ['map_anchor_may_move', '167c846c2726c722d4a1d1a68babb12a']
  ];
  i int;
  now_is text;
  wrong text[] := '{}';
begin
  if to_regclass('public.last_seen') is null or to_regclass('public.exact_spots') is null or to_regclass('public.follows') is null
     or to_regclass('public.court_checkins') is null
     or to_regprocedure('public.known_adult(uuid)') is null or to_regprocedure('public.follow_each_other(uuid, uuid)') is null
     or to_regprocedure('public.is_blocked_between(uuid, uuid)') is null
     or to_regprocedure('public.km_between(double precision, double precision, double precision, double precision)') is null
     or to_regprocedure('public.map_under_16(uuid)') is null or to_regprocedure('public.map_hushed(uuid, uuid)') is null
     or to_regprocedure('public.minor_shares_spot(uuid)') is null
     or to_regprocedure('public.map_pair_ok(uuid, uuid, text)') is null
     or to_regprocedure('public.map_rough(uuid, integer, integer, date)') is null
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
  for i in 1 .. array_length(helpers, 1) loop
    now_is := null;
    select md5(p.prosrc) into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = helpers[i][1];
    if now_is is not null and now_is <> helpers[i][2] then
      wrong := wrong || helpers[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 98 stopped before changing anything: % changed since it was written. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ------------------------------------------- 1. where "near you" is measured from
-- One row per player who has had a spot: the rough spot (about a kilometre
-- out, as on last_seen, never the exact one) that "near you" is measured
-- from, when it last moved, and how many big moves it made on jump_day
-- (UTC). Only the server reads or writes it: mark_last_seen moves it,
-- forget_last_seen (Location off) empties lat and lng.
create table if not exists public.map_anchors (
  user_id  uuid primary key references public.profiles(id) on delete cascade,
  lat      double precision check (lat between -90 and 90),
  lng      double precision check (lng between -180 and 180),
  moved_at timestamptz not null default now(),
  jump_day date,
  jumps    integer not null default 0 check (jumps >= 0)
);
alter table public.map_anchors enable row level security;
-- No rule lets anyone read it, and nobody but the server may: not even its owner.
revoke all on public.map_anchors from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'map_anchors') then
    alter publication supabase_realtime drop table public.map_anchors;
  end if;
end $$;
-- Everyone with a spot today starts from it, so nobody loses "Players
-- nearby" until their phone next sends one. (A re-run keeps what is there.)
insert into public.map_anchors (user_id, lat, lng, moved_at)
  select s.user_id, s.lat, s.lng, least(now(), s.seen_at)
  from public.last_seen s
  where exists (select 1 from public.profiles p where p.id = s.user_id)
  on conflict (user_id) do nothing;

-- Whether where "near you" is measured from may move from one rough spot
-- (from_lat, from_lng) to another (to_lat, to_lng), `hours` after it last
-- moved, with `jumps` big moves made already today. It may when:
--   * the new spot is within 10 km (a rough spot wanders a little from day
--     to day and square to square), or
--   * the move is no faster than 900 km/h (a plane), and is either under
--     80 km or one of at most four big moves a day.
-- With nothing to move from (a first spot, or the first after Location
-- off), starting again is a big move too: nobody can tell how far it is.
-- So nobody, phone or not, can hop from city to city asking who is there.
create or replace function public.map_anchor_may_move(from_lat double precision, from_lng double precision,
  hours double precision, jumps integer, to_lat double precision, to_lng double precision) returns boolean
language sql immutable set search_path = public as $$
  select case
    when to_lat is null or to_lng is null then false
    when from_lat is null or from_lng is null then coalesce(jumps, 0) < 4
    else d.km <= 10
      or (d.km <= 900 * greatest(coalesce(hours, 0), 0) and (d.km <= 80 or coalesce(jumps, 0) < 4))
  end
  from (select public.km_between(from_lat, from_lng, to_lat, to_lng) as km) d
$$;
revoke all on function public.map_anchor_may_move(double precision, double precision, double precision, integer, double precision, double precision)
  from public, anon, authenticated;

-- ------------------------------------------------------------ 2. near you
-- Whether `owner` is near `viewer` on the map: the viewer shares a spot
-- (has one on last_seen, and did not choose Only me: you share to see), and
-- the owner's rough spot is within 80 km of where "near" is measured from
-- for the viewer (map_anchors). Server only: asking it about anyone would
-- say roughly where they are.
create or replace function public.map_near(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.last_seen v, public.map_anchors a, public.last_seen o
    where v.user_id = viewer and a.user_id = viewer and o.user_id = owner
      and v.visibility <> 'none' and a.lat is not null and a.lng is not null
      and public.km_between(a.lat, a.lng, o.lat, o.lng) <= 80)
$$;
revoke all on function public.map_near(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ 3. the one rule
-- Migration 78's, with two changes: two known adults who do not follow each
-- other must be near each other ("Players nearby" means near you), and a
-- suspended account is never shown and sees nobody. Never yourself (the
-- callers handle that), never across a block, never Only me.
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
    and not exists (select 1 from public.profiles p where p.id in (viewer, owner) and p.suspended_at is not null)
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

-- ----------------------------------------- 4. sharing a spot, and Location off
-- Migration 63's mark_last_seen, word for word, with one addition at the
-- end: where "near you" is measured from follows the new rough spot when
-- map_anchor_may_move says it may, and otherwise stays where it was (your
-- pin still moves: only who counts as near you does not).
create or replace function public.mark_last_seen(p_lat double precision, p_lng double precision, p_city text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  st public.user_state;
  prev public.exact_spots;
  sharing boolean;
  shown boolean;
  stamp bigint := floor(extract(epoch from now()))::bigint;
  -- About 250 m: how far outside a recent square you may go and keep it.
  m_lat constant double precision := 0.00225;
  m_lng double precision;
  e record;
  b record;
  pick_i integer;
  pick_j integer;
  keep jsonb := '[]'::jsonb;
  rough record;
  anc public.map_anchors;
  utc_day date := (now() at time zone 'utc')::date;
  big_today integer;
begin
  -- Nothing for a missing, impossible or not-a-number spot (NaN counts as larger than any number).
  if me is null or p_lat is null or p_lng is null or not (abs(p_lat) <= 90) or not (abs(p_lng) <= 180) then return; end if;
  select * into st from public.user_state where user_id = me;
  select * into prev from public.exact_spots where user_id = me for update;
  sharing := public.known_adult(me) and st.map_visibility in ('nearby', 'mutuals');
  shown := coalesce(st.show_activity, true);
  m_lng := m_lat / greatest(cos(radians(p_lat)), 0.2);
  -- The square: a recent one (newest first) you are in or within about
  -- 250 m of; else the one you are in now.
  for e in
    select (x->>'i')::integer as i, (x->>'j')::integer as j, (x->>'t')::bigint as t
    from jsonb_array_elements(coalesce(prev.cells, '[]'::jsonb)) with ordinality as a(x, n)
    order by n
  loop
    continue when e.t is null or e.t < stamp - 30 * 86400;
    if pick_i is null then
      select * into b from public.map_cell_box(me, e.i, e.j);
      if p_lat between b.lat0 - m_lat and b.lat1 + m_lat and p_lng between b.lng0 - m_lng and b.lng1 + m_lng then
        pick_i := e.i; pick_j := e.j;
        continue;
      end if;
    end if;
    if jsonb_array_length(keep) < 7 then keep := keep || jsonb_build_array(jsonb_build_object('i', e.i, 'j', e.j, 't', e.t)); end if;
  end loop;
  if pick_i is null then select c.ci, c.cj into pick_i, pick_j from public.map_cell(me, p_lat, p_lng) c; end if;
  keep := jsonb_build_array(jsonb_build_object('i', pick_i, 'j', pick_j, 't', stamp)) || keep;
  select * into rough from public.map_rough(me, pick_i, pick_j, (now() at time zone 'utc')::date);

  insert into public.exact_spots (user_id, lat, lng, court_id, seen_at, cells)
  values (me,
    case when sharing then round(p_lat::numeric, 4)::double precision end,
    case when sharing then round(p_lng::numeric, 4)::double precision end,
    case when sharing then public.court_at(p_lat, p_lng) end,
    now(), keep)
  on conflict (user_id) do update
    set lat = excluded.lat, lng = excluded.lng, court_id = excluded.court_id, seen_at = excluded.seen_at, cells = excluded.cells;
  insert into public.last_seen (user_id, lat, lng, city, seen_at, show_activity, visibility)
  values (me, rough.lat, rough.lng, left(nullif(btrim(p_city), ''), 80),
    case when shown then now() else public.coarse_day(now()) end, shown, coalesce(st.map_visibility, 'nearby'))
  on conflict (user_id) do update
    set lat = excluded.lat, lng = excluded.lng, city = excluded.city, seen_at = excluded.seen_at,
        show_activity = excluded.show_activity, visibility = excluded.visibility;

  -- Where "near you" is measured from (migration 98): to the new rough spot
  -- if it may move there; a big move (more than 80 km, or from nothing)
  -- counts towards today's four.
  select * into anc from public.map_anchors where user_id = me for update;
  big_today := case when anc.jump_day = utc_day then anc.jumps else 0 end;
  if public.map_anchor_may_move(anc.lat, anc.lng, extract(epoch from now() - anc.moved_at) / 3600.0, big_today, rough.lat, rough.lng) then
    insert into public.map_anchors (user_id, lat, lng, moved_at, jump_day, jumps)
    values (me, rough.lat, rough.lng, now(), utc_day,
      big_today + case when anc.lat is null or public.km_between(anc.lat, anc.lng, rough.lat, rough.lng) > 80 then 1 else 0 end)
    on conflict (user_id) do update
      set lat = excluded.lat, lng = excluded.lng, moved_at = excluded.moved_at, jump_day = excluded.jump_day, jumps = excluded.jumps;
  end if;
end $$;
revoke all on function public.mark_last_seen(double precision, double precision, text) from public, anon;
grant execute on function public.mark_last_seen(double precision, double precision, text) to authenticated;

-- Location off: the exact spot, the rough spot, the squares and any check-in
-- all go, as in 63; and where "near you" is measured from loses its place
-- too. Only when it last moved and today's big moves stay (no place), so
-- switching Location off and on again cannot be used to jump about.
create or replace function public.forget_last_seen()
returns void language sql security definer set search_path = public as $$
  delete from public.exact_spots where user_id = auth.uid();
  delete from public.last_seen where user_id = auth.uid();
  delete from public.court_checkins where user_id = auth.uid();
  update public.map_anchors set lat = null, lng = null where user_id = auth.uid();
$$;
revoke all on function public.forget_last_seen() from public, anon;
grant execute on function public.forget_last_seen() to authenticated;

-- ------------------------------------------------------- 5. what the map reads
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
-- within a degree of latitude of where "near you" is measured from), then
-- the rule decides for each.
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
  anchor as (select a.lat from public.map_anchors a join me on a.user_id = me.id where a.lat is not null),
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

-- ------------------------------------------------------------- 6. last check
-- Nothing this file made reads the age anywhere but through known_adult and
-- the birthday; the rule above is the only way to read someone else's spot
-- from last_seen; nobody but the server can read map_anchors; and where
-- "near you" is measured from cannot jump about (tried on made-up spots
-- only: nobody's real one is read). Any of these failing undoes the whole
-- file.
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosrc ~* 'age_group'
      and p.proname in ('map_near', 'map_pair_ok', 'map_players', 'map_anchor_may_move', 'mark_last_seen', 'forget_last_seen');
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
  if has_table_privilege('authenticated', 'public.map_anchors', 'select') or has_table_privilege('anon', 'public.map_anchors', 'select')
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'map_anchors') then
    raise exception 'Migration 98 stopped: map_anchors can be read from the app. Nothing was changed.';
  end if;
  if not (
        public.map_anchor_may_move(40.71, -74.01, 0.01, 0, 40.75, -73.98)       -- across town (5 km), at once: yes
    and not public.map_anchor_may_move(40.71, -74.01, 1.0 / 60, 0, 51.51, -0.13) -- New York to London a minute later: no
    and public.map_anchor_may_move(40.71, -74.01, 8, 0, 51.51, -0.13)           -- ... eight hours later (a flight): yes
    and not public.map_anchor_may_move(40.71, -74.01, 8, 4, 51.51, -0.13)       -- ... but not as a fifth big move that day
    and public.map_anchor_may_move(40.71, -74.01, 1, 4, 41.2, -74.01)           -- 55 km in an hour, after four big moves: yes
    and public.map_anchor_may_move(null, null, 0, 3, 51.51, -0.13)              -- starting again after Location off: yes
    and not public.map_anchor_may_move(null, null, 0, 4, 51.51, -0.13)          -- ... but not a fifth time that day
    -- Twenty far jumps a minute apart, from a spot that never moved: not one is let through.
    and (select bool_and(not public.map_anchor_may_move(40.71, -74.01, k / 60.0, 0, 40.71 + 2 * k, -74.01))
           from generate_series(1, 20) k)
  ) then
    raise exception 'Migration 98 stopped: where "near you" is measured from could jump about. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 7. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) Who may call what (expect map_players: app true, anon false;
--     map_near, map_pair_ok, map_anchor_may_move: both false):
-- select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') app
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('map_players', 'map_near', 'map_pair_ok', 'map_anchor_may_move') order by 1;
--
-- (b) What map_players answers with (expect it to end in "open_until timestamp with time zone, mutual boolean"):
-- select pg_get_function_result('public.map_players(double precision, double precision, double precision, double precision)'::regprocedure);
--
-- (c) Nobody is shown to someone who is not their friend from farther than 80 km of where "near" is measured from for them (expect 0):
-- select count(*) from public.last_seen v join public.last_seen o on o.user_id <> v.user_id
--   left join public.map_anchors a on a.user_id = v.user_id
--   where public.map_pair_ok(v.user_id, o.user_id, o.visibility) and not public.follow_each_other(v.user_id, o.user_id)
--     and (a.lat is null or public.km_between(a.lat, a.lng, o.lat, o.lng) > 80);
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
--
-- (g) Someone on Only me, or suspended, sees no stranger (expect 0):
-- select count(*) from public.last_seen v join public.last_seen o on o.user_id <> v.user_id
--   join public.profiles pv on pv.id = v.user_id
--   where (v.visibility = 'none' or pv.suspended_at is not null)
--     and public.map_pair_ok(v.user_id, o.user_id, o.visibility) and not public.follow_each_other(v.user_id, o.user_id);
--
-- (h) Repeated far jumps leave where "near" is measured from where it was:
--     twenty jumps a minute apart, each 220 km further from a spot in New
--     York that never moved (expect t):
-- select bool_and(not public.map_anchor_may_move(40.71, -74.01, k / 60.0, 0, 40.71 + 2 * k, -74.01)) from generate_series(1, 20) k;
--
-- (i) Nobody made more than four big moves in a day (expect 0), and how many have a place to measure from (just a number to look at):
-- select count(*) filter (where jumps > 4) too_many, count(*) filter (where lat is not null) placed from public.map_anchors;
