-- Undo 210: check_in_at_court exactly as it was before (admins counted toward 6 a day again).

CREATE OR REPLACE FUNCTION public.check_in_at_court(p_court text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_minutes integer DEFAULT NULL::integer)
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
  -- How long you are here, as you chose it (migration 204): 30 minutes to 4 hours; an app that does not say, 2 hours.
  ends timestamptz := now() + case when p_minutes is null then interval '2 hours' else make_interval(mins => least(240, greatest(30, p_minutes))) end;
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

notify pgrst, 'reload schema';
