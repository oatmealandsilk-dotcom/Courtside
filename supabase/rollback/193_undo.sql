-- CourtSide · undo for migration 20261029000193_auto_log_mutuals (193).
--
-- NOT A MIGRATION (it lives outside supabase/migrations on purpose). Run it in
-- the Supabase SQL editor as one piece only to take 193 back out. It puts
-- back, word for word, the live versions of the fourteen functions 193
-- changed, as read from the live database before 193 (on Oct 27: 185's
-- auto_log_activity, send_activity_pushes and session_unposted, and
-- mark_first_post, share_preview, group_feed, invite_first_action,
-- invite_second_day, invite_back_at, first_day_stats, feed_post_scores,
-- admin_new_players; on Oct 28: session_minor_posts and 196/197's
-- refresh_city_board), and takes out 193's read rules (posts, likes),
-- triggers and new functions. All-or-nothing; safe to run more than once.
--
-- The posts the server made for sessions that logged themselves are DELETED
-- (with their likes and comments): without 193's read rule they would show
-- to anyone who can see their player's posts. The sessions themselves stay
-- in their players' logs, private, as under 185. What stays, unused: the new
-- columns (posts.auto_logged and auto_held, user_state.auto_log_audience and unsure_yes).
-- An app with 193's update still shows Settings' choice and its words; after
-- this undo nothing of it reaches anyone else until 193 runs again (sessions
-- that log themselves are private, as under 185). The undo of the functions
-- 193 changed comes first, while they still exist in 193's form; the new
-- functions they call go after.

begin;

-- First, while 193's read rule still stands: the server's posts go.
delete from public.posts where auto_logged;

drop policy if exists "sessions that log themselves: only their audience" on public.posts;
drop policy if exists "sessions that log themselves: liked by their audience" on public.post_likes;
drop trigger if exists auto_post_guard on public.posts;
drop trigger if exists auto_post_emptied on public.posts;
drop trigger if exists auto_post_follows_session on public.practice_sessions;
drop trigger if exists count_unsure_answers on public.detected_activities;
drop trigger if exists unsure_yes_taken_back on public.practice_sessions;

CREATE OR REPLACE FUNCTION public.auto_log_activity(a_id uuid, by_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_a public.detected_activities;
  v_by public.detected_activities;
begin
  select * into v_a from public.detected_activities where id = a_id;
  if not found then return false; end if;
  select * into v_by from public.detected_activities where id = by_id;
  if not found or v_by.user_id <> v_a.user_id then return false; end if;
  -- Filed, waiting, not logged. Tennis, the tracker sure of it, 20 minutes or more, this week.
  if v_a.status <> 'new' or v_a.session_id is not null or v_a.notified_at is null
     or v_a.sport <> 'tennis' or v_by.sport <> 'tennis' or v_by.unsure or v_by.minutes < 20
     or v_by.ended_at < now() - interval '8 days' then
    return false;
  end if;
  if not public.tennis_allowed(v_by.user_id, v_by.source) then return false; end if;
  -- Settings → "Log tennis automatically" (on unless switched off).
  if (select us.auto_log from public.user_state us where us.user_id = v_a.user_id) is false then return false; end if;
  -- Already logged by hand (a tennis session of theirs saved between the
  -- start and 12 hours after the end of either copy): never a second one.
  if exists (select 1 from public.practice_sessions s where s.user_id = v_a.user_id and s.activity_id is null and not s.auto_logged
               and s.kind in ('practice', 'match', 'drills')
               and s.created_at between least(v_a.started_at, v_by.started_at) and greatest(v_a.ended_at, v_by.ended_at) + interval '12 hours') then
    return false;
  end if;
  begin
    -- No place, score or heart rate: the player adds what they like when they post it.
    -- mark_activity_logged then marks the row 'logged' with this session.
    insert into public.practice_sessions (user_id, day, minutes, kind, activity_id, auto_logged)
      values (v_a.user_id, public.activity_day(v_a.user_id, v_a.started_at, v_a.tz_offset_min), v_by.minutes, 'practice', v_a.id, true);
  exception when others then
    return false;
  end;
  return exists (select 1 from public.detected_activities where id = a_id and status = 'logged');
end $function$;

CREATE OR REPLACE FUNCTION public.send_activity_pushes(u uuid, ids uuid[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_due uuid[];
  v_ones uuid[];
  v_go uuid[];
  v_found boolean;
  v_n int;
  v_tennis boolean;
  v_auto boolean;
  r record;
begin
  if u is null or coalesce(cardinality(ids), 0) = 0 then return 'none'; end if;
  -- One person's alerts one at a time (note_detected_activity holds the same lock).
  perform pg_advisory_xact_lock(hashtextextended('activity:' || u::text, 0));
  -- Theirs, waiting to be logged or logged for them and not posted, not
  -- alerted since they were filed: newest first. Only sessions of 20 minutes
  -- or more buzz (183); a shorter one is filed quietly in To do and Notifications.
  select array_agg(d.id order by d.ended_at desc) into v_due
    from public.detected_activities d left join public.practice_sessions s on s.id = d.session_id
   where d.user_id = u and d.id = any(ids)
     and (d.status = 'new' and d.minutes >= 20
          or d.status = 'logged' and s.auto_logged and public.session_unposted(s.id, u))
     and (d.pushed_at is null or d.pushed_at < d.notified_at);
  if v_due is null then return 'none'; end if;
  -- The go under way: their alerts in the last ten minutes. Already told "N workouts found" in it?
  select coalesce(bool_or(d.pushed_as = 'found'), false) into v_found
    from public.detected_activities d
   where d.user_id = u and d.pushed_at > now() - interval '10 minutes' and not (d.id = any(v_due));
  -- These join it quietly (the app's one row counts them).
  if v_found then
    update public.detected_activities set pushed_at = now(), pushed_as = 'folded' where id = any(v_due);
    return 'folded';
  end if;
  -- Its single alerts, those still waiting (one logged by the player or hidden since is not counted).
  select coalesce(array_agg(d.id order by d.ended_at desc), '{}') into v_ones
    from public.detected_activities d left join public.practice_sessions s on s.id = d.session_id
   where d.user_id = u and d.pushed_as = 'one'
     and (d.status = 'new' or d.status = 'logged' and s.auto_logged and public.session_unposted(s.id, u))
     and d.pushed_at > now() - interval '10 minutes' and not (d.id = any(v_due));
  v_n := cardinality(v_ones) + cardinality(v_due);
  -- Three or fewer in the go: one each. No numbers on the lock screen: the time and stats show only in the app.
  if v_n <= 3 then
    for r in select d.id, d.sport, d.status, d.unsure from public.detected_activities d where d.id = any(v_due) order by d.ended_at loop
      if r.status = 'logged' then
        -- Opens its post page (photo, score, tags, court, caption).
        perform public.send_push(u, 'Tennis logged', 'Saved privately · tap to add the score or post it.', '/log-session?activity=' || r.id);
      elsif r.sport = 'tennis' and r.unsure then
        perform public.send_push(u, 'Was this tennis?', 'Tap to log it on CourtSide.', '/log-session?activity=' || r.id);
      elsif r.sport = 'tennis' then
        perform public.send_push(u, 'Tennis detected', 'Log it on CourtSide.', '/log-session?activity=' || r.id);
      else
        perform public.send_push(u, 'Activity detected', public.workout_name(r.sport) || ' · Log it on CourtSide.', '/log-session?activity=' || r.id);
      end if;
    end loop;
    update public.detected_activities set pushed_at = now(), pushed_as = 'one' where id = any(v_due);
    return 'pushed';
  end if;
  -- More than three: ONE alert for the go, opening its list in the app.
  select array_agg(d.id order by d.ended_at desc), coalesce(bool_and(d.sport = 'tennis'), false), coalesce(bool_and(d.status = 'logged'), false)
    into v_go, v_tennis, v_auto
    from public.detected_activities d where d.id = any(v_due || v_ones);
  perform public.send_push(u,
    v_n || case when v_auto then ' tennis sessions logged' when v_tennis then ' tennis sessions found' else ' workouts found' end,
    case when v_auto then 'Only you can see them · tap to post one.' else 'Tap to log them on CourtSide.' end,
    '/notifications?workouts=' || array_to_string(v_go[1:40], ','));
  update public.detected_activities set pushed_at = now(), pushed_as = case when id = v_due[1] then 'found' else 'folded' end where id = any(v_due);
  return 'pushed-found';
end $function$;

CREATE OR REPLACE FUNCTION public.session_unposted(s_id uuid, u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not exists (select 1 from public.posts p where p.author_id = u and p.session->>'sessionId' = s_id::text)
$function$;

CREATE OR REPLACE FUNCTION public.mark_first_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.is_first := not exists (select 1 from public.posts p where p.author_id = new.author_id);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.share_preview(p_kind text, p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  is_uuid boolean := coalesce(p_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  locked jsonb := jsonb_build_object('kind', p_kind, 'open', false);
  p public.posts;
  h public.hit_requests;
  q public.questions;
  pr public.profiles;
  joined int;
begin
  if p_kind = 'post' then
    if not is_uuid then return locked; end if;
    select * into p from public.posts where id = p_id::uuid;
    if p.id is null or p.archived or p.removed_at is not null or public.share_in_group(p) or not public.share_open_to_me(p.author_id) then return locked; end if;
    return jsonb_build_object('kind', 'post', 'open', true,
      'author', public.share_person(p.author_id),
      'post', jsonb_strip_nulls(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'body', left(p.body, 500), 'createdAt', p.created_at,
        'imageUrl', p.image_url, 'videoUrl', p.video_url, 'thumbnailUrl', p.thumbnail_url, 'orientation', p.orientation,
        'likes', (select count(*) from public.post_likes l where l.post_id = p.id),
        'comments', (select count(*) from public.comments c where c.post_id = p.id and c.removed_at is null
          and not exists (select 1 from public.comment_word_holds wh where wh.kind = 'comment' and wh.item_id in (c.id, c.parent_id))),
        'courtName', p.court_name, 'courtId', p.court_id, 'location', nullif(btrim(coalesce(p.location, '')), ''),
        -- Only the session's shape, never its numbers from a tracker or who else played.
        'session', case when jsonb_typeof(p.session) = 'object' then jsonb_strip_nulls(jsonb_build_object(
          'minutes', case when jsonb_typeof(p.session->'minutes') = 'number' then p.session->'minutes' end,
          'focus', left(p.session->>'focus', 40),
          'kind', case when p.session->>'kind' in ('practice', 'match', 'drills', 'fitness') then p.session->>'kind' end)) end)));
  end if;

  if p_kind = 'profile' then
    if not is_uuid then return locked; end if;
    select * into pr from public.profiles where id = p_id::uuid;
    if pr.id is null or not public.share_open_to_me(pr.id) then return locked; end if;
    return jsonb_build_object('kind', 'profile', 'open', true,
      'author', public.share_person(pr.id),
      'profile', jsonb_strip_nulls(jsonb_build_object(
        'bio', left(pr.bio, 200),
        'followers', pr.followers_count,
        'posts', (select count(*) from public.posts x where x.author_id = pr.id and not x.archived and x.removed_at is null and not public.share_in_group(x)),
        'skillSystem', case when pr.profile->>'skillSystem' in ('NTRP', 'UTR', 'ITF') then pr.profile->>'skillSystem' end,
        'rating', case when jsonb_typeof(pr.profile->'rating') = 'number' then pr.profile->'rating' end,
        'openHits', (select count(*) from public.hit_requests y where y.author_id = pr.id and not y.cancelled and y.starts_at > now() and public.hit_is_open(y.id)),
        'recent', coalesce((select jsonb_agg(public.share_tile(x) order by x.created_at desc) from (
          select * from public.posts x where x.author_id = pr.id and not x.archived and x.removed_at is null
            and (x.image_url is not null or x.thumbnail_url is not null) and not public.share_in_group(x)
          order by x.created_at desc limit 6) x), '[]'::jsonb))));
  end if;

  if p_kind = 'hit-request' then
    if not is_uuid then return locked; end if;
    select * into h from public.hit_requests where id = p_id::uuid;
    if h.id is null or not public.share_open_to_me(h.author_id) then return locked; end if;
    if not public.hit_is_open(h.id) and not public.hit_reaches(auth.uid(), h.id) then return locked; end if;
    select count(*) into joined from public.hit_joins j where j.hit_id = h.id;
    return jsonb_build_object('kind', 'hit-request', 'open', true,
      'gone', h.cancelled or h.starts_at < now() - interval '1 hour',
      'author', public.share_person(h.author_id),
      'hit', jsonb_strip_nulls(jsonb_build_object(
        'id', h.id, 'startsAt', h.starts_at, 'format', h.format, 'spots', h.spots,
        'spotsLeft', greatest(h.spots - joined, 0), 'levelMin', h.level_min, 'levelMax', h.level_max,
        'note', left(h.note, 280),
        'place', jsonb_strip_nulls(jsonb_build_object(
          'id', case when (h.place->>'id') ~ '^(node|way|relation)[0-9]{1,15}$' then h.place->>'id' end,
          'name', left(h.place->>'name', 120),
          -- About a street away, the way a court is found; never to the metre.
          'lat', case when jsonb_typeof(h.place->'lat') = 'number' then round((h.place->>'lat')::numeric, 3) end,
          'lng', case when jsonb_typeof(h.place->'lng') = 'number' then round((h.place->>'lng')::numeric, 3) end)))));
  end if;

  if p_kind = 'question' then
    if not is_uuid then return locked; end if;
    select * into q from public.questions where id = p_id::uuid;
    if q.id is null or q.removed_at is not null or not public.share_open_to_me(q.author_id) then return locked; end if;
    return jsonb_build_object('kind', 'question', 'open', true,
      'author', public.share_person(q.author_id),
      'question', jsonb_build_object(
        'id', q.id, 'title', left(q.title, 200), 'body', left(q.body, 400), 'createdAt', q.created_at,
        'answers', (select count(*) from public.answers a where a.question_id = q.id and a.removed_at is null
          and not exists (select 1 from public.comment_word_holds wh where wh.kind = 'answer' and wh.item_id in (a.id, a.parent_answer_id)))));
  end if;

  if p_kind = 'court' then
    -- A court is a public place: its page always opens. What it counts and
    -- shows is only from people a stranger may see.
    if coalesce(p_id, '') !~ '^(node|way|relation)[0-9]{1,15}$' then return locked; end if;
    return jsonb_build_object('kind', 'court', 'open', true,
      'court', jsonb_strip_nulls(jsonb_build_object(
        'name', (select x.court_name from public.posts x where x.court_id = p_id and x.court_name is not null and not x.archived and x.removed_at is null and not public.share_in_group(x) and public.share_open_to_me(x.author_id) order by x.created_at desc limit 1),
        'openHits', (select count(*) from public.hit_requests y where y.place->>'id' = p_id and not y.cancelled and y.starts_at > now() and public.share_open_to_me(y.author_id) and public.hit_is_open(y.id)),
        'posts', (select count(*) from public.posts x where x.court_id = p_id and not x.archived and x.removed_at is null and not public.share_in_group(x) and public.share_open_to_me(x.author_id)),
        'players', (select count(distinct x.author_id) from public.posts x where x.court_id = p_id and not x.archived and x.removed_at is null and not public.share_in_group(x) and public.share_open_to_me(x.author_id)),
        'recent', coalesce((select jsonb_agg(public.share_tile(x) order by x.created_at desc) from (
          select * from public.posts x where x.court_id = p_id and not x.archived and x.removed_at is null
            and (x.image_url is not null or x.thumbnail_url is not null) and not public.share_in_group(x) and public.share_open_to_me(x.author_id)
          order by x.created_at desc limit 6) x), '[]'::jsonb))));
  end if;

  if p_kind = 'referrer' then
    -- The handle on a link (?ref=): only named back when it is someone a
    -- stranger may see, so a made-up link cannot claim to come from anyone.
    select * into pr from public.profiles where handle = lower(btrim(coalesce(p_id, '')));
    if pr.id is null or not public.share_open_to_me(pr.id) then return locked; end if;
    return jsonb_build_object('kind', 'referrer', 'open', true, 'author', public.share_person(pr.id));
  end if;

  return locked;
end $function$;

CREATE OR REPLACE FUNCTION public.group_feed(g uuid, before timestamp with time zone DEFAULT NULL::timestamp with time zone, lim integer DEFAULT 20)
 RETURNS TABLE(id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  n int := greatest(1, least(coalesce(lim, 20), 50));
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.feed_group_members m where m.group_id = g and m.user_id = me) then
    raise exception 'not_in_group';
  end if;
  return query
    select p.id, p.created_at
    from public.posts p
    join public.feed_group_members m on m.group_id = g and m.user_id = p.author_id
    where (p.group_id is null or p.group_id = g)
      and not p.archived
      and p.removed_at is null
      and (before is null or p.created_at < before)
      and (p.author_id = me
           or (not public.is_blocked_between(me, p.author_id)
               -- An ordinary post: only if you could see it anyway (a public
               -- account, one you follow, or one you are tagged in), a
               -- teen's the same as anyone's (149).
               and (p.group_id = g or public.can_view(p.author_id) or me = any(p.tagged_user_ids)
                    or (p.session->'with') @> jsonb_build_array(jsonb_build_object('id', me)))))
    order by p.created_at desc, p.id desc
    limit n;
end $function$;

CREATE OR REPLACE FUNCTION public.invite_first_action(u uuid, inviter uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select min(t) from (
              select created_at as t from public.follows           where follower_id = u and following_id is distinct from inviter
    union all select created_at        from public.posts             where author_id = u
    union all select created_at        from public.questions         where author_id = u
    union all select created_at        from public.answers           where author_id = u
    union all select created_at        from public.comments          where author_id = u
    union all select created_at        from public.hit_requests      where author_id = u
    union all select created_at        from public.hit_joins         where user_id = u
    union all select created_at        from public.messages          where sender_id = u
    union all select created_at        from public.practice_sessions where user_id = u and not auto_logged
  ) s
$function$;

CREATE OR REPLACE FUNCTION public.invite_second_day(u uuid, joined timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s(t) as (
              select updated_at        from public.push_tokens    where user_id = u
    union all select last_seen_at      from public.device_sightings where user_id = u
    union all select first_seen_at     from public.device_sightings where user_id = u
    union all select seen_at           from public.last_seen      where user_id = u
    union all select seen_at           from public.exact_spots    where user_id = u
    union all select first_seen_at     from public.feed_signals   where user_id = u
    union all select last_seen_at      from public.feed_signals   where user_id = u
    union all select updated_at        from public.user_state     where user_id = u
    union all select first_at          from public.app_opens      where user_id = u
    union all select created_at        from public.posts          where author_id = u
    union all select created_at        from public.comments       where author_id = u
    union all select created_at        from public.post_likes     where user_id = u
    union all select created_at        from public.questions      where author_id = u
    union all select created_at        from public.answers        where author_id = u
    union all select created_at        from public.messages       where sender_id = u
    union all select viewed_at         from public.story_views    where user_id = u
    union all select created_at        from public.hit_joins      where user_id = u
    union all select created_at        from public.hit_requests   where author_id = u
    union all select created_at        from public.court_checkins where user_id = u
    union all select created_at        from public.follows        where follower_id = u
    union all select created_at        from public.practice_sessions where user_id = u and not auto_logged
  )
  select min(t) from s
   where t >= joined + interval '20 hours' and t < joined + interval '14 days' and t <= now()
$function$;

CREATE OR REPLACE FUNCTION public.invite_back_at(u uuid, joined timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with day_after as (
    select (date_trunc('day', joined at time zone 'utc') + interval '1 day') at time zone 'utc' as t
  )
  select min(s.t) from (
              select updated_at as t   from public.push_tokens   where user_id = u
    union all select seen_at           from public.last_seen     where user_id = u
    union all select seen_at           from public.exact_spots   where user_id = u
    union all select first_seen_at     from public.feed_signals  where user_id = u
    union all select last_seen_at      from public.feed_signals  where user_id = u
    union all select updated_at        from public.user_state    where user_id = u
    union all select created_at        from public.posts         where author_id = u
    union all select created_at        from public.comments      where author_id = u
    union all select created_at        from public.post_likes    where user_id = u
    union all select created_at        from public.questions     where author_id = u
    union all select created_at        from public.answers       where author_id = u
    union all select created_at        from public.messages      where sender_id = u
    union all select viewed_at         from public.story_views   where user_id = u
    union all select created_at        from public.hit_joins     where user_id = u
    union all select created_at        from public.court_checkins where user_id = u
  ) s, day_after d
  where s.t >= d.t
$function$;

CREATE OR REPLACE FUNCTION public.first_day_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare out jsonb;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  with people as (
    select p.id, p.created_at, p.first_move from public.profiles p
    where p.created_at >= now() - interval '120 days'
  ), marked as (
    select pe.*,
      (exists (select 1 from public.posts x where x.author_id = pe.id and x.created_at < pe.created_at + interval '1 day')
        or exists (select 1 from public.questions q where q.author_id = pe.id and q.created_at < pe.created_at + interval '1 day')
        or exists (select 1 from public.answers a where a.author_id = pe.id and a.created_at < pe.created_at + interval '1 day')) as moved,
      (exists (select 1 from public.feed_signals f where f.user_id = pe.id
                 and (f.last_seen_at between pe.created_at + interval '7 days' and pe.created_at + interval '14 days'
                      or f.first_seen_at between pe.created_at + interval '7 days' and pe.created_at + interval '14 days'))
        or exists (select 1 from public.posts x where x.author_id = pe.id and x.created_at between pe.created_at + interval '7 days' and pe.created_at + interval '14 days')
        or exists (select 1 from public.answers a where a.author_id = pe.id and a.created_at between pe.created_at + interval '7 days' and pe.created_at + interval '14 days')) as back
    from people pe
  )
  select jsonb_build_object(
    'new30', count(*) filter (where created_at >= now() - interval '30 days'),
    'moved30', count(*) filter (where created_at >= now() - interval '30 days' and moved),
    'cohort', count(*) filter (where created_at <= now() - interval '14 days'),
    'movers', count(*) filter (where created_at <= now() - interval '14 days' and moved),
    'moversBack', count(*) filter (where created_at <= now() - interval '14 days' and moved and back),
    'othersBack', count(*) filter (where created_at <= now() - interval '14 days' and not moved and back),
    'picked', jsonb_build_object(
      'post', count(*) filter (where first_move = 'post'),
      'instant', count(*) filter (where first_move = 'instant'),
      'answer', count(*) filter (where first_move = 'answer'),
      'ask', count(*) filter (where first_move = 'ask'),
      'later', count(*) filter (where first_move = 'later'),
      'invite', count(*) filter (where first_move = 'invite'),
      'follow', count(*) filter (where first_move = 'follow'),
      'find', count(*) filter (where first_move = 'find'))
  ) into out from marked;
  return out;
end $function$;

CREATE OR REPLACE FUNCTION public.feed_post_scores()
 RETURNS TABLE(post_id text, viewers integer, looks integer, watch_seconds real, skips integer, profile_taps integer, seen_by_me boolean, my_last_seen timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select f.target_id,
         (count(*) filter (where f.times_seen > 0 and f.user_id <> p.author_id))::int,
         coalesce(sum(f.times_seen) filter (where f.user_id <> p.author_id), 0)::int,
         coalesce(sum(f.watch_seconds) filter (where f.user_id <> p.author_id), 0)::real,
         coalesce(sum(f.skips) filter (where f.user_id <> p.author_id), 0)::int,
         coalesce(sum(f.profile_taps) filter (where f.user_id <> p.author_id), 0)::int,
         coalesce(bool_or(f.user_id = auth.uid() and f.times_seen > 0), false),
         max(f.last_seen_at) filter (where f.user_id = auth.uid() and f.times_seen > 0)
  from public.feed_signals f
  join public.posts p on p.id::text = f.target_id
  where f.target_kind = 'post' and auth.uid() is not null and p.removed_at is null
    and not p.archived and p.group_id is null
  group by f.target_id
  -- Newest posts first: the API hands back at most 1000 rows, so once more
  -- posts than that have been looked at, the ones it leaves out are the
  -- oldest, never a random handful of new ones you have already seen.
  order by max(p.created_at) desc, f.target_id
$function$;

CREATE OR REPLACE FUNCTION public.admin_new_players(p_days integer DEFAULT 7)
 RETURNS TABLE(id uuid, joined_at timestamp with time zone, adult boolean, posted boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  -- new_players_168
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    select p.id, p.created_at, public.known_adult(p.id),
           exists (select 1 from public.posts x where x.author_id = p.id and x.removed_at is null)
    from public.profiles p
    where p.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30))
      and p.suspended_at is null
      and p.id <> auth.uid()
      and not exists (select 1 from public.blocks b
                      where (b.blocker_id = auth.uid() and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
    order by p.created_at desc, p.id
    limit 200;
end $function$;

CREATE OR REPLACE FUNCTION public.session_minor_posts(who uuid)
 RETURNS TABLE(post_id uuid, entry jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with played as (
    -- Sessions `who` said yes to a tag on, and their side of the net.
    select t.session_id, t.tagger_id as logger, t.role as side
      from public.session_tags t
      join public.practice_sessions o on o.id = t.session_id and o.user_id = t.tagger_id and o.kind in ('match', 'practice')
     where t.tagged_id = who and t.status = 'accepted'
       and not public.is_blocked_between(t.tagger_id, who)
  ),
  logged as (
    -- Sessions `who` logged themselves: others may have posted their copies.
    select o.id as session_id, o.user_id as logger, 'partner'::text as side
      from public.practice_sessions o
     where o.user_id = who and o.from_session_id is null and o.kind in ('match', 'practice')
  ),
  carried as (
    -- The logger's own posts of it.
    select p.id, p.author_id, p.created_at, pl.side as role
      from played pl
      join public.posts p on p.author_id = pl.logger and p.removed_at is null
       and jsonb_typeof(p.session) = 'object' and lower(p.session->>'sessionId') = pl.session_id::text
    union all
    -- The posts others made from their copies of it, while `who` follows them.
    select p.id, p.author_id, p.created_at,
           case when c.kind = 'match' and s.side <> mine.role then 'opponent' else 'partner' end
      from (select * from played union all select * from logged) s
      join public.session_tags mine on mine.session_id = s.session_id and mine.tagger_id = s.logger
       and mine.status = 'accepted' and mine.tagged_id <> who
      join public.practice_sessions c on c.from_session_id = s.session_id and c.user_id = mine.tagged_id
       and c.kind in ('match', 'practice')
      join public.posts p on p.author_id = c.user_id and p.removed_at is null
       and jsonb_typeof(p.session) = 'object' and lower(p.session->>'sessionId') = c.id::text
     where exists (select 1 from public.follows f where f.follower_id = who and f.following_id = c.user_id)
       and not public.is_blocked_between(c.user_id, who)
  )
  select x.id, jsonb_build_object('id', pr.id, 'handle', pr.handle, 'name', pr.name, 'role', x.role)
    from carried x
    join public.profiles pr on pr.id = who
   where auth.uid() is not null
     and not public.is_blocked_between(auth.uid(), who)
     and (auth.uid() = who or x.author_id = auth.uid()
          or exists (select 1 from public.follows v where v.follower_id = who and v.following_id = auth.uid()))
   order by x.created_at desc
   limit 300
$function$;

CREATE OR REPLACE FUNCTION public.refresh_city_board()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t0 timestamptz := clock_timestamp();
  v_at timestamptz := clock_timestamp();
  v_rules record;
  v_months date[];
  v_m date;
  v_end date;
  v_old jsonb;
  v_was jsonb;
  -- "Played ..." is never today anywhere in the US: the last day before Honolulu's today.
  v_cutoff date := (now() at time zone 'Pacific/Honolulu')::date - 1;
  -- ...and only what was logged before Honolulu's today began: what others
  -- see changes once a day (10:00 UTC), never 15 minutes after someone logs,
  -- even a session logged today for an earlier day.
  v_day_cut timestamptz := ((now() at time zone 'Pacific/Honolulu')::date)::timestamp at time zone 'Pacific/Honolulu';
  -- Busiest courts are worked out once a week, from what was logged before this
  -- week began (Monday 00:00 UTC): a court's number never moves with a day, a
  -- session or one player switching off, only with a whole week.
  v_court_cut timestamptz := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
  -- A court named for where people live (most courts' access is 'unknown').
  v_home_words text := '(apartment|\mapts?\M|condo|townho|residen|estates|villas|\mhoa\M|homeowner|subdivision|backyard|back yard|\mhome\M|\mhouse\M|private|driveway|family|neighbou?rhood|club ?house|swim ?(and|&|n) ?(racquet|tennis)|\mpool\M)';
  c record;
  v_prev int;
  v_now int;
  v_day date;
  v_run int;
  v_n int;
  v_events int := 0;
  v_out jsonb := '[]'::jsonb;
  v_mt timestamptz;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('refresh_city_board', 196)) then
    return jsonb_build_object('skipped', 'already running');
  end if;
  select * into v_rules from private.city_board_rules();
  v_months := array(select distinct date_trunc('month', x)::date from unnest(array[current_date - 3, current_date, current_date + 1]) as x order by 1);

  foreach v_m in array v_months loop
    v_mt := clock_timestamp();
    v_end := (v_m + interval '1 month')::date;

    -- 1. Players: counted sessions, by the PROFILE town. Tennis only; logged
    --    within 7 days of the day played and not for a later day; at most 2 a
    --    day; not suspended. Everyone counted is in the totals. `named`: an
    --    adult who may be named to anyone (city_board_named). `friends_only`
    --    (197): a teen or no birthday on file, switch and activity status on,
    --    named only to friends who follow each other with them (city_page).
    --    Private and switched-off players: never named. `sessions` stops at
    --    yesterday in Hawaii (what others see); `sessions_now` has today (yours
    --    only). A player keeps the city (or no city) of their first counted
    --    session this month; after a town change they still count there, unnamed.
    select coalesce(jsonb_object_agg(mb.user_id::text, mb.city_id), '{}'::jsonb) into v_was
      from public.city_board_members mb where mb.month = v_m;
    delete from public.city_board_members where month = v_m;
    insert into public.city_board_members (month, user_id, city_id, sessions, sessions_now, named, friends_only)
    select v_m, x.user_id, y.city_id, x.sessions, x.sessions_now,
           y.city_id is not null and y.city_id = x.city_now and private.city_board_named(x.user_id),
           y.city_id is not null and y.city_id = x.city_now and private.city_board_friends_only(x.user_id)
      from (
        select k.user_id, count(*) filter (where k.day <= v_cutoff and k.created_at < v_day_cut)::int as sessions, count(*)::int as sessions_now,
               private.city_board_city(p.city_lat, p.city_lng, p.location) as city_now
          from (
            select s.user_id, s.day, s.created_at, row_number() over (partition by s.user_id, s.day order by s.created_at, s.id) as n
              from public.practice_sessions s
             where s.day >= v_m and s.day < v_end
               and s.kind in ('practice', 'match', 'drills')
               and s.created_at < (s.day + 8)::timestamp at time zone 'UTC'
               and s.day <= (s.created_at at time zone 'UTC')::date + 1
          ) k
          join public.profiles p on p.id = k.user_id and p.suspended_at is null
         where k.n <= 2
         group by k.user_id, p.city_lat, p.city_lng, p.location
      ) x
      cross join lateral (select case when v_was ? x.user_id::text then v_was ->> x.user_id::text else x.city_now end as city_id) y;

    -- 2. The words under a filled face, for players who may be named (to
    --    anyone, or to friends only): "Usually
    --    weekends / evenings / mornings" (6 of their last 10, at least 4 that
    --    say), else the last day they played (never today, at most a week back).
    with tzs as materialized (
      select x.tz as name
        from (select distinct us.tz from public.user_state us
                join public.city_board_members mb on mb.month = v_m and mb.user_id = us.user_id and (mb.named or mb.friends_only)
               where us.tz is not null) x
       where private.safe_tz(x.tz) is not null
    ), recent as (
      select s.user_id, s.day, s.created_at, s.activity_id,
             row_number() over (partition by s.user_id order by s.day desc, s.created_at desc, s.id) as n
        from public.practice_sessions s
        join public.city_board_members mb on mb.month = v_m and mb.user_id = s.user_id and (mb.named or mb.friends_only)
       where s.kind in ('practice', 'match', 'drills')
         and s.day <= v_cutoff and s.day > v_cutoff - 90
         and s.created_at < v_day_cut
         and s.created_at < (s.day + 8)::timestamp at time zone 'UTC'
    ), ten as (
      select r.user_id, r.day, extract(isodow from r.day) >= 6 as weekend,
             -- The hour it started: a tracker's own start in its own offset; else
             -- when it was logged, in the player's time zone, if logged that same day.
             coalesce(extract(hour from (a.started_at at time zone 'UTC') + make_interval(mins => a.tz_offset_min))::int,
                      case when z.name is not null and (r.created_at at time zone z.name)::date = r.day
                           then extract(hour from r.created_at at time zone z.name)::int end) as hour
        from recent r
        left join public.detected_activities a on a.id = r.activity_id and a.tz_offset_min is not null
        left join public.user_state us on us.user_id = r.user_id
        left join tzs z on z.name = us.tz
       where r.n <= 10
    ), sh as (
      select t.user_id, max(t.day) as last_day, count(*) as n, count(t.hour) as nh,
             count(*) filter (where t.weekend)::numeric / count(*) as wk,
             count(*) filter (where t.hour >= 17)::numeric / nullif(count(t.hour), 0) as ev,
             count(*) filter (where t.hour < 11)::numeric / nullif(count(t.hour), 0) as mo
        from ten t group by t.user_id
    )
    update public.city_board_members mb
       set last_day = case when sh.last_day >= v_cutoff - 5 then sh.last_day end,
           habit = (select h.word from (values ('weekends', case when sh.n >= 4 then sh.wk end, 1),
                                               ('evenings', case when sh.nh >= 4 then sh.ev end, 2),
                                               ('mornings', case when sh.nh >= 4 then sh.mo end, 3)) as h(word, share, o)
                     where h.share >= 0.6 order by h.share desc, h.o limit 1)
      from sh
     where mb.month = v_m and mb.user_id = sh.user_id;

    -- 3. Cities: totals of everyone counted up to yesterday; ranked only with min_players.
    select coalesce(jsonb_object_agg(cb.city_id, cb.rank), '{}'::jsonb) into v_old
      from public.city_board_cities cb where cb.month = v_m and cb.rank is not null;
    delete from public.city_board_cities where month = v_m;
    insert into public.city_board_cities (month, city_id, sessions, players, rank, per_value, per_rank)
    select v_m, x.city_id, x.sessions, x.players,
           case when x.ranked then rank() over (partition by x.ranked order by x.sessions desc) end,
           x.per_value,
           case when x.ranked then rank() over (partition by x.ranked order by x.per_value desc) end
      from (
        select mb.city_id, sum(mb.sessions)::int as sessions, count(*)::int as players,
               round(sum(mb.sessions)::numeric / count(*), 1) as per_value,
               count(*) >= v_rules.min_players and bc.country = 'US' as ranked
          from public.city_board_members mb join public.board_cities bc on bc.id = mb.city_id
         where mb.month = v_m and mb.sessions > 0 and mb.city_id is not null
         group by mb.city_id, bc.country
      ) x;

    -- Movement: against the snapshot 7 days ago, same month only.
    update public.city_board_cities cb set week_ago_rank = d.rank
      from public.city_board_daily d
     where cb.month = v_m and cb.rank is not null
       and d.month = v_m and d.day = current_date - 7 and d.city_id = cb.city_id and d.rank is not null;
    -- "Climbing N weeks running": 7-day steps back in a row that each improved.
    for c in select cb.city_id, cb.rank from public.city_board_cities cb where cb.month = v_m and cb.rank is not null loop
      v_run := 0;
      v_now := c.rank;
      v_day := current_date;
      loop
        v_prev := null;
        select d.rank into v_prev from public.city_board_daily d where d.month = v_m and d.city_id = c.city_id and d.day = v_day - 7;
        exit when v_prev is null or v_now >= v_prev or v_run >= 5;
        v_run := v_run + 1;
        v_now := v_prev;
        v_day := v_day - 7;
      end loop;
      if v_run > 0 then
        update public.city_board_cities set run = v_run where month = v_m and city_id = c.city_id;
      end if;
    end loop;

    -- News: every pair of ranked cities that swapped since the last refresh.
    insert into public.city_board_events (month, at, city_id, passed_id)
    select v_m, v_at, a.city_id, b.city_id
      from public.city_board_cities a
      join public.city_board_cities b on b.month = v_m and b.city_id <> a.city_id and b.rank is not null
     where a.month = v_m and a.rank is not null
       and v_old ? a.city_id and v_old ? b.city_id
       and a.rank < b.rank and (v_old ->> a.city_id)::int > (v_old ->> b.city_id)::int;
    get diagnostics v_n = row_count;
    v_events := v_events + v_n;
    -- Taken back within a day: neither is news.
    with flips as (
      select e.id as eid, f.id as fid
        from public.city_board_events e
        join public.city_board_events f on f.month = e.month and f.city_id = e.passed_id and f.passed_id = e.city_id
       where e.month = v_m and e.at = v_at and f.at < v_at and f.at >= v_at - interval '24 hours'
    )
    delete from public.city_board_events ev where ev.id in (select eid from flips union select fid from flips);

    -- One snapshot a day (the first run after 10:00 UTC, about 6am Eastern), within the month itself.
    if extract(hour from now() at time zone 'UTC') >= 10 and current_date >= v_m and current_date < v_end
       and not exists (select 1 from public.city_board_daily d where d.month = v_m and d.day = current_date) then
      insert into public.city_board_daily (month, day, city_id, rank, sessions, players)
      select v_m, current_date, cb.city_id, cb.rank, cb.sessions, cb.players from public.city_board_cities cb where cb.month = v_m;
    end if;

    -- 4. Busiest courts: parks (the app's ~250 m fold), courts only, no people.
    --    Worked out once a week, from what was logged before Monday 00:00 UTC,
    --    one park-week at a time, and a park-week once counted is never
    --    changed or taken back: a court's number only ever grows, a whole week
    --    at a time, so it never moves with a day, one session, or one player
    --    switching off, going private or leaving (which would point at them).
    --    Only sessions by players who may be named, with public accounts (teens,
    --    no birthday, private accounts, switched off: never), at courts with a
    --    name that are not anyone's home ('private', or named for an apartment,
    --    condo, HOA, backyard...). A park-week counts only with 3+ different
    --    players on 2+ different days (one group's one outing is not enough);
    --    the park's city is the park's own position, not who played there.
    if (select mo.courts_cut from public.city_board_months mo where mo.month = v_m) is distinct from v_court_cut then
      with at_courts as (
        select k.user_id, k.day, date_trunc('week', k.day::timestamp)::date as wk, ct.id as court_id, ct.name, ct.lat, ct.lng,
               round(ct.lat / 0.0022)::int as gi, round(ct.lng / 0.003)::int as gj
          from (
            select s.user_id, s.day, s.court_id, s.created_at,
                   row_number() over (partition by s.user_id, s.day order by s.created_at, s.id) as n
              from public.practice_sessions s
             where s.day >= v_m and s.day < v_end
               and s.kind in ('practice', 'match', 'drills')
               and s.created_at < (s.day + 8)::timestamp at time zone 'UTC'
               and s.day <= (s.created_at at time zone 'UTC')::date + 1
          ) k
          join public.profiles p on p.id = k.user_id and p.suspended_at is null and not p.is_private
          join public.courts ct on ct.id = k.court_id and ct.access <> 'private'
                               and nullif(btrim(coalesce(ct.name, '')), '') is not null
                               and ct.name !~* v_home_words
         where k.n <= 2 and k.court_id is not null and k.created_at < v_court_cut
           and private.city_board_named(k.user_id)
      ), cells as (
        select a.gi, a.gj, a.wk, count(*)::int as sessions, count(distinct a.user_id)::int as players, avg(a.lat) as lat, avg(a.lng) as lng
          from at_courts a
         where a.wk < (v_court_cut at time zone 'UTC')::date          -- whole weeks only
         group by a.gi, a.gj, a.wk
        having count(distinct a.user_id) >= v_rules.court_min_players and count(distinct a.day) >= 2
      ), placed as (
        select ce.*, private.city_board_city(ce.lat, ce.lng, null) as city_id, top.court_id, top.name,
               (select count(*)::int from public.courts ct
                 where ct.lat between (ce.gi - 0.5) * 0.0022 and (ce.gi + 0.5) * 0.0022
                   and ct.lng between (ce.gj - 0.5) * 0.003 and (ce.gj + 0.5) * 0.003
                   and round(ct.lat / 0.0022)::int = ce.gi and round(ct.lng / 0.003)::int = ce.gj
                   and ct.access <> 'private') as courts
          from cells ce
          cross join lateral (
            select a.court_id, a.name from at_courts a where a.gi = ce.gi and a.gj = ce.gj and a.wk = ce.wk
             group by a.court_id, a.name order by count(*) desc, a.court_id limit 1) top
      )
      insert into public.city_board_court_weeks (month, wk, park_key, city_id, court_id, name, courts, sessions, players)
      select v_m, pl.wk, pl.gi || ':' || pl.gj, pl.city_id, pl.court_id, pl.name, greatest(pl.courts, 1), pl.sessions, pl.players
        from placed pl where pl.city_id is not null
      on conflict (month, wk, park_key) do nothing;

      delete from public.city_board_courts where month = v_m;
      insert into public.city_board_courts (month, city_id, park_key, court_id, name, courts, sessions, players)
      select v_m, y.city_id, y.park_key, y.court_id, y.name, y.courts, y.sessions, y.players
        from (select w.city_id, w.park_key,
                     (array_agg(w.court_id order by w.sessions desc, w.wk desc))[1] as court_id,
                     (array_agg(w.name order by w.sessions desc, w.wk desc))[1] as name,
                     max(w.courts) as courts, sum(w.sessions)::int as sessions, max(w.players) as players,
                     row_number() over (partition by w.city_id order by sum(w.sessions) desc, max(w.players) desc, w.park_key) as r
                from public.city_board_court_weeks w
               where w.month = v_m
               group by w.city_id, w.park_key) y
       where y.r <= 3;
    end if;

    -- 5. Clip of the month: a post that may be one (city_board_clip_ok: what
    --    guest mode would show, a video, by a named adult, no court or place
    --    on it, everyone on it nameable), posted that month. Top 3 per city,
    --    one per author, by views; city_page checks each again for its viewer.
    delete from public.city_board_clips where month = v_m;
    insert into public.city_board_clips (month, city_id, post_id, author_id, views, place)
    select v_m, z.city_id, z.id, z.author_id, z.views, z.place
      from (
        select y.*, row_number() over (partition by y.city_id order by y.views desc, y.created_at desc, y.id)::smallint as place
          from (
            select distinct on (po.author_id) po.id, po.author_id, po.views, po.created_at,
                   private.city_board_city(p.city_lat, p.city_lng, p.location) as city_id
              from public.posts po join public.profiles p on p.id = po.author_id
             where po.created_at >= v_m::timestamp at time zone 'UTC' and po.created_at < v_end::timestamp at time zone 'UTC'
               and po.video_url is not null and not po.archived and po.removed_at is null and po.group_id is null
               and not p.is_private and p.suspended_at is null
               and private.city_board_clip_ok(po)
             order by po.author_id, po.views desc, po.created_at desc, po.id
          ) y
         where y.city_id is not null
      ) z
     where z.place <= 3;

    insert into public.city_board_months (month, refreshed_at, took_ms, courts_cut)
    values (v_m, clock_timestamp(), (extract(epoch from clock_timestamp() - v_mt) * 1000)::int, v_court_cut)
    on conflict (month) do update set refreshed_at = excluded.refreshed_at, took_ms = excluded.took_ms, courts_cut = excluded.courts_cut;

    v_out := v_out || jsonb_build_object('month', v_m,
      'players', (select count(*) from public.city_board_members where month = v_m),
      'cities', (select count(*) from public.city_board_cities where month = v_m),
      'ranked', (select count(*) from public.city_board_cities where month = v_m and rank is not null));
  end loop;

  -- Keep it small.
  delete from public.city_board_daily where day < current_date - 70;
  delete from public.city_board_events where at < now() - interval '14 days';
  delete from public.city_board_members where month < (date_trunc('month', current_date) - interval '13 months')::date;
  delete from public.city_board_cities where month < (date_trunc('month', current_date) - interval '13 months')::date;
  delete from public.city_board_courts where month < (date_trunc('month', current_date) - interval '13 months')::date;
  delete from public.city_board_court_weeks where month < (date_trunc('month', current_date) - interval '13 months')::date;
  delete from public.city_board_clips where month < (date_trunc('month', current_date) - interval '13 months')::date;
  delete from public.city_board_months where month < (date_trunc('month', current_date) - interval '13 months')::date;

  return jsonb_build_object('months', v_out, 'events', v_events,
    'took_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int);
end $function$;

drop function if exists public.auto_post_follows_session();
drop function if exists public.guard_auto_post();
drop function if exists public.drop_emptied_auto_post();
drop function if exists public.count_unsure_answers();
drop function if exists public.auto_post_for_session(uuid);
drop function if exists public.auto_post_for_session(uuid, boolean);
drop function if exists public.unsure_yes_taken_back();
drop function if exists public.auto_log_src_of(uuid, uuid, text);
drop function if exists public.log_unsure_tennis();
drop function if exists public.set_auto_log_sharing(text);
drop function if exists public.auto_post_shown(uuid);
drop function if exists public.auto_log_seen_by(uuid, text, boolean);
drop function if exists public.auto_log_audience_of(uuid, text);
drop function if exists public.unsure_learned(uuid, text);

-- Check: each function as it was before 193, and nothing of 193's left.
do $$
declare
  k text;
  want jsonb := '{
    "auto_log_activity(uuid,uuid)": "1798d5cf3efbfa7ae723372209347ff4",
    "send_activity_pushes(uuid,uuid[])": "42d79ffd3e542dd6c7bf0d59a26e67b5",
    "session_unposted(uuid,uuid)": "67a5c254f1a37d6c700f64fb88fa05d6",
    "mark_first_post()": "8de9ff13561a56b6d1668ce5369101cb",
    "share_preview(text,text)": "766840b69cde1c289d5f906ad2d9dc6b",
    "group_feed(uuid,timestamp with time zone,integer)": "3771d68a8983b7ccba53ed488dd3ff72",
    "invite_first_action(uuid,uuid)": "921304feccd26712d5098653ecce73b6",
    "invite_second_day(uuid,timestamp with time zone)": "f1c199bd787c4e2f55115e25d8b8156d",
    "invite_back_at(uuid,timestamp with time zone)": "8e321ac7fda0998f6a61d9b25a5522dc",
    "first_day_stats()": "abbab0e1c72f2d6447867428944ed0a9",
    "feed_post_scores()": "410042789f673344c269fe682f0eae0e",
    "admin_new_players(integer)": "326953796d896a3fd58bab643025fa02",
    "session_minor_posts(uuid)": "ae903d0b92aa69a1bd364994633c71f8",
    "refresh_city_board()": "259f5a95e81c26cf195f32a4b2425a48"
  }';
begin
  for k in select jsonb_object_keys(want) loop
    if (select md5(p.prosrc) from pg_proc p where p.oid = ('public.' || k)::regprocedure) is distinct from want->>k then
      raise exception 'Undo 193 stopped: % is not the version from before 193. Nothing was changed.', k;
    end if;
  end loop;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in
               ('auto_post_follows_session', 'guard_auto_post', 'drop_emptied_auto_post', 'count_unsure_answers', 'auto_post_for_session', 'log_unsure_tennis',
                'set_auto_log_sharing', 'auto_post_shown', 'auto_log_seen_by', 'auto_log_audience_of', 'unsure_learned',
                'unsure_yes_taken_back', 'auto_log_src_of'))
     or exists (select 1 from pg_policy where polrelid = 'public.posts'::regclass and polname = 'sessions that log themselves: only their audience')
     or exists (select 1 from pg_policy where polrelid = 'public.post_likes'::regclass and polname = 'sessions that log themselves: liked by their audience')
     or exists (select 1 from public.posts where auto_logged) then
    raise exception 'Undo 193 stopped: something of 193 is still there. Nothing was changed.';
  end if;
end $$;

commit;
