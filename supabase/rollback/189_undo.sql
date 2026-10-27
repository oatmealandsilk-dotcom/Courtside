-- CourtSide · undo for migration 20261027000189_friends_check_in.
--
-- NOT A MIGRATION (it lives outside supabase/migrations on purpose). Run it in
-- the Supabase SQL editor as one piece only to take the friends-only map and
-- Check in back out of the database. All-or-nothing; safe to run more than
-- once.
--
-- It puts back, word for word, what was live on Oct 26 before 189: map_pair_ok
-- (adults' "Players nearby"), spot_shown_to, map_players (no `until`),
-- mark_last_seen (the app's automatic sharing works again), forget_last_seen,
-- check_in_at_court(text), court_right_now, court_people_you_follow,
-- private.hit_shown_to_you, private.join_shown_to_you,
-- set_map_visibility and sweep_court_status; the trigger that wiped court visits with a spot; and it
-- removes check_in_on_map, check_out_of_map, the 3-argument
-- check_in_at_court and last_seen.until.
--
-- What it cannot put back: the spots 189 deleted (they come back as the app
-- sends them again). An app already on the Check in version keeps working
-- against this, except Check in itself (it finds no check_in_on_map and says
-- it isn't available yet) and "I'm playing here", which then needs a shared
-- spot again.

begin;

drop function if exists public.check_in_on_map(double precision, double precision, text, timestamptz);
drop function if exists public.check_out_of_map();
drop function if exists public.check_in_at_court(text, double precision, double precision);
drop function if exists public.map_players(double precision, double precision, double precision, double precision);

CREATE OR REPLACE FUNCTION public.map_pair_ok(viewer uuid, owner uuid, vis text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select viewer is not null and owner is not null and viewer <> owner
    and coalesce(vis, 'nearby') <> 'none'
    and not public.is_blocked_between(viewer, owner)
    and not exists (select 1 from public.profiles p where p.id in (viewer, owner) and p.suspended_at is not null)
    and case
      when public.known_adult(viewer) and public.known_adult(owner)
        then public.follow_each_other(viewer, owner) or coalesce(vis, 'nearby') = 'nearby'
      else (public.known_adult(owner) or public.minor_shares_spot(owner))
        and public.follow_each_other(viewer, owner)
        and not public.map_hushed(viewer, owner)
    end
$function$;

CREATE OR REPLACE FUNCTION public.spot_shown_to(viewer uuid, owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select viewer is not null and owner is not null and (
    (viewer = owner and exists (select 1 from public.last_seen where user_id = owner))
    or (viewer <> owner and exists (
      select 1 from public.last_seen s
      where s.user_id = owner and s.visibility <> 'none'
        and public.map_pair_ok(viewer, owner, s.visibility))))
$function$;

CREATE OR REPLACE FUNCTION public.map_players(min_lat double precision DEFAULT NULL::double precision, min_lng double precision DEFAULT NULL::double precision, max_lat double precision DEFAULT NULL::double precision, max_lng double precision DEFAULT NULL::double precision)
 RETURNS TABLE(user_id uuid, lat double precision, lng double precision, place text, court_id text, court_name text, city text, seen_at timestamp with time zone, open_until timestamp with time zone, mutual boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.mark_last_seen(p_lat double precision, p_lng double precision, p_city text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.forget_last_seen()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from public.exact_spots where user_id = auth.uid();
  delete from public.last_seen where user_id = auth.uid();
  delete from public.court_checkins where user_id = auth.uid();
  update public.map_anchors set lat = null, lng = null where user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.check_in_at_court(p_court text)
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
end $function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.court_people_you_follow(ids text[])
 RETURNS TABLE(court_id text, user_ids uuid[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = a.uid)
      and public.shows_at_court(auth.uid(), a.uid)
    group by a.cid, a.uid
  )
  select cid, (array_agg(uid order by last desc))[1:5] from people group by cid
$function$;

CREATE OR REPLACE FUNCTION private.hit_shown_to_you(hit uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and exists (
    select 1 from public.hit_requests h
    where h.id = hit and (
      h.author_id = auth.uid()
      or public.known_adult(h.author_id)
      or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = h.author_id)
      or exists (select 1 from public.hit_joins j where j.hit_id = h.id and j.user_id = auth.uid())))
$function$;

CREATE OR REPLACE FUNCTION private.join_shown_to_you(hit uuid, who uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and exists (
    select 1 from public.hit_joins j join public.hit_requests h on h.id = j.hit_id
    where j.hit_id = hit and j.user_id = who and (
      who = auth.uid()
      or h.author_id = auth.uid()
      or public.known_adult(who)
      or exists (select 1 from public.follows f where f.follower_id = who and f.following_id = auth.uid())))
$function$;

CREATE OR REPLACE FUNCTION public.set_map_visibility(v text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  adult boolean;
begin
  if me is null then raise exception 'not signed in'; end if;
  if v is null or v not in ('nearby', 'mutuals', 'none') then raise exception 'visibility?'; end if;
  adult := public.known_adult(me);
  if not adult and v = 'nearby' then v := 'mutuals'; end if;
  perform set_config('courtside.map_state', 'on', true);
  insert into public.user_state (user_id, map_visibility, map_answered_at) values (me, v, case when adult then null else now() end)
    on conflict (user_id) do update set map_visibility = excluded.map_visibility,
      map_answered_at = case when adult then public.user_state.map_answered_at else now() end;
  perform set_config('courtside.map_state', 'off', true);
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.sweep_court_status()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from public.court_status where created_at < now() - interval '90 minutes';
  delete from public.court_checkins where until < now();
  delete from public.court_checkin_days where day < current_date - 1;
$function$;

revoke all on function public.map_players(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.map_players(double precision, double precision, double precision, double precision) to authenticated, service_role;
revoke all on function public.check_in_at_court(text) from public, anon;
grant execute on function public.check_in_at_court(text) to authenticated, service_role;

drop trigger if exists forget_court_visits on public.last_seen;
create trigger forget_court_visits after delete on public.last_seen
  for each row execute function public.forget_court_visits();

alter table public.last_seen drop column if exists until;

do $$
begin
  if to_regprocedure('public.check_in_on_map(double precision, double precision, text, timestamp with time zone)') is not null
     or to_regprocedure('public.check_in_at_court(text)') is null
     or to_regprocedure('public.map_players(double precision, double precision, double precision, double precision)') is null
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'last_seen' and column_name = 'until') then
    raise exception 'Undo 189 stopped: something did not go back. Nothing was changed.';
  end if;
end $$;

commit;
