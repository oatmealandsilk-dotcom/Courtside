-- CourtSide · migration 20261029000203: "I'm playing here" at a club's court.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. All-or-nothing:
-- if a check fails, it stops and nothing at all changes. Safe to run more
-- than once. Undo: supabase/rollback/203_undo.sql.
--
-- Why (owner, Oct 29), on saying "I'm playing here" from a court's card on
-- the map: "Also like it shouldn't matter if it's a club, if your playing
-- there your playing there right?" Until now the server refused "I'm playing
-- here" ('closed_court') at a members-only court (a club's) and at a private
-- one (someone's home court). From this migration it refuses only the home
-- court.
--
-- Why someone's home court stays refused: a private court is a court in
-- somebody's back garden. Saying you are playing there would put a pin, a
-- count and a lit-up court on a person's house for everyone near it to see.
-- A club is a public place of its own; a home is not.
--
-- What changes, and nothing else:
--   * check_in_at_court: 'closed_court' only when the court is private
--     (was members or private). Every other rule is word for word as it was:
--     adults only, a yes to "Who can see you on the map?" first (191), within
--     5 km of the court, 2 hours, 6 courts a day, one court at a time.
--   * map_players: a friend checked in at a club's court has their pin on
--     that court, as at any other (was left where their phone was). Still
--     only friends who follow each other with you, as since migration 189.
--
-- Left as they are: court_right_now (it never looked at who may play there,
-- so a club's court counts and lights up like any other once people check in
-- there), Most active courts and every other function, table, grant and rule.
-- Teens still never check in anywhere. Nothing is ever automatic: each
-- check-in is a tap in the app (Apple 5.1.2(i)).

begin;

-- ------------------------------------------------------------------ 0. check
-- Both functions are exactly as they were live on Oct 29 (the md5 of their
-- bodies), or already as this file makes them (run twice), so nothing written
-- since is overwritten.
do $$
declare
  bad text;
begin
  select string_agg(w.sig, ', ') into bad
    from (values
      ('public.check_in_at_court(text, double precision, double precision)', '{70bef71b3e1fefc4f1ebac5058f8beee,69aa7d46ac7c1843b28e3262306b2bad}'::text[]),
      ('public.map_players(double precision, double precision, double precision, double precision)', '{49fb7a103fb049738296b64a5de0abf1,d41ca670950bc59309e65dce033a9f27}'::text[])
    ) as w(sig, md5s)
   where not exists (select 1 from pg_proc p where p.oid = to_regprocedure(w.sig) and md5(p.prosrc) = any (w.md5s));
  if bad is not null then
    raise exception 'Migration 203 stopped before changing anything: % changed since Oct 29. Ask Claude to look.', bad;
  end if;
end $$;

-- ------------------------------------------ 1. "I'm playing here": any court but a home
CREATE OR REPLACE FUNCTION public.check_in_at_court(p_court text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
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
  -- A yes to "Who can see you on the map?" first (migration 191, Apple 5.1.2(i)): no answer is not a yes.
  if not exists (select 1 from public.user_state where user_id = me and map_visibility in ('nearby', 'mutuals')) then
    if exists (select 1 from public.user_state where user_id = me and map_visibility = 'none') then raise exception 'hidden'; end if;
    raise exception 'ask_first';
  end if;
  select * into c from public.courts where id = p_court;
  if c.id is null then raise exception 'court?'; end if;
  -- Any court but someone's home (migration 203, Oct 29: a club's members-only court is fine; owner: "if your playing there your playing there").
  if c.access = 'private' then raise exception 'closed_court'; end if;
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
end $function$;

-- ------------------------------------- 2. a friend at a club's court shows on that court
CREATE OR REPLACE FUNCTION public.map_players(min_lat double precision DEFAULT NULL::double precision, min_lng double precision DEFAULT NULL::double precision, max_lat double precision DEFAULT NULL::double precision, max_lng double precision DEFAULT NULL::double precision)
 RETURNS TABLE(user_id uuid, lat double precision, lng double precision, place text, court_id text, court_name text, city text, seen_at timestamp with time zone, open_until timestamp with time zone, mutual boolean, until timestamp with time zone)
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
$function$;

-- ------------------------------------------------------------------ 3. check again
do $$
begin
  if md5((select prosrc from pg_proc where oid = to_regprocedure('public.check_in_at_court(text, double precision, double precision)'))) <> '69aa7d46ac7c1843b28e3262306b2bad'
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.map_players(double precision, double precision, double precision, double precision)'))) <> 'd41ca670950bc59309e65dce033a9f27' then
    raise exception 'Migration 203 stopped: a function did not come out as written. Nothing changed.';
  end if;
  if not has_function_privilege('authenticated', 'public.check_in_at_court(text, double precision, double precision)', 'execute')
     or not has_function_privilege('authenticated', 'public.map_players(double precision, double precision, double precision, double precision)', 'execute')
     or has_function_privilege('anon', 'public.check_in_at_court(text, double precision, double precision)', 'execute')
     or has_function_privilege('anon', 'public.map_players(double precision, double precision, double precision, double precision)', 'execute') then
    raise exception 'Migration 203 stopped: who may call the functions changed. Nothing changed.';
  end if;
end $$;

commit;
