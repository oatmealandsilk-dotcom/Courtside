-- CourtSide · migration 20261025000187: a hit with no court yet ("Flexible").
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. All-or-nothing:
-- if a check fails, it stops and nothing at all changes. Safe to run more
-- than once. Undo: supabase/rollback/187_undo.sql.
--
-- What it is for (the owner, Oct 25): "When you say looking for a hit, maybe
-- there should also be an option to put like TBD … basically like we don't
-- have to choose a court right now." Looking for a hit gets a "Flexible"
-- choice beside the courts: the hit goes up with no court, and whoever joins
-- picks one with the poster in the hit's chat.
--
-- No new column. A flexible hit's place (the jsonb it already has) is
--   { "flexible": true, "name": "Court flexible · near Cary", "near": "Cary",
--     "area": { "lat": 35.8, "lng": -78.8 } }
-- with no court id and no lat/lng, so older apps (the store build included)
-- show it as a place that was only typed, called "Court flexible · near Cary":
-- no pin, no court page. The hit's chat is "Hit · Court flexible · near Cary".
--
-- Privacy. The area only ever says roughly where the hit is, so players
-- nearby can be told and the Open hits list can say "near Cary · 3 mi". It
-- is never where anyone lives:
--   * The app sends a point already rounded to a town-sized square (0.05°,
--     about 5 km). This file never keeps that point: a trigger rebuilds the
--     whole place from scratch (guard_hit_place), and the area becomes, for
--     everyone alike (adults, teens, any map setting):
--       - their profile town's point when it is within 40 km, rounded to
--         0.05°, else the app's point rounded again to 0.05° here;
--       - nothing known at all: the hit is refused (flexible_needs_area).
--     Never the map's rough spot (last_seen): a hit is read by every signed-in
--     account (teens too, who never see an adult's spot on the map) and it
--     stays up after Location is turned off, when the map spot is gone.
--   * A hit at a court can never carry an area: the same trigger strips
--     "flexible", "near" and "area" from every other place.
--   * Teen rules are unchanged: a teen's hit is still seen only by the people
--     who follow them (the "hits are visible" rule, 109), and no alert ever
--     goes out about it (both alert functions stop at known_adult).
--   * A shared link never carries the area (share_preview, 108, sends only a
--     place's id, name, lat and lng), nor does the signed-out peek (163: only
--     hits at a real court).
--
-- What changes:
--   1. public.hit_point(place): a hit's point, its court's spot or, for a
--      flexible hit, its rough area. Pure, reads no table.
--   2. private.flexible_area(u, lat, lng): the rules above. Only the trigger
--      calls it (nobody signed in or out can).
--   3. guard_hit_place: before a hit is posted, or its place changed. An
--      update that leaves the place as it is does nothing (calling off,
--      opening, joining, the chat link never touch the area).
--   4. hit_when (53): "today at 6:30 PM" in the hit's own time zone, now
--      also for a flexible hit (from its area; before, Eastern).
--   5. tell_hit_matches_open (76): matches and open-to-hit players within
--      25 km of a flexible hit's area too; two flexible hits never match
--      just because both are called "Court flexible".
--   6. tell_map_about_hit (109): players within 25 km of a flexible hit's
--      area are told as for any hit; their alert opens the hit's own page
--      (/hit-request/<id>), as there is no court to show on the map.
-- Every other line of 4, 5 and 6 is word for word as live (checked below).
--
-- ------------------------------------------------------------- HOW TO RUN IT
-- Supabase -> SQL Editor -> New query, paste this whole file, press Run.
-- "Success. No rows returned" means it is in. Anything else: nothing was
-- changed; the message says why.

begin;

-- ------------------------------------------------------------------ 0. checks
-- Stop before changing anything if the live database is not the shape this
-- file was written against (Oct 25). md5 of each function's body as live,
-- or this file's own (it carries the words flexible_hits_187) on a second run.
do $$
declare
  expected constant text[][] := array[
    ['hit_when',              '06f1cabf5543d6ab4d82d6665a1d90e2'],
    ['tell_hit_matches_open', '2f8e066e7294930d02e029ba167999a5'],
    ['tell_map_about_hit',    '281db33a3247e05422be20ffe41a6f62']
  ];
  i int;
  wrong text[] := '{}';
begin
  if to_regclass('public.hit_requests') is null or to_regclass('public.last_seen') is null
     or to_regclass('public.profiles') is null then
    raise exception 'Migration 187 stopped before changing anything: hit_requests (43), last_seen (46) and profiles have to be there first.';
  end if;
  if to_regprocedure('public.known_adult(uuid)') is null
     or to_regprocedure('public.km_between(double precision, double precision, double precision, double precision)') is null
     or to_regprocedure('public.miles_text(double precision)') is null then
    raise exception 'Migration 187 stopped before changing anything: it needs known_adult (109), km_between (53) and miles_text (60).';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public'
        and table_name = 'profiles' and column_name in ('city_lat', 'city_lng')) <> 2 then
    raise exception 'Migration 187 stopped before changing anything: profiles.city_lat/city_lng (49) is missing.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]) <> 1
       or exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]
                  and md5(p.prosrc) <> expected[i][2] and position('flexible_hits_187' in p.prosrc) = 0) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 187 stopped before changing anything: % changed after Oct 25. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
  -- Names this file makes must be free, or already its own.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where (n.nspname, p.proname) in (('public', 'hit_point'), ('public', 'guard_hit_place'), ('private', 'flexible_area'))
               and position('flexible_hits_187' in p.prosrc) = 0) then
    raise exception 'Migration 187 stopped before changing anything: hit_point, guard_hit_place or private.flexible_area already exists and is not this file''s.';
  end if;
end $$;

-- ------------------------------------------------------------- 1. hit_point
-- A hit's point: the place's own lat/lng (a court, as before), else a
-- flexible hit's rough area. Reads no table, so it is as safe as km_between.
create or replace function public.hit_point(place jsonb, out p_lat double precision, out p_lng double precision)
language sql immutable as $$
  -- flexible_hits_187
  select
    case when nullif(place->>'lat', '') is not null or nullif(place->>'lng', '') is not null
           then nullif(place->>'lat', '')::double precision
         when place->>'flexible' = 'true' and jsonb_typeof(place->'area'->'lat') = 'number' and jsonb_typeof(place->'area'->'lng') = 'number'
           then (place->'area'->>'lat')::double precision end,
    case when nullif(place->>'lat', '') is not null or nullif(place->>'lng', '') is not null
           then nullif(place->>'lng', '')::double precision
         when place->>'flexible' = 'true' and jsonb_typeof(place->'area'->'lat') = 'number' and jsonb_typeof(place->'area'->'lng') = 'number'
           then (place->'area'->>'lng')::double precision end
$$;

-- ------------------------------------------------------ 2. flexible_area
-- Where a flexible hit is said to be, roughly (see the top of this file).
create schema if not exists private;
create or replace function private.flexible_area(u uuid, hint_lat double precision, hint_lng double precision,
  out area_lat double precision, out area_lng double precision)
language plpgsql stable security definer set search_path = public as $$
declare
  -- flexible_hits_187
  hinted boolean := hint_lat is not null and hint_lng is not null
    and hint_lat between -90 and 90 and hint_lng between -180 and 180;
  clat double precision;
  clng double precision;
begin
  area_lat := null;
  area_lng := null;
  -- Everyone alike, adults and teens, whatever their map setting: a town-sized
  -- square, never the map's rough spot (a hit is read by every signed-in
  -- account and outlives Location off). Their profile's town when it is near
  -- (or nothing else is known), else the point the app sent, rounded again here.
  select p.city_lat, p.city_lng into clat, clng from public.profiles p where p.id = u;
  if clat is not null and clng is not null and (not hinted or public.km_between(hint_lat, hint_lng, clat, clng) <= 40) then
    area_lat := (round((clat * 20)::numeric) / 20)::double precision;
    area_lng := (round((clng * 20)::numeric) / 20)::double precision;
    return;
  end if;
  if hinted then
    area_lat := (round((hint_lat * 20)::numeric) / 20)::double precision;
    area_lng := (round((hint_lng * 20)::numeric) / 20)::double precision;
  end if;
end $$;
revoke all on function private.flexible_area(uuid, double precision, double precision) from public, anon, authenticated;

-- ------------------------------------------------------ 3. guard_hit_place
-- Runs after guard_hit_audience and before guard_hit_request (triggers of
-- one kind run in name order). The rule on who may post or change a hit is
-- unchanged.
create or replace function public.guard_hit_place()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- flexible_hits_187
  who uuid;
  town text;
  hlat double precision;
  hlng double precision;
  a record;
begin
  if tg_op = 'UPDATE' and new.place is not distinct from old.place then return new; end if;
  -- Not an object: the table's own check refuses it.
  if new.place is null or jsonb_typeof(new.place) <> 'object' then return new; end if;
  if new.place->>'flexible' = 'true' then
    who := case when tg_op = 'UPDATE' then old.author_id else new.author_id end;
    -- The town's name: before its first comma, letters, spaces and . ' - only, at most 40 characters.
    town := nullif(btrim(left(btrim(regexp_replace(
              regexp_replace(split_part(coalesce(new.place->>'near', ''), ',', 1), '[^[:alpha:][:space:].''-]', '', 'g'),
              '\s+', ' ', 'g')), 40)), '');
    -- The app's point, only as a hint (it is never kept).
    if jsonb_typeof(new.place->'area') = 'object' and jsonb_typeof(new.place->'area'->'lat') = 'number'
       and jsonb_typeof(new.place->'area'->'lng') = 'number' then
      hlat := (new.place->'area'->>'lat')::double precision;
      hlng := (new.place->'area'->>'lng')::double precision;
    end if;
    select * into a from private.flexible_area(who, hlat, hlng);
    if a.area_lat is null or a.area_lng is null then raise exception 'flexible_needs_area'; end if;
    -- Built from scratch: nothing else the app sent is kept (no id, lat or lng).
    new.place := jsonb_build_object(
        'flexible', true,
        'name', 'Court flexible' || coalesce(' ' || chr(183) || ' near ' || town, ''),
        'area', jsonb_build_object('lat', a.area_lat, 'lng', a.area_lng))
      || case when town is not null then jsonb_build_object('near', town) else '{}'::jsonb end;
  else
    -- A court or a typed place never carries an area.
    new.place := new.place - 'flexible' - 'area' - 'near';
  end if;
  return new;
end $$;
revoke all on function public.guard_hit_place() from public, anon, authenticated;
drop trigger if exists guard_hit_place on public.hit_requests;
create trigger guard_hit_place before insert or update of place on public.hit_requests
  for each row execute function public.guard_hit_place();

-- ------------------------------------------------------------ 4. hit_when
-- As migration 53, its point from hit_point.
create or replace function public.hit_when(starts timestamptz, place jsonb)
returns text language plpgsql stable as $$
declare
  -- flexible_hits_187: the point from hit_point (a court's spot, else a flexible hit's rough area).
  lat double precision := (public.hit_point(place)).p_lat;
  lng double precision := (public.hit_point(place)).p_lng;
  tz text;
  d date;
  today date;
begin
  tz := case
    when lng is null then 'America/New_York'
    when lat < 23 and lng < -154 then 'Pacific/Honolulu'
    when lat > 51 and lng < -129 then 'America/Anchorage'
    when lng >= -87.5 then 'America/New_York'
    when lng >= -101.5 then 'America/Chicago'
    when lng >= -114.5 then 'America/Denver'
    else 'America/Los_Angeles' end;
  d := (starts at time zone tz)::date;
  today := (now() at time zone tz)::date;
  return case when d = today then 'today' when d = today + 1 then 'tomorrow' else to_char(starts at time zone tz, 'FMDay') end
    || ' at ' || to_char(starts at time zone tz, 'FMHH12:MI AM');
end $$;

-- ------------------------------------------------- 5. tell_hit_matches_open
-- As migration 76: its points from hit_point, and a same-name match only
-- between two hits that are not flexible.
create or replace function public.tell_hit_matches_open()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- flexible_hits_187
  poster public.profiles;
  lat1 double precision := (public.hit_point(new.place)).p_lat;
  lng1 double precision := (public.hit_point(new.place)).p_lng;
  sys text;
  words text;
  r record;
  told_poster boolean := false;
begin
  if new.cancelled or new.starts_at < now() then return new; end if;
  select * into poster from public.profiles where id = new.author_id;
  if not found or not public.known_adult(new.author_id) then return new; end if;
  sys := poster.profile->>'skillSystem';
  words := public.hit_when(new.starts_at, new.place) || ' · ' || coalesce(new.place->>'name', 'a court');

  -- Others with an open hit of their own, much like this one: closest in time first.
  for r in
    select h.id, h.author_id, h.starts_at, h.place
    from public.hit_requests h
    join public.profiles p on p.id = h.author_id
    cross join lateral public.hit_point(h.place) hp
    where h.id <> new.id and h.author_id <> new.author_id and not h.cancelled
      and h.starts_at > now()
      and abs(extract(epoch from (h.starts_at - new.starts_at))) <= 2 * 3600
      and (h.format = new.format or 'hit' in (h.format, new.format))
      and public.known_adult(h.author_id)
      and not public.is_blocked_between(h.author_id, new.author_id)
      and public.hit_is_open(h.id)
      and (
        (lat1 is not null and hp.p_lat is not null
          and public.km_between(lat1, lng1, hp.p_lat, hp.p_lng) <= 25)
        or (coalesce(new.place->>'flexible', '') <> 'true' and coalesce(h.place->>'flexible', '') <> 'true'
          and lower(btrim(coalesce(h.place->>'name', ''))) = lower(btrim(coalesce(new.place->>'name', ''))))
      )
      and (
        h.level_min is null or new.level_min is null
        or coalesce(p.profile->>'skillSystem', '') is distinct from coalesce(sys, '')
        or (h.level_min <= new.level_max and new.level_min <= h.level_max)
      )
    order by abs(extract(epoch from (h.starts_at - new.starts_at)))
    limit 10
  loop
    perform public.file_notification(r.author_id, new.author_id, 'hit-match', new.id::text, 'hit-request', words, true);
    if not told_poster then
      perform public.file_notification(new.author_id, r.author_id, 'hit-match', r.id::text, 'hit-request',
        public.hit_when(r.starts_at, r.place) || ' · ' || coalesce(r.place->>'name', 'a court'), true);
      told_poster := true;
    end if;
  end loop;

  -- Ring on today, near the court, at a level the hit asks for.
  if lat1 is not null then
    for r in
      select p.id
      from public.profiles p
      left join public.last_seen s on s.user_id = p.id
      where p.id <> new.author_id
        and p.open_to_hit_until > now()
        and public.known_adult(p.id)
        and coalesce(s.lat, p.city_lat) is not null
        and public.km_between(lat1, lng1, coalesce(s.lat, p.city_lat), coalesce(s.lng, p.city_lng)) <= 25
        and not public.is_blocked_between(p.id, new.author_id)
        and (
          new.level_min is null
          or (coalesce(p.profile->>'skillSystem', '') = coalesce(sys, '')
              and nullif(p.profile->>'rating', '')::numeric between new.level_min and new.level_max)
        )
        and not exists (select 1 from public.notifications n where n.user_id = p.id and n.kind = 'hit-match' and n.target_id = new.id::text)
      order by public.km_between(lat1, lng1, coalesce(s.lat, p.city_lat), coalesce(s.lng, p.city_lng))
      limit 25
    loop
      perform public.file_notification(r.id, new.author_id, 'hit-match', new.id::text, 'hit-request', words, true);
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.tell_hit_matches_open() from public, anon, authenticated;

-- ---------------------------------------------------- 6. tell_map_about_hit
-- As migration 109: its point from hit_point; a flexible hit's alert opens
-- the hit's own page (there is no court to show on the map).
create or replace function public.tell_map_about_hit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- flexible_hits_187
  lat1 double precision;
  lng1 double precision;
  c public.courts;
  whenx text;
  r record;
  sent boolean := false;
begin
  if new.cancelled or new.starts_at < now() then return new; end if;
  if not public.known_adult(new.author_id) then return new; end if;
  if not public.fanout_allowed(new.author_id, 'hit:' || new.id) then return new; end if;
  begin
    lat1 := (public.hit_point(new.place)).p_lat;
    lng1 := (public.hit_point(new.place)).p_lng;
    whenx := public.hit_when(new.starts_at, new.place);
    select * into c from public.courts where id = new.place->>'id';
    if c.id is not null then
      for r in
        select f.user_id from public.court_follows f
        where f.court_id = c.id and f.user_id <> new.author_id
          and not exists (select 1 from public.notifications n where n.user_id = f.user_id and n.kind = 'hit-match' and n.target_id = new.id::text)
        order by f.user_id limit 500
      loop
        if public.send_map_alert(r.user_id, new.author_id, 'court-activity', c.id, 'court',
          'New hit at ' || coalesce(c.name, 'your court') || ' · ' || whenx,
          'New hit at ' || coalesce(c.name, 'a court you follow'),
          upper(left(whenx, 1)) || substr(whenx, 2),
          public.court_link(c.id, c.name, c.lat, c.lng) || '&hit=' || new.id) then sent := true; end if;
      end loop;
    end if;
    if lat1 is not null and lng1 is not null then
      for r in
        select x.id, x.km from (
          select s.user_id as id, public.km_between(lat1, lng1, s.lat, s.lng) as km
          from public.last_seen s
          where s.user_id <> new.author_id and s.seen_at > now() - interval '30 days'
            and s.lat between lat1 - 0.5 and lat1 + 0.5
            and public.km_between(lat1, lng1, s.lat, s.lng) <= 25
            and public.known_adult(s.user_id)
            and not exists (select 1 from public.notifications n where n.user_id = s.user_id and n.kind = 'hit-match' and n.target_id = new.id::text)
            and (c.id is null or not exists (select 1 from public.court_follows f where f.user_id = s.user_id and f.court_id = c.id))
          order by 2 limit 50) x
        order by x.id
      loop
        if public.send_map_alert(r.id, new.author_id, 'map-new-hit', new.id::text, 'hit-request',
          public.miles_text(r.km) || ' from you · ' || whenx,
          'New open hit ' || public.miles_text(r.km) || ' from you',
          upper(left(whenx, 1)) || substr(whenx, 2) || ' · ' || coalesce(new.place->>'name', 'a court'),
          case when new.place->>'flexible' = 'true' then '/hit-request/' || new.id
               else '/map?hit=' || new.id || '&lat=' || lat1 || '&lng=' || lng1 end) then sent := true; end if;
      end loop;
    end if;
    if sent then perform public.note_fanout(new.author_id, 'hit:' || new.id); end if;
  exception when others then
    raise warning 'map alerts for hit %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

-- ------------------------------------------------------------ 7. after-checks
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.hit_requests'::regclass and tgname = 'guard_hit_place' and not tgisinternal) then
    raise exception 'Migration 187 stopped: the guard_hit_place trigger is not on hit_requests. Nothing was changed.';
  end if;
  if has_function_privilege('authenticated', 'private.flexible_area(uuid, double precision, double precision)', 'execute')
     or has_function_privilege('anon', 'private.flexible_area(uuid, double precision, double precision)', 'execute') then
    raise exception 'Migration 187 stopped: players could call private.flexible_area. Nothing was changed.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where (n.nspname, p.proname) in (('public', 'guard_hit_place'), ('private', 'flexible_area'), ('public', 'tell_hit_matches_open'), ('public', 'tell_map_about_hit'))
               and (not p.prosecdef or not coalesce(p.proconfig, '{}') @> array['search_path=public'])) then
    raise exception 'Migration 187 stopped: a function lost SECURITY DEFINER or its search_path. Nothing was changed.';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where (n.nspname, p.proname) in (('public', 'hit_point'), ('private', 'flexible_area'), ('public', 'guard_hit_place'),
                                        ('public', 'hit_when'), ('public', 'tell_hit_matches_open'), ('public', 'tell_map_about_hit'))
         and position('flexible_hits_187' in p.prosrc) > 0) <> 6 then
    raise exception 'Migration 187 stopped: not every function is this file''s. Nothing was changed.';
  end if;
  -- RLS stays on.
  if not (select relrowsecurity from pg_class where oid = 'public.hit_requests'::regclass) then
    raise exception 'Migration 187 stopped: row level security is off on hit_requests. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 8. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
--
-- (a) It is in (expect true, false, false):
-- select exists (select 1 from pg_trigger where tgname = 'guard_hit_place') as trigger_on,
--        has_function_privilege('authenticated', 'private.flexible_area(uuid, double precision, double precision)', 'execute') as players_can,
--        has_function_privilege('anon', 'private.flexible_area(uuid, double precision, double precision)', 'execute') as anon_can;
--
-- (b) Flexible hits so far (never more than a town and a rough area):
-- select id, starts_at, place->>'name' as name, place->'area' as area, cancelled
--   from public.hit_requests where place->>'flexible' = 'true' order by created_at desc limit 20;
--
-- (c) No court hit carries an area (expect 0):
-- select count(*) from public.hit_requests where coalesce(place->>'flexible', '') <> 'true' and (place ? 'area' or place ? 'near');
