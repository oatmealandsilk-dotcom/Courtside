-- CourtSide · undo for migration 20261025000187_flexible_hits.
--
-- NOT A MIGRATION (it lives outside supabase/migrations on purpose). Run it in
-- the Supabase SQL editor as one piece only to take "Flexible" hits back out
-- of the database's hands. All-or-nothing; safe to run more than once.
--
-- It removes the guard_hit_place trigger and its function, puts hit_when (53),
-- tell_hit_matches_open (76) and tell_map_about_hit (109) back word for word
-- (checked below by the md5 of each body), and removes hit_point and
-- private.flexible_area.
--
-- Hits already posted with no court stay as they are: every app shows them as
-- a place that was only typed ("Court flexible · near Cary"), with no pin and
-- no court page; the newer app still reads them as flexible. The last,
-- optional statement (commented out) takes their rough areas off as well.
--
-- The app keeps working after it: a flexible hit posted afterwards is kept as
-- the app sends it (a town-sized square, 0.05°, never finer), it gets only
-- same-name match alerts (as a typed place always has), and its time in
-- alerts is read as Eastern.

begin;

drop trigger if exists guard_hit_place on public.hit_requests;
drop function if exists public.guard_hit_place();

create or replace function public.hit_when(starts timestamptz, place jsonb)
returns text language plpgsql stable as $$
declare
  lat double precision := nullif(place->>'lat', '')::double precision;
  lng double precision := nullif(place->>'lng', '')::double precision;
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

create or replace function public.tell_hit_matches_open()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  poster public.profiles;
  lat1 double precision := nullif(new.place->>'lat', '')::double precision;
  lng1 double precision := nullif(new.place->>'lng', '')::double precision;
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
    where h.id <> new.id and h.author_id <> new.author_id and not h.cancelled
      and h.starts_at > now()
      and abs(extract(epoch from (h.starts_at - new.starts_at))) <= 2 * 3600
      and (h.format = new.format or 'hit' in (h.format, new.format))
      and public.known_adult(h.author_id)
      and not public.is_blocked_between(h.author_id, new.author_id)
      and public.hit_is_open(h.id)
      and (
        (lat1 is not null and nullif(h.place->>'lat', '') is not null
          and public.km_between(lat1, lng1, (h.place->>'lat')::double precision, (h.place->>'lng')::double precision) <= 25)
        or lower(btrim(coalesce(h.place->>'name', ''))) = lower(btrim(coalesce(new.place->>'name', '')))
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

create or replace function public.tell_map_about_hit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
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
    lat1 := nullif(new.place->>'lat', '')::double precision;
    lng1 := nullif(new.place->>'lng', '')::double precision;
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
          '/map?hit=' || new.id || '&lat=' || lat1 || '&lng=' || lng1) then sent := true; end if;
      end loop;
    end if;
    if sent then perform public.note_fanout(new.author_id, 'hit:' || new.id); end if;
  exception when others then
    raise warning 'map alerts for hit %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop function if exists private.flexible_area(uuid, double precision, double precision);
drop function if exists public.hit_point(jsonb);

do $$
declare
  expected constant text[][] := array[
    ['hit_when',              '06f1cabf5543d6ab4d82d6665a1d90e2'],
    ['tell_hit_matches_open', '2f8e066e7294930d02e029ba167999a5'],
    ['tell_map_about_hit',    '281db33a3247e05422be20ffe41a6f62']
  ];
  i int;
begin
  for i in 1 .. array_length(expected, 1) loop
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]
          and md5(p.prosrc) = expected[i][2]) <> 1 then
      raise exception 'Undo of 187 stopped: % did not go back as it was. Nothing was changed.', expected[i][1];
    end if;
  end loop;
  if exists (select 1 from pg_trigger where tgrelid = 'public.hit_requests'::regclass and tgname = 'guard_hit_place')
     or to_regprocedure('public.hit_point(jsonb)') is not null
     or to_regprocedure('private.flexible_area(uuid, double precision, double precision)') is not null
     or to_regprocedure('public.guard_hit_place()') is not null then
    raise exception 'Undo of 187 stopped: something did not go. Nothing was changed.';
  end if;
end $$;

-- Optional: take the rough areas off hits already posted with no court
-- (they keep their name and town). Remove the leading "-- " to include it.
-- update public.hit_requests set place = place - 'area' where place->>'flexible' = 'true' and place ? 'area';

commit;
