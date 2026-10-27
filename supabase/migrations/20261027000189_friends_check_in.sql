-- CourtSide · migration 20261027000189: the map is friends only, and you show
-- on it only when you tap Check in.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. All-or-nothing:
-- if a check fails, it stops and nothing at all changes. Safe to run more
-- than once. Undo: supabase/rollback/189_undo.sql.
--
-- Why (Apple, Oct 27, Guideline 5.1.2(i): "The app enables the display of
-- nearby users' locations on a map"). To stay 13+ the owner chose (Oct 26):
-- "you show up on the map if your friends with eachother, and if you want to
-- hit at a court, you pin it and on the map you will show up like i want to
-- hit here". And (Oct 26) a check-in lasts until 10pm that day.
--
-- What changes:
--   1. A person's pin is only ever shown to friends who follow each other
--      with them, for everyone (adults too). map_pair_ok drops its "Players
--      nearby" branch; map_players no longer looks at anyone but you and
--      your friends; the map's box is ignored. Teens: unchanged (friends
--      only, only once they turned it on, only their rough area).
--   2. Nothing is shared automatically any more. A spot reaches the server
--      only through check_in_on_map(lat, lng, city, until), which the app
--      calls once when you tap Check in. It needs a yes to "Can friends see
--      your check-ins?" (map_visibility 'mutuals', or 'nearby' from before),
--      and lasts until the time the phone sends (10pm that day, or 2 hours
--      after 8pm), held between 15 minutes and 16 hours from now. After that
--      the spot is not served anywhere, and the 15-minute sweep deletes it.
--      check_out_of_map() takes it away at once (and any "I'm playing here").
--      mark_last_seen, which older versions of the app call on their own,
--      now does nothing.
--   3. Every spot stored before this runs was shared automatically, so they
--      all go now (exact spots too). Court visits (Flyby) are no longer
--      wiped each time a check-in ends: only Location off (forget_last_seen)
--      and Only me / Not now still wipe them.
--   4. "I'm playing here" (check_in_at_court) takes the phone's position as
--      proof you are at the court (within 5 km, as before) and never keeps
--      it; the pin is the court. Older apps that send only the court still
--      work while they have a live map check-in. Strangers see only a count
--      at a court (2 or more settled adults), never a face; friends see your
--      name there. Anyone who has not turned the map off counts.
--   5. spot_shown_to (the rule behind the table's read policy, alerts and
--      the rest) also needs the check-in to be live.
--   6. A court's card names only friends who follow each other with you
--      ("Sam and Dev, friends, play here", court_people_you_follow); before,
--      anyone you follow. Strangers are never named or shown at a court on
--      the map: only counts ("2 playing") and open hits ("Hit 5pm").
--   7. A teen's open hit, and a teen joining one, show only to friends who
--      follow each other with them (private.hit_shown_to_you,
--      private.join_shown_to_you); before, to anyone following them, which
--      on a public teen account could be a stranger.
--
-- Left as they are: court_checkins (2 hours), hits and their pins (always a
-- court), new_on_courtside, the alerts' own rules, map_near/map_anchors
-- (unused now, kept for the undo).

begin;

-- ------------------------------------------------------------------ 0. check
do $$
begin
  if to_regclass('public.last_seen') is null or to_regclass('public.exact_spots') is null
     or to_regclass('public.court_checkins') is null or to_regclass('public.court_visits') is null
     or to_regclass('public.map_anchors') is null or to_regclass('public.court_checkin_days') is null
     or to_regprocedure('public.map_players(double precision, double precision, double precision, double precision)') is null
     or to_regprocedure('public.mark_last_seen(double precision, double precision, text)') is null
     or to_regprocedure('public.map_pair_ok(uuid, uuid, text)') is null
     or to_regprocedure('public.spot_shown_to(uuid, uuid)') is null
     or to_regprocedure('public.minor_shares_spot(uuid)') is null
     or to_regprocedure('public.map_cell(uuid, double precision, double precision)') is null
     or to_regprocedure('public.map_cell_box(uuid, integer, integer)') is null
     or to_regprocedure('public.map_rough(uuid, integer, integer, date)') is null
     or to_regprocedure('public.court_at(double precision, double precision)') is null
     or to_regprocedure('public.coarse_day(timestamp with time zone)') is null
     or to_regprocedure('public.sweep_court_status()') is null
     or to_regprocedure('public.court_people_you_follow(text[])') is null
     or to_regprocedure('private.hit_shown_to_you(uuid)') is null or to_regprocedure('private.join_shown_to_you(uuid, uuid)') is null or to_regprocedure('public.follow_each_other(uuid, uuid)') is null
     or (to_regprocedure('public.check_in_at_court(text)') is null
         and to_regprocedure('public.check_in_at_court(text, double precision, double precision)') is null) then
    raise exception 'Migration 189 stopped before changing anything: migrations 46, 60, 63, 78, 98 and 130 have to run first.';
  end if;
end $$;

-- ------------------------------------------------- 1. how long a check-in lasts
alter table public.last_seen add column if not exists until timestamptz;
comment on column public.last_seen.until is
  'When this check-in stops being shown (migration 189). Null or past: never served, and swept away.';

-- A spot going no longer wipes court visits (check-ins end every day now).
-- Location off (forget_last_seen, below) and Only me (the user_state trigger) still do.
drop trigger if exists forget_court_visits on public.last_seen;

-- ------------------------------------- 2. every automatically shared spot goes
delete from public.last_seen;
update public.exact_spots set lat = null, lng = null, court_id = null where lat is not null or court_id is not null;
update public.map_anchors set lat = null, lng = null where lat is not null;

-- ----------------------------------------------- 3. friends only, for everyone
create or replace function public.map_pair_ok(viewer uuid, owner uuid, vis text) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and owner is not null and viewer <> owner
    and coalesce(vis, 'nearby') <> 'none'
    and not public.is_blocked_between(viewer, owner)
    and not exists (select 1 from public.profiles p where p.id in (viewer, owner) and p.suspended_at is not null)
    and public.follow_each_other(viewer, owner)
    and case
      when public.known_adult(viewer) and public.known_adult(owner) then true
      else (public.known_adult(owner) or public.minor_shares_spot(owner))
        and not public.map_hushed(viewer, owner)
    end
$$;

create or replace function public.spot_shown_to(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and owner is not null and (
    (viewer = owner and exists (select 1 from public.last_seen where user_id = owner))
    or (viewer <> owner and exists (
      select 1 from public.last_seen s
      where s.user_id = owner and s.visibility <> 'none' and s.until > now()
        and public.map_pair_ok(viewer, owner, s.visibility))))
$$;

-- ------------------------------------------------------------- 4. the map
-- One more column, `until`: when your own check-in ends (only on your own row).
drop function if exists public.map_players(double precision, double precision, double precision, double precision);
create function public.map_players(min_lat double precision default null, min_lng double precision default null,
                                   max_lat double precision default null, max_lng double precision default null)
returns table(user_id uuid, lat double precision, lng double precision, place text, court_id text, court_name text,
              city text, seen_at timestamptz, open_until timestamptz, mutual boolean, until timestamptz)
language sql stable security definer set search_path = public as $$
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
    left join public.courts kc on kc.id = k.court_id and kc.access not in ('members', 'private')
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
$$;
revoke all on function public.map_players(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.map_players(double precision, double precision, double precision, double precision) to authenticated, service_role;

-- ------------------------------------------------------- 5. Check in, Check out
create or replace function public.check_in_on_map(p_lat double precision, p_lng double precision,
                                                  p_city text default null, p_until timestamptz default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  st public.user_state;
  prev public.exact_spots;
  sharing boolean;
  shown boolean;
  ends timestamptz;
  stamp bigint := floor(extract(epoch from now()))::bigint;
  -- About 250 m: how far outside a recent square you may go and keep it (as mark_last_seen did).
  m_lat constant double precision := 0.00225;
  m_lng double precision;
  e record;
  b record;
  pick_i integer;
  pick_j integer;
  keep jsonb := '[]'::jsonb;
  rough record;
begin
  if me is null then raise exception 'not signed in'; end if;
  -- (NaN counts as larger than any number, so it fails these too.)
  if p_lat is null or p_lng is null or not (abs(p_lat) <= 90) or not (abs(p_lng) <= 180) then raise exception 'where?'; end if;
  if exists (select 1 from public.profiles where id = me and suspended_at is not null) then raise exception 'suspended'; end if;
  select * into st from public.user_state where user_id = me;
  -- A yes to "Can friends see your check-ins?" first; a teen's must be their own (map_answered_at).
  if coalesce(st.map_visibility, '') not in ('nearby', 'mutuals')
     or (not public.known_adult(me) and not public.minor_shares_spot(me)) then
    raise exception 'ask_first';
  end if;
  ends := least(greatest(coalesce(p_until, now() + interval '2 hours'), now() + interval '15 minutes'), now() + interval '16 hours');

  select * into prev from public.exact_spots where user_id = me for update;
  -- Exact only for a known adult; a teen's friends see their rough area (migration 78).
  sharing := public.known_adult(me);
  shown := coalesce(st.show_activity, true);
  m_lng := m_lat / greatest(cos(radians(p_lat)), 0.2);
  -- The rough square, as mark_last_seen chose it: a recent one you are in or near, else the one you are in now.
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
  insert into public.last_seen (user_id, lat, lng, city, seen_at, show_activity, visibility, until)
  values (me, rough.lat, rough.lng, left(nullif(btrim(p_city), ''), 80),
    case when shown then now() else public.coarse_day(now()) end, shown, st.map_visibility, ends)
  on conflict (user_id) do update
    set lat = excluded.lat, lng = excluded.lng, city = excluded.city, seen_at = excluded.seen_at,
        show_activity = excluded.show_activity, visibility = excluded.visibility, until = excluded.until;
  return ends;
end $$;
revoke all on function public.check_in_on_map(double precision, double precision, text, timestamptz) from public, anon;
grant execute on function public.check_in_on_map(double precision, double precision, text, timestamptz) to authenticated, service_role;

-- Check out: off the map at once, and out of any court too (friends saw you there by name).
create or replace function public.check_out_of_map() returns void
language sql security definer set search_path = public as $$
  update public.exact_spots set lat = null, lng = null, court_id = null where user_id = auth.uid();
  delete from public.last_seen where user_id = auth.uid();
  delete from public.court_checkins where user_id = auth.uid();
$$;
revoke all on function public.check_out_of_map() from public, anon;
grant execute on function public.check_out_of_map() to authenticated, service_role;

-- Older versions of the app call this by themselves, on a timer: it shares nothing now.
create or replace function public.mark_last_seen(p_lat double precision, p_lng double precision, p_city text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  return;
end $$;

-- Location off: everything, court visits too (the trigger that did that is gone).
create or replace function public.forget_last_seen() returns void
language sql security definer set search_path = public as $$
  delete from public.exact_spots where user_id = auth.uid();
  delete from public.last_seen where user_id = auth.uid();
  delete from public.court_checkins where user_id = auth.uid();
  delete from public.court_visits where user_id = auth.uid();
  update public.map_anchors set lat = null, lng = null where user_id = auth.uid();
$$;

-- --------------------------------------------- 6. "I'm playing here", at a court
drop function if exists public.check_in_at_court(text);
create or replace function public.check_in_at_court(p_court text, p_lat double precision default null, p_lng double precision default null)
returns timestamptz
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
end $$;
revoke all on function public.check_in_at_court(text, double precision, double precision) from public, anon;
grant execute on function public.check_in_at_court(text, double precision, double precision) to authenticated, service_role;

-- Who is playing at a court: a count for anyone (2 or more settled adults), names only for friends.
-- Everyone checked in who has not turned the map off counts (no more "Players nearby" choice).
create or replace function public.court_right_now(ids text[])
returns table(court_id text, status text, status_at timestamptz, playing integer, friend_ids uuid[], you_here boolean)
language sql stable security definer set search_path = public as $$
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
      and coalesce(us.map_visibility, 'nearby') <> 'none'
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
$$;

-- "Players nearby" is gone: an older app asking for it gets friends only.
create or replace function public.set_map_visibility(v text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  adult boolean;
begin
  if me is null then raise exception 'not signed in'; end if;
  if v is null or v not in ('nearby', 'mutuals', 'none') then raise exception 'visibility?'; end if;
  adult := public.known_adult(me);
  if v = 'nearby' then v := 'mutuals'; end if;
  perform set_config('courtside.map_state', 'on', true);
  insert into public.user_state (user_id, map_visibility, map_answered_at) values (me, v, case when adult then null else now() end)
    on conflict (user_id) do update set map_visibility = excluded.map_visibility,
      map_answered_at = case when adult then public.user_state.map_answered_at else now() end;
  perform set_config('courtside.map_state', 'off', true);
  -- Not now: any live check-in goes at once.
  if v = 'none' then
    delete from public.last_seen where user_id = me;
    update public.exact_spots set lat = null, lng = null, court_id = null where user_id = me;
  end if;
  return v;
end $$;

-- "Sam and Dev, friends, play here" on a court's card: only friends who follow each other with you
-- (was: anyone you follow). Nobody else is ever named at a court from their past posts and hits.
create or replace function public.court_people_you_follow(ids text[])
returns table(court_id text, user_ids uuid[])
language sql stable security definer set search_path = public as $$
  with wanted as (select distinct x as id from unnest(ids[1:50]) as x where x is not null),
  acts as (
    select p.court_id as cid, p.author_id as uid, p.created_at as at from public.posts p
    where p.court_id in (select id from wanted) and p.created_at > now() - interval '90 days' and not p.archived and p.removed_at is null
    union all
    select h.place->>'id', h.author_id, h.created_at from public.hit_requests h
    where h.place->>'id' in (select id from wanted) and h.created_at > now() - interval '90 days' and not h.cancelled
      and (h.audience = 'everyone' or public.hit_reaches(auth.uid(), h.id))
    union all
    select h.place->>'id', j.user_id, j.created_at from public.hit_joins j join public.hit_requests h on h.id = j.hit_id
    where h.place->>'id' in (select id from wanted) and j.created_at > now() - interval '90 days' and not h.cancelled
      and (h.audience = 'everyone' or public.hit_reaches(auth.uid(), h.id))
  ), people as (
    select a.cid, a.uid, max(a.at) as last from acts a
    where a.uid <> auth.uid()
      and public.follow_each_other(auth.uid(), a.uid)
      and public.shows_at_court(auth.uid(), a.uid)
    group by a.cid, a.uid
  )
  select cid, (array_agg(uid order by last desc))[1:5] from people group by cid
$$;

-- A teen's open hit (court and time) and a teen joining one: only for friends who follow each other
-- with them (was: anyone who follows them, which a public teen account cannot vet). Adults: unchanged.
create or replace function private.hit_shown_to_you(hit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.hit_requests h
    where h.id = hit and (
      h.author_id = auth.uid()
      or public.known_adult(h.author_id)
      or public.follow_each_other(auth.uid(), h.author_id)
      or exists (select 1 from public.hit_joins j where j.hit_id = h.id and j.user_id = auth.uid())))
$$;

create or replace function private.join_shown_to_you(hit uuid, who uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.hit_joins j join public.hit_requests h on h.id = j.hit_id
    where j.hit_id = hit and j.user_id = who and (
      who = auth.uid()
      or h.author_id = auth.uid()
      or public.known_adult(who)
      or public.follow_each_other(who, auth.uid())))
$$;

-- ------------------------------------------- 7. the 15-minute sweep takes ended check-ins
create or replace function public.sweep_court_status() returns void
language sql security definer set search_path = public as $$
  delete from public.court_status where created_at < now() - interval '90 minutes';
  delete from public.court_checkins where until < now();
  delete from public.court_checkin_days where day < current_date - 1;
  update public.exact_spots x set lat = null, lng = null, court_id = null
    where x.lat is not null and not exists (select 1 from public.last_seen s where s.user_id = x.user_id and s.until > now());
  delete from public.last_seen where until is null or until <= now();
$$;

-- ------------------------------------------------------------------ 8. check
do $$
begin
  if exists (select 1 from public.last_seen where until is null or until <= now()) then
    raise exception 'Migration 189 stopped: a spot without a live check-in is still there. Nothing was changed.';
  end if;
  if to_regprocedure('public.check_in_at_court(text)') is not null then
    raise exception 'Migration 189 stopped: the old check_in_at_court(text) is still there. Nothing was changed.';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.last_seen'::regclass and tgname = 'forget_court_visits') then
    raise exception 'Migration 189 stopped: forget_court_visits is still on last_seen. Nothing was changed.';
  end if;
  if has_function_privilege('anon', 'public.check_in_on_map(double precision, double precision, text, timestamp with time zone)', 'execute')
     or has_function_privilege('anon', 'public.map_players(double precision, double precision, double precision, double precision)', 'execute')
     or has_function_privilege('anon', 'public.check_out_of_map()', 'execute')
     or has_function_privilege('anon', 'public.check_in_at_court(text, double precision, double precision)', 'execute')
     or not has_function_privilege('authenticated', 'public.check_in_on_map(double precision, double precision, text, timestamp with time zone)', 'execute') then
    raise exception 'Migration 189 stopped: wrong grants on the new functions. Nothing was changed.';
  end if;
end $$;

commit;
