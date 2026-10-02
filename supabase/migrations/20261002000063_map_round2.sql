-- 63: the map, round 2 (the database side).
--
-- NOT APPLIED — needs the owner's OK. This file has not been run on the live
-- database. Until it runs, the app keeps today's map: everyone shown to
-- about a kilometre, nobody can choose who sees them, and New on CourtSide
-- is worked out on the phone.
--
-- What it does (the owner's decisions, Oct 2: "Courts and followers exact"),
-- with the privacy review's fixes (Oct 2, evening):
--
-- 1. Where your pin goes, decided here for each person looking, never on
--    the phone:
--      * for people you follow who follow you back: exactly where you were,
--        or on the court you were at (a public or pay court within about
--        60 m of you);
--      * for everyone else: about a kilometre away, except while you have
--        said "I'm playing here" at a court and are really there: then on
--        that court, for two hours at most;
--      * nothing finer than about a kilometre for anyone until you have
--        answered "Who can see you on the map?". Everyone sharing today
--        (and every older version of the app, which cannot ask) stays
--        exactly as before this file.
--    Why strangers need the check-in (the review, Oct 2): 9 in 10 courts the
--    map knows have no answer on who may play there (many are in back yards
--    or apartment blocks), and anyone living near a park court would show
--    "at the court" every evening from home.
--    The rough spot is the middle of a square about 1 km across, nudged by a
--    fixed amount that changes once a day. The squares are laid out
--    differently for each person (a secret the server keeps), and the square
--    you were last in sticks while you stay within about 250 m of it, so
--    someone living near the edge of a square does not flip between two
--    squares each time the app opens (which, read often enough, gave away
--    where the edge, and so the home, was).
--    Your exact spot is kept in its own table (exact_spots) that only you
--    can read, and only while you share it. The old table (last_seen, which
--    phones on older versions read) only ever holds the rough spot. The map
--    reads people through one function, map_players, for one part of the
--    map at a time (never the whole world in one go), and it applies every
--    rule here.
-- 2. "Who can see you on the map?": Players nearby, Only people you follow
--    back, or Only me. Kept in your private settings, and enforced here for
--    new and old versions of the app alike. Only me also covers "I'm
--    playing here": no check-in, and no count or name at a court. Turning
--    Location off still deletes your spot.
-- 3. Unchanged: only adults are on the map and only adults see it (a teen,
--    or anyone with no age on file, is never shown and sees only their own
--    pin); a block hides both people from each other; someone who hides
--    their activity status has no "2h ago" (and now the table older phones
--    read says only the day, never the time).
-- 4. The alerts that open the map ("Dev (you follow) is up for a hit
--    today", "A new player shared their spot near you") now go only to
--    people who may see that player on the map, and only ever carry the
--    rough spot.
-- 5. Who's up today: map_players says until when each player shown is open
--    to a hit today, so the row is built only from pins you may see.
-- 6. New on CourtSide: who joined in the last two weeks, decided here:
--    known adults, 16 and 17 year olds whose account is public, and anyone
--    you already follow who is an adult or 16 or 17. Never anyone under 16
--    or with no age on file. Someone not known to be an adult sees only the
--    people they follow. Never anyone you are blocked with, and never a
--    suspended account.
--
-- Needs 08, 13, 21, 23, 31, 46, 47, 53 and 60 (all live).
-- Safe to run more than once.

-- ============================================================ 1. who can see you on the map
-- Null: never chosen yet (the app shows "Who can see you on the map?"), and
-- treated exactly as before this file: about a kilometre for everyone who
-- may see you, nothing finer kept.
alter table public.user_state
  add column if not exists map_visibility text check (map_visibility in ('nearby', 'mutuals', 'none'));

-- A copy on each spot, so the rule on last_seen (read directly by older
-- versions of the app) can apply it without reading anyone's settings.
-- (Never chosen copies as 'nearby': who may see you is as before.)
alter table public.last_seen
  add column if not exists visibility text not null default 'nearby' check (visibility in ('nearby', 'mutuals', 'none'));

-- Your choice, from the first-time screen or Settings → Privacy. Returns it.
create or replace function public.set_map_visibility(v text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if v is null or v not in ('nearby', 'mutuals', 'none') then raise exception 'visibility?'; end if;
  insert into public.user_state (user_id, map_visibility) values (me, v)
    on conflict (user_id) do update set map_visibility = excluded.map_visibility;
  return v;
end $$;
revoke all on function public.set_map_visibility(text) from public, anon;
grant execute on function public.set_map_visibility(text) to authenticated;

-- The day a time falls on (midnight, UTC): all the table older phones read
-- says about when someone was last seen, for someone who hides it.
create or replace function public.coarse_day(t timestamptz) returns timestamptz
language sql immutable set search_path = public as $$
  select date_trunc('day', t at time zone 'utc') at time zone 'utc'
$$;
revoke all on function public.coarse_day(timestamptz) from public, anon, authenticated;

-- ============================================================ 2. your spot, yours alone
-- One row per player with a spot:
--   lat, lng: exactly where you were (to about 10 m), kept only while you
--     share it finely: a known adult who chose Players nearby or Only
--     people you follow back. Empty otherwise (never chosen, Only me, a
--     teen, no age on file).
--   court_id: the public or pay court you were at (within about 60 m), if
--     any; empty whenever lat is.
--   seen_at: when you were really last seen (last_seen may only say the
--     day, for someone who hides their activity status).
--   cells: the squares your rough spot used lately (newest first, at most
--     8, none older than 30 days), so it sticks while you stay near one.
create table if not exists public.exact_spots (
  user_id  uuid primary key references public.profiles(id) on delete cascade,
  lat      double precision check (lat between -90 and 90),
  lng      double precision check (lng between -180 and 180),
  court_id text references public.courts(id) on delete set null,
  seen_at  timestamptz not null default now(),
  cells    jsonb not null default '[]'::jsonb
);
alter table public.exact_spots alter column lat drop not null;
alter table public.exact_spots alter column lng drop not null;
alter table public.exact_spots add column if not exists cells jsonb not null default '[]'::jsonb;
alter table public.exact_spots enable row level security;
drop policy if exists "your own exact spot" on public.exact_spots;
create policy "your own exact spot" on public.exact_spots for select to authenticated using (user_id = auth.uid());
-- Read your own row; nothing else, ever. Written only by mark_last_seen.
revoke all on public.exact_spots from public, anon, authenticated;
grant select on public.exact_spots to authenticated;
-- Never sent out live (Supabase's realtime), not even to its owner.
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'exact_spots') then
    alter publication supabase_realtime drop table public.exact_spots;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'last_seen') then
    alter publication supabase_realtime drop table public.last_seen;
  end if;
end $$;

-- last_seen: read only through its rule (below); written only by the two
-- functions. (Before: the app's roles still held write rights the rule
-- refused; now they are gone too.)
revoke insert, update, delete, truncate, references, trigger on public.last_seen from public, anon, authenticated;

-- Someone already hiding their activity status: the time others can read
-- becomes just the day, and the real time is kept with their own row.
insert into public.exact_spots (user_id, seen_at)
  select s.user_id, s.seen_at from public.last_seen s where not s.show_activity
  on conflict (user_id) do nothing;
update public.last_seen set seen_at = public.coarse_day(seen_at)
  where not show_activity and seen_at <> public.coarse_day(seen_at);

-- A change to who can see you, or to showing your activity status, reaches
-- your spot at once (however the settings were saved). Choosing Only me (or
-- clearing the choice) drops the exact spot, its court and any check-in.
create or replace function public.sync_spot_settings() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  shown boolean := coalesce(new.show_activity, true);
  vis text := coalesce(new.map_visibility, 'nearby');
  real_at timestamptz;
begin
  if new.map_visibility is null or new.map_visibility = 'none' then
    update public.exact_spots set lat = null, lng = null, court_id = null where user_id = new.user_id and lat is not null;
  end if;
  if new.map_visibility = 'none' then
    delete from public.court_checkins where user_id = new.user_id;
  end if;
  select x.seen_at into real_at from public.exact_spots x where x.user_id = new.user_id;
  update public.last_seen s
     set visibility = vis, show_activity = shown,
         seen_at = case when shown then coalesce(real_at, s.seen_at) else public.coarse_day(coalesce(real_at, s.seen_at)) end
   where s.user_id = new.user_id
     and (s.visibility, s.show_activity, s.seen_at) is distinct from
         (vis, shown, case when shown then coalesce(real_at, s.seen_at) else public.coarse_day(coalesce(real_at, s.seen_at)) end);
  return null;
end $$;
revoke all on function public.sync_spot_settings() from public, anon, authenticated;
drop trigger if exists sync_spot_settings on public.user_state;
create trigger sync_spot_settings after insert or update of map_visibility, show_activity on public.user_state
  for each row execute function public.sync_spot_settings();

-- ============================================================ 3. the rough spot and the court
-- A secret only the server knows, made once (running this file again keeps
-- it): it lays out each person's squares and their daily nudge, so nobody
-- can work out where anyone's squares begin and end.
create table if not exists public.map_salt (
  id   boolean primary key default true check (id),
  salt text not null
);
alter table public.map_salt enable row level security;
revoke all on public.map_salt from public, anon, authenticated;
insert into public.map_salt (id, salt)
  values (true, md5(random()::text || clock_timestamp()::text || random()::text) || md5(random()::text || clock_timestamp()::text))
  on conflict (id) do nothing;

-- Where a person's squares sit: shifted by a fixed, secret fraction of a
-- square north–south (oy) and east–west (ox).
create or replace function public.map_grid(u uuid, out oy double precision, out ox double precision)
language sql stable security definer set search_path = public as $$
  select (('x' || substr(h, 1, 8))::bit(32)::bigint / 4294967296.0)::double precision,
         (('x' || substr(h, 9, 8))::bit(32)::bigint / 4294967296.0)::double precision
  from (select md5((select salt from public.map_salt) || '|grid|' || u::text) as h) x
$$;
revoke all on function public.map_grid(uuid) from public, anon, authenticated;

-- The square (row ci, column cj) a spot is in, in that person's own layout.
-- A square: 0.01° of latitude (about 1.1 km) tall, the same distance wide.
create or replace function public.map_cell(u uuid, lat double precision, lng double precision, out ci integer, out cj integer)
language sql stable security definer set search_path = public as $$
  with g as (select * from public.map_grid(u)),
  r as (select floor(lat / 0.01 - g.oy)::integer as ci, g.oy, g.ox from g),
  w as (select r.ci, r.ox, 0.01 / greatest(cos(radians((r.ci + 0.5 + r.oy) * 0.01)), 0.2) as step from r)
  select w.ci, floor(lng / w.step - w.ox)::integer from w
$$;
revoke all on function public.map_cell(uuid, double precision, double precision) from public, anon, authenticated;

-- A square's edges.
create or replace function public.map_cell_box(u uuid, ci integer, cj integer,
  out lat0 double precision, out lat1 double precision, out lng0 double precision, out lng1 double precision)
language sql stable security definer set search_path = public as $$
  with g as (select * from public.map_grid(u)),
  w as (select g.oy, g.ox, 0.01 / greatest(cos(radians((ci + 0.5 + g.oy) * 0.01)), 0.2) as step from g)
  select (ci + w.oy) * 0.01, (ci + 1 + w.oy) * 0.01, (cj + w.ox) * w.step, (cj + 1 + w.ox) * w.step from w
$$;
revoke all on function public.map_cell_box(uuid, integer, integer) from public, anon, authenticated;

-- The rough spot for a square on a given day: its middle, nudged up to 0.3
-- of a square each way by an amount fixed for that person and day. Nothing
-- in it depends on where inside the square they were.
create or replace function public.map_rough(u uuid, ci integer, cj integer, d date, out lat double precision, out lng double precision)
language sql stable security definer set search_path = public as $$
  with b as (select * from public.map_cell_box(u, ci, cj)),
  h as (select md5((select salt from public.map_salt) || '|day|' || u::text || '|' || d::text) as h)
  select
    least(90::double precision, greatest(-90::double precision, round(((b.lat0 + b.lat1) / 2
      + ((('x' || substr(h.h, 1, 8))::bit(32)::bigint / 4294967296.0) - 0.5) * 0.6 * (b.lat1 - b.lat0))::numeric, 5)::double precision)),
    least(180::double precision, greatest(-180::double precision, round(((b.lng0 + b.lng1) / 2
      + ((('x' || substr(h.h, 9, 8))::bit(32)::bigint / 4294967296.0) - 0.5) * 0.6 * (b.lng1 - b.lng0))::numeric, 5)::double precision))
  from b, h
$$;
revoke all on function public.map_rough(uuid, integer, integer, date) from public, anon, authenticated;

-- The rough spot for wherever someone is on a given day, from the square
-- that spot is in (no stickiness: mark_last_seen adds that).
drop function if exists public.map_fuzz(uuid, double precision, double precision, date);
create function public.map_fuzz(u uuid, lat double precision, lng double precision, d date,
  out fuzz_lat double precision, out fuzz_lng double precision)
language sql stable security definer set search_path = public as $$
  select r.lat, r.lng from public.map_cell(u, lat, lng) c, public.map_rough(u, c.ci, c.cj, d) r
$$;
revoke all on function public.map_fuzz(uuid, double precision, double precision, date) from public, anon, authenticated;

-- The court someone is at: the nearest public or pay court within 60 m.
-- Never one with no answer on who may play there (most courts the map knows
-- are: many in back yards and apartment blocks), a club's or someone's home.
create or replace function public.court_at(p_lat double precision, p_lng double precision) returns text
language sql stable security definer set search_path = public as $$
  select c.id from public.courts c
  where c.lat between p_lat - 0.0006 and p_lat + 0.0006
    and c.lng between p_lng - 0.0006 / greatest(cos(radians(p_lat)), 0.2) and p_lng + 0.0006 / greatest(cos(radians(p_lat)), 0.2)
    and c.access in ('public', 'pay')
    and public.km_between(p_lat, p_lng, c.lat, c.lng) <= 0.06
  order by public.km_between(p_lat, p_lng, c.lat, c.lng), c.id
  limit 1
$$;
revoke all on function public.court_at(double precision, double precision) from public, anon, authenticated;

-- ============================================================ 4. sharing a spot, and Location off
-- Same name and inputs as before (older versions of the app call it). The
-- exact spot goes to exact_spots (only while shared finely), the rough one
-- to last_seen.
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
end $$;
revoke all on function public.mark_last_seen(double precision, double precision, text) from public, anon;
grant execute on function public.mark_last_seen(double precision, double precision, text) to authenticated;

-- Location off: the exact spot, the rough spot, the squares and any check-in all go.
create or replace function public.forget_last_seen()
returns void language sql security definer set search_path = public as $$
  delete from public.exact_spots where user_id = auth.uid();
  delete from public.last_seen where user_id = auth.uid();
  delete from public.court_checkins where user_id = auth.uid();
$$;
revoke all on function public.forget_last_seen() from public, anon;
grant execute on function public.forget_last_seen() to authenticated;

-- ============================================================ 5. who sees whose spot
-- Whether `viewer` may see `owner` on the map at all: both known adults,
-- the owner has a spot, not blocked either way, and the owner's choice
-- allows it. Server only (asking it about anyone would tell who hides).
create or replace function public.spot_shown_to(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and owner is not null and (
    (viewer = owner and exists (select 1 from public.last_seen where user_id = owner))
    or (viewer <> owner and public.known_adult(viewer) and public.known_adult(owner) and exists (
      select 1 from public.last_seen s
      where s.user_id = owner and s.visibility <> 'none'
        and not public.is_blocked_between(viewer, owner)
        and (s.visibility = 'nearby' or public.follow_each_other(viewer, owner)))))
$$;
revoke all on function public.spot_shown_to(uuid, uuid) from public, anon, authenticated;

-- The same rule for reading last_seen directly (older versions of the app
-- do), written out so it needs nothing the app may not call. That table
-- only ever holds rough spots (and, for anyone hiding it, only the day).
drop policy if exists "adults see adults' last spot" on public.last_seen;
drop policy if exists "who sees a spot" on public.last_seen;
create policy "who sees a spot" on public.last_seen for select to authenticated using (
  user_id = auth.uid()
  or (
    visibility <> 'none'
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.age_group = 'adult')
    and exists (select 1 from public.profiles p where p.id = last_seen.user_id and p.age_group = 'adult')
    and not public.blocked_with(user_id)
    and (visibility = 'nearby' or (
      exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = last_seen.user_id)
      and exists (select 1 from public.follows f where f.follower_id = last_seen.user_id and f.following_id = auth.uid())))
  )
);

-- ============================================================ 6. what the map reads
-- Everyone you may see on the map, each where you may see them, in one part
-- of the map (its four corners; at most 2° tall and 2° wide round its
-- middle, about 220 km: a bigger view is cut down to that), most recent
-- first, up to 2,000. No view at all: only yourself (the app's way of
-- asking whether this function is here).
--   place: 'court'  on a court (court_id, court_name say which): for
--                   people who follow each other with them, the public or
--                   pay court they were within 60 m of; for anyone, the
--                   court they said "I'm playing here" at, while that lasts
--                   (two hours), they are within 150 m of it and their spot
--                   is from the last two hours;
--          'exact'  exactly where they were (you, and people who follow
--                   each other with you);
--          'approx' the rough spot, about a kilometre away.
--   Nothing but the rough spot for anyone who has not answered "Who can
--   see you on the map?" (their exact spot is never kept).
--   seen_at: null when they hide their activity status (never for yourself).
--   open_until: until when they are up for a hit today; null when not.
-- The view is matched against where each pin is shown, never where the
-- person really was, so a small box cannot be used to find anyone.
drop function if exists public.map_players(double precision, double precision, double precision, double precision);
create function public.map_players(min_lat double precision default null, min_lng double precision default null,
  max_lat double precision default null, max_lng double precision default null)
returns table (user_id uuid, lat double precision, lng double precision, place text, court_id text, court_name text,
  city text, seen_at timestamptz, open_until timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id, public.known_adult(auth.uid()) as adult),
  box as (
    select v.given,
      v.mlat - least(v.hlat, 1.0) as lat0, v.mlat + least(v.hlat, 1.0) as lat1,
      v.mlng - least(v.hlng, 1.0) as lng0, v.mlng + least(v.hlng, 1.0) as lng1
    from (select min_lat is not null and min_lng is not null and max_lat is not null and max_lng is not null as given,
            (min_lat + max_lat) / 2 as mlat, abs(max_lat - min_lat) / 2 as hlat,
            (min_lng + max_lng) / 2 as mlng, abs(max_lng - min_lng) / 2 as hlng) v
  ),
  shown as (
    select s.user_id, s.lat, s.lng, s.city, s.seen_at, s.show_activity, s.user_id = me.id as mine,
      (s.user_id = me.id or public.follow_each_other(me.id, s.user_id)) as close
    from public.last_seen s cross join me
    where me.id is not null and (
      s.user_id = me.id
      or (me.adult and s.visibility <> 'none'
          and public.known_adult(s.user_id)
          and not public.is_blocked_between(me.id, s.user_id)
          and (s.visibility = 'nearby' or public.follow_each_other(me.id, s.user_id))))
  ),
  placed as (
    select sh.user_id, sh.city, sh.show_activity, sh.mine, sh.seen_at, x.seen_at as real_at,
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
    select pl.user_id, pl.mine, pl.city,
      case pl.how when 'checkin' then pl.klat when 'court' then pl.clat when 'exact' then pl.xlat else pl.rlat end as lat,
      case pl.how when 'checkin' then pl.klng when 'court' then pl.clng when 'exact' then pl.xlng else pl.rlng end as lng,
      case pl.how when 'checkin' then 'court' when 'court' then 'court' when 'exact' then 'exact' else 'approx' end as place,
      case pl.how when 'checkin' then pl.kid when 'court' then pl.cid end as court_id,
      case pl.how when 'checkin' then pl.kname when 'court' then pl.cname end as court_name,
      case when pl.mine then coalesce(pl.real_at, pl.seen_at) when pl.show_activity then pl.seen_at end as seen_at
    from placed pl
  )
  select o.user_id, o.lat, o.lng, o.place, o.court_id, o.court_name, o.city, o.seen_at,
    case when p.open_to_hit_until > now() then p.open_to_hit_until end
  from pos o cross join box join public.profiles p on p.id = o.user_id
  where (box.given and o.lat between box.lat0 and box.lat1 and o.lng between box.lng0 and box.lng1)
     or (not box.given and o.mine)
  -- (Those who hide their activity status come last, so the order cannot tell when they were seen.)
  order by o.seen_at desc nulls last, o.user_id
  limit 2000
$$;
revoke all on function public.map_players(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.map_players(double precision, double precision, double precision, double precision) to authenticated;

-- ============================================================ 7. alerts that open the map
-- Migration 60's two alerts that point at a player's spot, each with one
-- line added: only people who may see that player on the map hear about
-- it. Both only ever use the rough spot (last_seen).

-- "Dev (you follow) is up for a hit today".
create or replace function public.tell_followers_up_for_hit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  spot public.last_seen;
  who text;
  r record;
  sent boolean := false;
  src text := 'up:' || current_date;
begin
  if new.open_to_hit_until is null or new.open_to_hit_until <= now() then return new; end if;
  if old.open_to_hit_until is not null and old.open_to_hit_until > now() then return new; end if;
  if new.age_group is distinct from 'adult' then return new; end if;
  select * into spot from public.last_seen where user_id = new.id;
  if spot.user_id is null then return new; end if;
  if not public.fanout_allowed(new.id, src) then return new; end if;
  who := coalesce(nullif(new.name, ''), new.handle);
  begin
    for r in
      select x.id, x.km from (
        select f.follower_id as id, public.km_between(spot.lat, spot.lng, s.lat, s.lng) as km
        from public.follows f
        join public.profiles p on p.id = f.follower_id and p.age_group = 'adult'
        join public.last_seen s on s.user_id = f.follower_id and s.seen_at > now() - interval '30 days'
        where f.following_id = new.id and public.km_between(spot.lat, spot.lng, s.lat, s.lng) <= 50
          and public.spot_shown_to(f.follower_id, new.id)
        order by 2 limit 200) x
      order by x.id
    loop
      if public.send_map_alert(r.id, new.id, 'map-friend-hit', new.id::text, 'profile',
        public.miles_text(r.km) || ' from you',
        who || ' (you follow) is up for a hit today',
        public.miles_text(r.km) || ' from you. See them on the map.',
        '/map?user=' || new.id || '&lat=' || spot.lat || '&lng=' || spot.lng) then sent := true; end if;
    end loop;
    if sent then perform public.note_fanout(new.id, src); end if;
  exception when others then
    raise warning 'map alerts for open-to-hit %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists tell_followers_up_for_hit on public.profiles;
create trigger tell_followers_up_for_hit after update of open_to_hit_until on public.profiles for each row execute function public.tell_followers_up_for_hit();

-- "A new player shared their spot near you".
create or replace function public.tell_adults_new_player() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  joined timestamptz;
  r record;
begin
  if not public.known_adult(new.user_id) then return new; end if;
  select created_at into joined from public.profiles where id = new.user_id;
  if joined is null or joined < now() - interval '14 days' then return new; end if;
  if exists (select 1 from public.notifications where actor_id = new.user_id and kind = 'map-new-player') then return new; end if;
  begin
    for r in
      select x.id, x.km from (
        select s.user_id as id, public.km_between(new.lat, new.lng, s.lat, s.lng) as km
        from public.last_seen s join public.profiles p on p.id = s.user_id and p.age_group = 'adult'
        where s.user_id <> new.user_id and s.seen_at > now() - interval '30 days'
          and public.km_between(new.lat, new.lng, s.lat, s.lng) <= 50
          and not exists (select 1 from public.notifications n where n.user_id = s.user_id and n.actor_id = new.user_id and n.kind = 'joined')
          and public.spot_shown_to(s.user_id, new.user_id)
        order by 2 limit 50) x
      order by x.id
    loop
      perform public.send_map_alert(r.id, new.user_id, 'map-new-player', new.user_id::text, 'profile',
        public.miles_text(r.km) || ' from you',
        'A new player shared their spot near you',
        public.miles_text(r.km) || ' from you. Say hi on the map.',
        '/map?lat=' || new.lat || '&lng=' || new.lng);
    end loop;
  exception when others then
    raise warning 'map alerts for new player %: %', new.user_id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists tell_adults_new_player on public.last_seen;
create trigger tell_adults_new_player after insert on public.last_seen for each row execute function public.tell_adults_new_player();

-- ============================================================ 7b. "I'm playing here" follows the choice
-- Migration 60's check-in, with two changes: someone who chose Only me
-- cannot check in ('hidden': nobody sees them on the map, so nobody sees
-- them at a court either), and "seen in the last 12 hours" reads the real
-- time (last_seen may only say the day, for someone who hides it).
create or replace function public.check_in_at_court(p_court text) returns timestamptz
language plpgsql security definer set search_path = public as $$
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
  if exists (select 1 from public.user_state where user_id = me and map_visibility = 'none') then raise exception 'hidden'; end if;
  select * into c from public.courts where id = p_court;
  if c.id is null then raise exception 'court?'; end if;
  if c.access in ('members', 'private') then raise exception 'closed_court'; end if;
  select * into spot from public.last_seen where user_id = me;
  if spot.user_id is null then raise exception 'location_off'; end if;
  select x.seen_at into real_at from public.exact_spots x where x.user_id = me;
  if coalesce(real_at, spot.seen_at) < now() - interval '12 hours' or public.km_between(spot.lat, spot.lng, c.lat, c.lng) > 5 then
    raise exception 'too_far';
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
end $$;
revoke all on function public.check_in_at_court(text) from public, anon;
grant execute on function public.check_in_at_court(text) to authenticated;

-- Migration 60's "right now at these courts", with who can see you on the
-- map applied to the players there: Only me is never counted or named;
-- Only people you follow back counts and names you only for them. The rest
-- is as before (a count only once two or more settled adults are there).
create or replace function public.court_right_now(ids text[])
returns table (court_id text, status text, status_at timestamptz, playing integer, friend_ids uuid[], you_here boolean)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id, public.known_adult(auth.uid()) as adult),
  wanted as (select distinct x as id from unnest(ids[1:50]) as x where x is not null),
  here as (
    select k.court_id, k.user_id, k.created_at, p.created_at < now() - interval '7 days' as settled,
      public.follow_each_other(me.id, k.user_id) as mutual
    from public.court_checkins k
    join public.profiles p on p.id = k.user_id and p.age_group = 'adult'
    left join public.user_state us on us.user_id = k.user_id
    cross join me
    where k.court_id in (select id from wanted) and k.until > now() and k.user_id <> me.id
      and coalesce(us.map_visibility, 'nearby') <> 'none'
      and (coalesce(us.map_visibility, 'nearby') = 'nearby' or public.follow_each_other(me.id, k.user_id))
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
$$;
revoke all on function public.court_right_now(text[]) from public, anon;
grant execute on function public.court_right_now(text[]) to authenticated;

-- ============================================================ 8. New on CourtSide
-- Who joined in the last `days` days (14 unless asked; 1 to 60), newest
-- first, up to 100, for the person asking:
--   * only ever known adults and 16 and 17 year olds (a birthday on file
--     saying so): never under 16, never a teen with no birthday on file,
--     never anyone with no age on file;
--   * of those, a known adult sees adults, 16 and 17 year olds whose
--     account is public, and anyone they already follow;
--   * anyone else (a teen, or no age on file) sees only people they follow;
--   * never yourself, never anyone you are blocked with, never a suspended
--     account.
create or replace function public.new_on_courtside(days integer default 14)
returns table (user_id uuid, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id, public.known_adult(auth.uid()) as adult)
  select p.id, p.created_at
  from public.profiles p cross join me
  left join public.user_state us on us.user_id = p.id
  where me.id is not null and p.id <> me.id
    and p.created_at >= now() - make_interval(days => least(greatest(coalesce(days, 14), 1), 60))
    and p.suspended_at is null
    and not public.is_blocked_between(me.id, p.id)
    and (p.age_group = 'adult' or (p.age_group = 'teen' and us.birth_date is not null and us.birth_date <= (current_date - interval '16 years')::date))
    and (
      exists (select 1 from public.follows f where f.follower_id = me.id and f.following_id = p.id)
      or (me.adult and (p.age_group = 'adult' or not p.is_private)))
  order by p.created_at desc, p.id
  limit 100
$$;
revoke all on function public.new_on_courtside(integer) from public, anon;
grant execute on function public.new_on_courtside(integer) to authenticated;

-- ============================================================ 9. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The new parts (expect exact_spots | t, map_salt | t, map_visibility | t, visibility | t):
-- select 'exact_spots', to_regclass('public.exact_spots') is not null
-- union all select 'map_salt', exists (select 1 from public.map_salt)
-- union all select 'map_visibility', exists (select 1 from information_schema.columns where table_name = 'user_state' and column_name = 'map_visibility')
-- union all select 'visibility', exists (select 1 from information_schema.columns where table_name = 'last_seen' and column_name = 'visibility');
--
-- (b) Who may call what (expect map_players, new_on_courtside, set_map_visibility: app true, anon false;
--     court_at, map_cell, map_fuzz, map_grid, map_rough, spot_shown_to: both false):
-- select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') app
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('map_players', 'new_on_courtside', 'set_map_visibility', 'court_at', 'map_cell', 'map_fuzz', 'map_grid', 'map_rough', 'spot_shown_to') order by 1;
--
-- (c) Exact spots are never sent out live (expect no rows):
-- select tablename from pg_publication_tables where tablename in ('exact_spots', 'last_seen');
--
-- (d) The one rule on each spot table (expect last_seen | who sees a spot, exact_spots | your own exact spot):
-- select tablename, policyname from pg_policies where tablename in ('last_seen', 'exact_spots') order by 1;
--
-- (e) No function name exists twice (expect no rows):
-- select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace group by 1 having count(*) > 1;
--
-- (f) Nobody's exact spot is kept yet (expect 0 until people answer "Who can see you on the map?"):
-- select count(*) from public.exact_spots where lat is not null;
