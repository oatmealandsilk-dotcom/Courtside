-- 53: open hits arrive live, and players after the same game hear about each other.
--
-- 1. hit_requests and hit_joins stream to the app, so a hit posted on one
--    phone is on everyone's Find Players within seconds, not at their next refresh.
-- 2. When a hit goes up, the people looking for much the same game are told:
--    "Dev is also looking for a hit · today at 6:30 PM · Pullen Park. Message them?"
--      - anyone with their own open hit within two hours of it, nearby (25 km,
--        or the same place by name), the same kind of game (or "just hitting"),
--        at a level that overlaps; and the new poster hears about the closest one;
--      - anyone with their open-to-hit ring on today, near the court, whose
--        level is in the hit's range (at most 25 of them).
--    Adults only, never between blocked people, once per person per hit.
-- Needs 18 (file_notification), 43 (hit_requests), 46 (last_seen), 49 (city position).
-- Safe to run more than once.

do $$ begin
  begin alter publication supabase_realtime add table public.hit_requests; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hit_joins; exception when duplicate_object then null; end;
end $$;

-- Rough distance on the ground, good to a few percent at these ranges.
create or replace function public.km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 111.2 * sqrt(power(lat2 - lat1, 2) + power((lng2 - lng1) * cos(radians((lat1 + lat2) / 2)), 2))
$$;

-- "today at 6:30 PM", in the court's own time zone (told from its longitude:
-- the app is US-first, and a hit without a map spot is read as Eastern).
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

create or replace function public.tell_hit_matches()
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
  if not found or poster.age_group is distinct from 'adult' then return new; end if;
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
      and p.age_group = 'adult'
      and not public.is_blocked_between(h.author_id, new.author_id)
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
        and p.age_group = 'adult'
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

drop trigger if exists tell_hit_matches on public.hit_requests;
create trigger tell_hit_matches after insert on public.hit_requests for each row execute function public.tell_hit_matches();

-- Phone alerts know the new kind.
create or replace function public.push_for_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  what text;
  link text;
  likes_on boolean := true;
  coach_on boolean := true;
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
  if new.kind = 'hit-match' then
    select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
    perform public.send_push(new.user_id, coalesce(who, 'Someone') || ' is also looking for a hit', coalesce(new.preview || '. ', '') || 'Message them?', '/hit-request/' || new.target_id);
    return new;
  end if;
  if new.kind = 'report' then
    perform public.send_push(new.user_id, 'New report', coalesce(new.preview, 'Someone sent a report'), '/admin-reports');
    return new;
  end if;
  select coalesce(push_likes, true), coalesce(push_coach, true) into likes_on, coach_on from public.user_state where user_id = new.user_id;
  if new.kind in ('like', 'upvote', 'upvote-reply') and likes_on is false then return new; end if;
  if new.kind in ('coach-reply', 'coach-answer') and coach_on is false then return new; end if;
  select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
  what := case new.kind
    when 'like' then 'liked your ' || case new.target_kind when 'hit' then 'instant' when 'question' then 'thread' else 'post' end
    when 'comment' then 'commented on your ' || case new.target_kind when 'hit' then 'instant' else 'post' end
    when 'answer' then 'replied to your thread'
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
  perform public.send_push(new.user_id, coalesce(who, 'Someone') || ' ' || what, new.preview, link);
  return new;
end $$;
