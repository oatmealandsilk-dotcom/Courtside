-- CourtSide · undo for migration 20261028000191_apple_map_audit.
--
-- NOT A MIGRATION (it lives outside supabase/migrations on purpose). Run it in
-- the Supabase SQL editor as one piece only to take 191 back out. All-or-
-- nothing; safe to run more than once.
--
-- It puts back, exactly as they were on Oct 27: every function 191 changed,
-- the posts trigger, and read access to the whole profiles table (town
-- position included, so the leak in the audit's #1 comes back with it).
--
-- It cannot bring back what 191 cleared: town positions past one decimal, the
-- place on 5 teens' posts, the old rough squares (exact_spots.cells). The
-- "Players nearby" answers stay Friends (the same thing since 189).

begin;

do $$
declare
  bad text;
begin
  select string_agg(w.sig, ', ') into bad
    from (values
    ('public.round_city_position()', '82b277a114dffc90db818ea6b7445d8f'),
    ('public.check_in_at_court(text, double precision, double precision)', '70bef71b3e1fefc4f1ebac5058f8beee'),
    ('public.court_right_now(text[])', '1f128ec9388cfbdf0f1747224e84df4a'),
    ('private.join_shown_to_you(uuid, uuid)', '07ac9581af25af3dfb1ff76fd078f660'),
    ('public.guard_post_court()', '1c79ac2e6169cb70521b5e9a87847a2e'),
    ('private.flexible_area(uuid, double precision, double precision)', '2dc07e1b4988fd495cfff5f32b3a3d15'),
    ('public.guard_hit_place()', '42294ff6972b7765a6dcba3e4925adeb'),
    ('public.push_for_notification()', '5d81017b02bec3c24b735b6489b7ccbf'),
    ('public.tell_adults_new_player()', '76a46bd9d39a7ce1e647a69d7d6ee18c'),
    ('public.sweep_court_status()', 'f25fe56feffb5dfc1c9e97eda7aae4dc'),
    ('public.check_out_of_map()', 'a04ca088654da224f481252d6a1b28c7'),
    ('public.open_to_hit_miles(uuid[])', '3c415b5a31be7dd82bf9a1f95ec0bb82'),
    ('public.flyby(text, date, integer)', '82a72023b3461e8755ff424c7364c7c3'),
    ('public.court_kings(text)', '7b30a2a6d6163d9bb0d0720237306a1c'),
    ('public.tell_map_about_hit()', '7497a5ee93de521f8ee306de7e3d2596')
    ) as w(sig, md5)
   where not exists (select 1 from pg_proc p where p.oid = to_regprocedure(w.sig) and md5(p.prosrc) in (w.md5, (select o.m from (values
    ('public.round_city_position()', '8c1600bc0b36f1d87a3bd0f1e781b685'),
    ('public.check_in_at_court(text, double precision, double precision)', 'b20efca8eacb8f1dd7ad84bee82e7a71'),
    ('public.court_right_now(text[])', 'b206b3f047bc78d39030cc504e8be1ca'),
    ('private.join_shown_to_you(uuid, uuid)', '1aebfa9a69dd8a28c406ab92a36e92d4'),
    ('public.guard_post_court()', '9911071b1987ce8215cb0568dbe52bc0'),
    ('private.flexible_area(uuid, double precision, double precision)', '18eaf861d8ee7560e89c873a445b1795'),
    ('public.guard_hit_place()', '608f4ee3f86420f130fc14ab0f9d9c29'),
    ('public.push_for_notification()', 'ed202ec0226addae82c3534a680b7e6b'),
    ('public.tell_adults_new_player()', '23900e6aa0a7e3ff561f27c64c397c83'),
    ('public.sweep_court_status()', 'c6cd91f4f6ece7c95819a2ee182a70bb'),
    ('public.check_out_of_map()', '62caa8b3afae04f854cd5289773bb92a'),
    ('public.open_to_hit_miles(uuid[])', '2b3e53b8ed18715017e79e01556c3996'),
    ('public.flyby(text, date, integer)', '977b3523e2e20da08a5321465e5dc629'),
    ('public.court_kings(text)', 'f24f129ac98403a543b2c0b62fce1c7d'),
    ('public.tell_map_about_hit()', 'b4061707020bbaee2d3b795a3e0e9618')
    ) as o(s, m) where o.s = w.sig)));
  if bad is not null then
    raise exception 'Undo 191 stopped before changing anything: % changed after migration 191. Ask Claude to look.', bad;
  end if;
end $$;

-- Read access to the whole profiles table, town position included, as before 191.
grant select on public.profiles to anon, authenticated;

-- The posts trigger as before (court columns only).
drop trigger if exists guard_post_court on public.posts;
create trigger guard_post_court before insert or update of court_id, court_name, court_lat, court_lng
  on public.posts for each row execute function public.guard_post_court();

-- Every function as it was on Oct 27.
CREATE OR REPLACE FUNCTION public.round_city_position()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.city_lat is not null then new.city_lat := round(new.city_lat::numeric, 2)::double precision; end if;
  if new.city_lng is not null then new.city_lng := round(new.city_lng::numeric, 2)::double precision; end if;
  return new;
end $function$;

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
      or public.follow_each_other(who, auth.uid())))
$function$;

CREATE OR REPLACE FUNCTION public.guard_post_court()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (new.court_id is not null or new.court_name is not null or new.court_lat is not null or new.court_lng is not null)
     and not public.known_adult(new.author_id) then
    new.court_id := null; new.court_name := null; new.court_lat := null; new.court_lng := null;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.flexible_area(u uuid, hint_lat double precision, hint_lng double precision, OUT area_lat double precision, OUT area_lng double precision)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.guard_hit_place()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.push_for_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  who text;
  what text;
  link text;
  likes_on boolean := true;
  coach_on boolean := true;
  hit_chat uuid;
begin
  if new.kind = 'coach-application' then
    perform public.send_push(new.user_id, 'CourtSide', new.preview, '/coach-apply');
    return new;
  end if;
  if new.kind = 'refund' then
    perform public.send_push(new.user_id, 'CourtSide', new.preview, '/coach-request/' || new.target_id);
    return new;
  end if;
  if new.kind = 'milestone' then
    select coalesce(push_likes, true) into likes_on from public.user_state where user_id = new.user_id;
    if likes_on is not false then
      perform public.send_push(new.user_id, 'Your post is taking off', 'It just passed ' || coalesce(new.preview, 'a milestone') || '.', '/post/' || new.target_id);
    end if;
    return new;
  end if;
  if new.kind = 'posted' or new.user_id = new.actor_id then return new; end if;
  -- A hit you were in, called off; someone in yours who can't make it (migration 151).
  if new.kind in ('hit-called-off', 'hit-left') then
    select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
    link := '/hit-request/' || new.target_id;
    if new.kind = 'hit-called-off' and new.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select h.conversation_id into hit_chat from public.hit_requests h where h.id = new.target_id::uuid;
      if hit_chat is not null and exists (select 1 from public.conversation_members m where m.conversation_id = hit_chat and m.user_id = new.user_id) then
        link := '/messages/' || hit_chat;
      end if;
    end if;
    -- chr(8217) is the curly apostrophe, written so it survives any copy and paste.
    perform public.send_push(new.user_id, 'CourtSide',
      coalesce(who, 'Someone') || case when new.kind = 'hit-called-off' then ' called off the hit' else ' can' || chr(8217) || 't make it' end
        || coalesce(' ' || nullif(btrim(new.preview), ''), ''), link);
    return new;
  end if;
  if new.kind = 'hit-match' then
    select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
    perform public.send_push(new.user_id, coalesce(who, 'Someone') || ' is also looking for a hit', coalesce(new.preview || '. ', '') || 'Message them?', '/hit-request/' || new.target_id);
    return new;
  end if;
  if new.kind = 'session-tag' then
    select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
    perform public.send_push(new.user_id, coalesce(who, 'Someone') || ' tagged you in a ' || case when new.preview = 'match' then 'match' else 'practice' end,
      'Accept or decline.', '/your-sessions?tag=' || new.target_id);
    return new;
  end if;
  if new.kind = 'report' then
    perform public.send_push(new.user_id, 'New report', coalesce(new.preview, 'Someone sent a report'), '/admin-reports');
    return new;
  end if;
  select coalesce(push_likes, true), coalesce(push_coach, true) into likes_on, coach_on from public.user_state where user_id = new.user_id;
  if new.kind in ('like', 'upvote', 'upvote-reply') and likes_on is false then return new; end if;
  if new.kind in ('coach-reply', 'coach-answer') and coach_on is false then return new; end if;
  -- "Sam just joined CourtSide near you" has its own switch (migration 146). The row
  -- still lands in Notifications; only the phone alert is left out.
  if new.kind = 'joined' and exists (select 1 from public.user_state where user_id = new.user_id and push_joined is false) then return new; end if;
  select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
  what := case new.kind
    when 'like' then 'liked your ' || case new.target_kind when 'hit' then 'instant' when 'question' then 'thread' else 'post' end
    when 'comment' then 'commented on your ' || case new.target_kind when 'hit' then 'instant' else 'post' end
    when 'comment-reply' then 'replied to your comment'
    -- A reply in someone else's thread answers your reply there, not your thread (migration 153, as the Notifications page says it).
    when 'answer' then case when exists (select 1 from public.questions q where q.id::text = new.target_id and q.author_id = new.user_id) then 'replied to your thread' else 'replied to your reply' end
    when 'coach-reply' then 'answered your question'
    when 'coach-answer' then 'answered your request'
    when 'booking' then 'booked you'
    when 'helpful' then 'found your reply helpful'
    when 'share' then 'shared your post'
    when 'follow' then 'started following you'
    when 'tag' then 'tagged you in a post'
    when 'follow-request' then 'asked to follow you'
    when 'follow-accepted' then 'accepted your follow request'
    when 'upvote' then 'upvoted your thread'
    when 'upvote-reply' then 'upvoted your reply'
    when 'joined' then 'just joined CourtSide near you'
    when 'hit-join' then 'is in for your hit'
    else 'did something on CourtSide' end;
  link := case
    when new.kind in ('follow', 'follow-request', 'follow-accepted', 'joined') then '/user/' || new.actor_id
    when new.target_kind = 'coaching-request' then '/coach-request/' || new.target_id
    when new.target_kind = 'post' then '/post/' || new.target_id
    when new.target_kind = 'hit' then '/hits/' || new.target_id
    when new.target_kind = 'question' then '/question/' || new.target_id
    when new.target_kind = 'hit-request' then '/hit-request/' || new.target_id
    else '/notifications' end;
  -- Two lines like other apps (migration 86): the app name on top, what happened underneath.
  perform public.send_push(new.user_id, 'CourtSide',
    coalesce(who, 'Someone') || ' ' || what || coalesce(': ' || nullif(btrim(new.preview), ''), ''), link);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.tell_adults_new_player()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        from public.last_seen s
        where s.user_id <> new.user_id and s.seen_at > now() - interval '30 days'
          and public.known_adult(s.user_id)
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
  update public.exact_spots x set lat = null, lng = null, court_id = null
    where x.lat is not null and not exists (select 1 from public.last_seen s where s.user_id = x.user_id and s.until > now());
  delete from public.last_seen where until is null or until <= now();
$function$;

CREATE OR REPLACE FUNCTION public.check_out_of_map()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.exact_spots set lat = null, lng = null, court_id = null where user_id = auth.uid();
  delete from public.last_seen where user_id = auth.uid();
  delete from public.court_checkins where user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.open_to_hit_miles(ids uuid[])
 RETURNS TABLE(user_id uuid, miles smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select us.user_id, us.open_to_hit_miles
  from public.user_state us
  join public.profiles p on p.id = us.user_id
  where auth.uid() is not null
    and us.user_id = any ((ids)[1:200])
    and us.open_to_hit_miles is not null
    and greatest(p.open_to_hit_until, us.open_to_hit_until) > now()
    and (us.user_id = auth.uid()
      or (not public.is_blocked_between(auth.uid(), us.user_id)
        and not exists (select 1 from public.profiles x
                        where x.id in (auth.uid(), us.user_id) and x.suspended_at is not null)
        and (p.open_to_hit_until > now()
          or exists (select 1 from public.last_seen s
                     where s.user_id = us.user_id and s.visibility <> 'none'
                       and public.map_pair_ok(auth.uid(), s.user_id, s.visibility)))))
$function$;

CREATE OR REPLACE FUNCTION public.flyby(p_court text, p_day date, p_offset_min integer DEFAULT 0)
 RETURNS TABLE(user_id uuid, part text, via text, post_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  off int := greatest(-840, least(840, coalesce(p_offset_min, 0)));
  t0 timestamptz;
  t1 timestamptz;
  skip uuid[];
  cands uuid[];
  asked uuid[];
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_court is null or p_court !~ '^(node|way|relation)[0-9]{1,15}$' or p_day is null then return; end if;
  if p_day < current_date - 2 or p_day > current_date + 1 then return; end if;
  if public.is_suspended(me) then return; end if;
  t0 := (p_day::timestamp - make_interval(mins => off)) at time zone 'UTC';
  t1 := t0 + interval '1 day';

  -- You were there that day, shown by something that cost you something: your
  -- own post there (up, not group only), your check-in there (made within 5 km
  -- of it), or your session logged there, the court given as it was saved
  -- (never added or re-pointed after, guard_session_court) by the day after.
  if not (
    exists (select 1 from public.posts p where p.author_id = me and p.court_id = p_court
              and not p.archived and p.removed_at is null and p.group_id is null
              and ((p.created_at >= t0 and p.created_at < t1)
                   or (jsonb_typeof(p.session) = 'object' and p.session->>'day' = to_char(p_day, 'YYYY-MM-DD') and p.created_at >= t0 and p.created_at < t1 + interval '1 day')))
    or exists (select 1 from public.court_visits v where v.user_id = me and v.court_id = p_court and v.day = p_day)
    or exists (select 1 from public.practice_sessions s where s.user_id = me and s.court_id = p_court and s.day = p_day
                 and s.created_at < t1 + interval '1 day')
  ) then return; end if;

  -- At most 6 different courts and days a day each (as many as check-ins);
  -- asking again about one already asked is free.
  perform pg_advisory_xact_lock(hashtextextended('flyby:' || me::text, 130));
  delete from public.flyby_asks a where a.asker_id = me and a.asked_at < now() - interval '1 day';
  if not exists (select 1 from public.flyby_asks a where a.asker_id = me and a.court_id = p_court and a.day = p_day) then
    if (select count(*) from public.flyby_asks a where a.asker_id = me) >= 6 then return; end if;
    insert into public.flyby_asks (asker_id, court_id, day) values (me, p_court, p_day) on conflict do nothing;
  end if;

  -- The people on your sessions that day (you played them: no need to say they were there).
  select coalesce(array_agg(distinct x), '{}') into skip from (
    select t.tagged_id as x from public.session_tags t join public.practice_sessions s on s.id = t.session_id
     where t.tagger_id = me and s.user_id = me and s.day = p_day and t.status in ('pending', 'accepted')
    union
    select t.tagger_id from public.session_tags t join public.practice_sessions s on s.id = t.session_id
     where t.tagged_id = me and s.day = p_day and t.status in ('pending', 'accepted')
  ) y;

  -- Who posted there that day, as the court's page shows them to you (shown_at_court's rule).
  select coalesce(array_agg(a), '{}') into cands from (
    select p.author_id as a from public.posts p
     where p.court_id = p_court and p.created_at >= t0 and p.created_at < t1
       and not p.archived and p.removed_at is null and p.group_id is null
       and p.author_id <> me and not (p.author_id = any (skip))
     group by p.author_id order by min(p.created_at) limit 60) z;
  if cardinality(cands) > 0 then asked := public.age_rule_budget(cands); else asked := '{}'; end if;

  return query
  with posted as (
    select distinct on (p.author_id) p.author_id as uid, p.created_at as at, p.id as pid
      from public.posts p join public.profiles pr on pr.id = p.author_id
     where p.court_id = p_court and p.created_at >= t0 and p.created_at < t1
       and not p.archived and p.removed_at is null and p.group_id is null
       and p.author_id = any (cands) and p.author_id = any (asked)
       and pr.suspended_at is null
       and public.shows_at_court(me, p.author_id)
     order by p.author_id, p.created_at
  ), checked as (
    -- Friends only, adults only, and only while they still share where they
    -- are and show their activity status (off, the map shows their day only).
    select v.user_id as uid, v.part as pt
      from public.court_visits v
      join public.profiles pr on pr.id = v.user_id
      left join public.user_state us on us.user_id = v.user_id
     where public.known_adult(me)
       and v.court_id = p_court and v.day = p_day
       and v.user_id <> me and not (v.user_id = any (skip))
       and not exists (select 1 from posted where posted.uid = v.user_id)
       and pr.suspended_at is null
       and public.known_adult(v.user_id)
       and public.follow_each_other(me, v.user_id)
       and not public.is_blocked_between(me, v.user_id)
       and coalesce(us.map_visibility, 'nearby') <> 'none'
       and coalesce(us.show_activity, true)
       and exists (select 1 from public.last_seen ls where ls.user_id = v.user_id)
  ), everyone as (
    select po.uid,
           case when extract(hour from (po.at at time zone 'UTC') + make_interval(mins => off)) < 12 then 'morning'
                when extract(hour from (po.at at time zone 'UTC') + make_interval(mins => off)) < 17 then 'afternoon'
                else 'evening' end as pt,
           'post'::text as how, po.pid, po.at as sort_at, 0 as k
      from posted po
    union all
    -- Check-ins in the order of the day's parts only, never of their times.
    select ch.uid, ch.pt, 'checkin'::text, null::uuid, null::timestamptz,
           case ch.pt when 'morning' then 1 when 'afternoon' then 2 else 3 end
      from checked ch
  )
  select e.uid, e.pt, e.how, e.pid
    from everyone e
   order by e.how desc, e.sort_at, e.k, e.uid
   limit 30;
end $function$;

CREATE OR REPLACE FUNCTION public.court_kings(p_court text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  since date := current_date - 90;
  tally jsonb;
  my_wins int := 0;
  my_days int := 0;
  me_ok boolean;
  my_n int;
  my_d date;
  my_at timestamptz;
  cands uuid[];
  adults uuid[];
  ahead uuid[];
  asked uuid[];
  i int;
  board jsonb;
  my_rank int;
  my_over boolean := false;
  out_mode text := 'none';
  nothing constant jsonb := jsonb_build_object('mode', 'none', 'top', '[]'::jsonb, 'me', jsonb_build_object('n', 0, 'rank', null, 'ranked', false, 'over', false, 'days', 0));
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_court is null or p_court !~ '^(node|way|relation)[0-9]{1,15}$' then return nothing; end if;
  -- Someone's home court has no board.
  if exists (select 1 from public.courts c where c.id = p_court and c.access = 'private') then return nothing; end if;
  -- You can be ranked: a public account, not suspended, a known adult (your own age, never anyone else's).
  select not p.is_private and p.suspended_at is null and public.known_adult(me) into me_ok from public.profiles p where p.id = me;
  me_ok := coalesce(me_ok, false);

  -- Every win at this court, per player: one per match however often it is
  -- posted, at most 2 a day each, from the poster's own log (kind and result).
  -- Only posts from the last 97 days are read (a match is posted after it is played).
  with w as (
    select p.author_id as uid, s.id as sid, s.day, max(p.created_at) as at
      from public.posts p
      join public.practice_sessions s
        on s.id = case when p.session->>'sessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (p.session->>'sessionId')::uuid end
       and s.user_id = p.author_id
     where p.court_id = p_court and p.created_at >= (since - 7)::timestamp at time zone 'UTC'
       and not p.archived and p.removed_at is null and p.group_id is null
       and jsonb_typeof(p.session) = 'object' and p.session->>'kind' = 'match'
       and s.kind = 'match' and s.won is true and s.day >= since and s.day <= current_date + 1
     group by p.author_id, s.id, s.day
  ), capped as (
    select uid, day, at, row_number() over (partition by uid, day order by at, sid) as k from w
  )
  select coalesce(jsonb_agg(jsonb_build_object('uid', uid, 'n', n, 'd', d, 'at', at)), '[]'::jsonb) into tally
    from (select uid, count(*)::int as n, max(day) as d, max(at) as at from capped where k <= 2 group by uid) t;

  for pass in 1 .. 2 loop
    if pass = 2 then
      -- Nobody to crown: the regulars, by days with a session posted here.
      select coalesce(jsonb_agg(jsonb_build_object('uid', uid, 'n', n, 'd', d, 'at', at)), '[]'::jsonb) into tally from (
        select p.author_id as uid, count(distinct (p.created_at at time zone 'UTC')::date)::int as n,
               max((p.created_at at time zone 'UTC')::date) as d, max(p.created_at) as at
          from public.posts p
         where p.court_id = p_court and not p.archived and p.removed_at is null and p.group_id is null
           and jsonb_typeof(p.session) = 'object' and p.created_at >= since::timestamp at time zone 'UTC'
         group by p.author_id) t;
      my_days := coalesce((select w.n from jsonb_to_recordset(tally) as w(uid uuid, n int, d date, at timestamptz) where w.uid = me), 0);
    else
      my_wins := coalesce((select w.n from jsonb_to_recordset(tally) as w(uid uuid, n int, d date, at timestamptz) where w.uid = me), 0);
    end if;
    my_n := null; my_d := null; my_at := null; my_rank := null; my_over := false;
    select w.n, w.d, w.at into my_n, my_d, my_at from jsonb_to_recordset(tally) as w(uid uuid, n int, d date, at timestamptz) where w.uid = me;
    -- The others who could be on the board, best first: public, not suspended, not blocked either way.
    select coalesce(array_agg(x.uid order by x.n desc, x.d desc, x.at desc), '{}') into cands from (
      select w.uid, w.n, w.d, w.at from jsonb_to_recordset(tally) as w(uid uuid, n int, d date, at timestamptz)
        join public.profiles p on p.id = w.uid
       where w.uid <> me and not p.is_private and p.suspended_at is null and not public.is_blocked_between(me, w.uid)
       order by w.n desc, w.d desc, w.at desc limit 20) x;
    -- Who is an adult is only ever asked within the day's budget (109), shared
    -- with the map and every court page: 5 at a time, best first, only until
    -- three are found (20 at most). The rest are left out. Asking again about
    -- someone already asked today (in pass 1, or on another page) costs nothing.
    adults := '{}';
    i := 1;
    while cardinality(adults) < 3 and i <= cardinality(cands) loop
      asked := public.age_rule_budget(cands[i : i + 4]);
      adults := adults || array(select b.id from unnest(cands[i : i + 4]) with ordinality as b(id, o)
                                 where b.id = any (asked) and public.known_adult(b.id) order by b.o);
      i := i + 5;
    end loop;
    -- Your own place: everyone placed above you, asked about only when they are 10 or fewer; more than 10, "10+".
    if me_ok and coalesce(my_n, 0) > 0 then
      select coalesce(array_agg(w.uid order by w.n desc, w.d desc, w.at desc), '{}') into ahead
        from jsonb_to_recordset(tally) as w(uid uuid, n int, d date, at timestamptz)
        join public.profiles p on p.id = w.uid
       where w.uid <> me and not p.is_private and p.suspended_at is null and not public.is_blocked_between(me, w.uid)
         and (w.n, w.d, w.at) > (my_n, my_d, my_at);
      if cardinality(ahead) > 10 then
        my_over := true;
      else
        asked := case when cardinality(ahead) > 0 then public.age_rule_budget(ahead) else '{}'::uuid[] end;
        my_rank := 1 + (select count(*) from unnest(ahead) as a(id) where a.id = any (asked) and public.known_adult(a.id))::int;
      end if;
    end if;
    with ranked as (
      select w.uid, w.n, w.d, row_number() over (order by w.n desc, w.d desc, w.at desc) as r
        from jsonb_to_recordset(tally) as w(uid uuid, n int, d date, at timestamptz)
       where (w.uid = me and me_ok and w.n > 0) or w.uid = any (adults)
    )
    select jsonb_agg(jsonb_build_object('id', uid, 'n', n, 'last', to_char(d, 'YYYY-MM-DD')) order by r) filter (where r <= 3)
      into board from ranked;
    if board is not null then
      out_mode := case when pass = 1 then 'wins' else 'regulars' end;
      exit;
    end if;
  end loop;

  return jsonb_build_object('mode', out_mode, 'top', coalesce(board, '[]'::jsonb),
    'me', jsonb_build_object('n', my_wins, 'rank', my_rank, 'ranked', my_rank is not null or my_over, 'over', my_over, 'days', my_days));
end $function$;

CREATE OR REPLACE FUNCTION public.tell_map_about_hit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

do $$
declare
  bad text;
begin
  select string_agg(w.sig, ', ') into bad
    from (values
    ('public.round_city_position()', '8c1600bc0b36f1d87a3bd0f1e781b685'),
    ('public.check_in_at_court(text, double precision, double precision)', 'b20efca8eacb8f1dd7ad84bee82e7a71'),
    ('public.court_right_now(text[])', 'b206b3f047bc78d39030cc504e8be1ca'),
    ('private.join_shown_to_you(uuid, uuid)', '1aebfa9a69dd8a28c406ab92a36e92d4'),
    ('public.guard_post_court()', '9911071b1987ce8215cb0568dbe52bc0'),
    ('private.flexible_area(uuid, double precision, double precision)', '18eaf861d8ee7560e89c873a445b1795'),
    ('public.guard_hit_place()', '608f4ee3f86420f130fc14ab0f9d9c29'),
    ('public.push_for_notification()', 'ed202ec0226addae82c3534a680b7e6b'),
    ('public.tell_adults_new_player()', '23900e6aa0a7e3ff561f27c64c397c83'),
    ('public.sweep_court_status()', 'c6cd91f4f6ece7c95819a2ee182a70bb'),
    ('public.check_out_of_map()', '62caa8b3afae04f854cd5289773bb92a'),
    ('public.open_to_hit_miles(uuid[])', '2b3e53b8ed18715017e79e01556c3996'),
    ('public.flyby(text, date, integer)', '977b3523e2e20da08a5321465e5dc629'),
    ('public.court_kings(text)', 'f24f129ac98403a543b2c0b62fce1c7d'),
    ('public.tell_map_about_hit()', 'b4061707020bbaee2d3b795a3e0e9618')
    ) as w(sig, md5)
   where not exists (select 1 from pg_proc p where p.oid = to_regprocedure(w.sig) and md5(p.prosrc) = w.md5);
  if bad is not null then
    raise exception 'Undo 191 stopped: % did not come back as it was. Nothing was changed.', bad;
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'city_lat', 'select') then
    raise exception 'Undo 191 stopped: read access did not come back. Nothing was changed.';
  end if;
end $$;

commit;
