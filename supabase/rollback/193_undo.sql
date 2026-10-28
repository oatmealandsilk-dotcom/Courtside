-- CourtSide · undo for migration 20261027000193_auto_log_mutuals.
--
-- NOT A MIGRATION (it lives outside supabase/migrations on purpose). Run it in
-- the Supabase SQL editor as one piece only to take 193 back out. It puts
-- back, word for word, the live versions of the ten functions 193 changed,
-- as read from the live database on Oct 27 2026 before 193 (185's
-- auto_log_activity, send_activity_pushes and session_unposted, and
-- mark_first_post, share_preview, group_feed, invite_first_action,
-- invite_second_day, invite_back_at, first_day_stats), and takes out 193's
-- read rule, triggers and new functions. All-or-nothing; safe to run more
-- than once.
--
-- The posts the server made for sessions that logged themselves are DELETED
-- (with their likes and comments): without 193's read rule they would show
-- to anyone who can see their player's posts. The sessions themselves stay
-- in their players' logs, private, as under 185. What stays, unused: the new
-- columns (posts.auto_logged, user_state.auto_log_audience and unsure_yes).
-- An app with 193's update still shows Settings' choice and its words; after
-- this undo nothing of it reaches anyone else until 193 runs again (sessions
-- that log themselves are private, as under 185). The undo of the functions
-- 193 changed comes first, while they still exist in 193's form; the new
-- functions they call go after.

begin;

-- First, while 193's read rule still stands: the server's posts go.
delete from public.posts where auto_logged;

drop policy if exists "sessions that log themselves: only their audience" on public.posts;
drop trigger if exists auto_post_guard on public.posts;
drop trigger if exists auto_post_emptied on public.posts;
drop trigger if exists auto_post_follows_session on public.practice_sessions;
drop trigger if exists count_unsure_answers on public.detected_activities;

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

drop function if exists public.auto_post_follows_session();
drop function if exists public.guard_auto_post();
drop function if exists public.drop_emptied_auto_post();
drop function if exists public.count_unsure_answers();
drop function if exists public.auto_post_for_session(uuid);
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
    "first_day_stats()": "abbab0e1c72f2d6447867428944ed0a9"
  }';
begin
  for k in select jsonb_object_keys(want) loop
    if (select md5(p.prosrc) from pg_proc p where p.oid = ('public.' || k)::regprocedure) is distinct from want->>k then
      raise exception 'Undo 193 stopped: % is not the version from before 193. Nothing was changed.', k;
    end if;
  end loop;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in
               ('auto_post_follows_session', 'guard_auto_post', 'drop_emptied_auto_post', 'count_unsure_answers', 'auto_post_for_session', 'log_unsure_tennis',
                'set_auto_log_sharing', 'auto_post_shown', 'auto_log_seen_by', 'auto_log_audience_of', 'unsure_learned'))
     or exists (select 1 from pg_policy where polrelid = 'public.posts'::regclass and polname = 'sessions that log themselves: only their audience')
     or exists (select 1 from public.posts where auto_logged) then
    raise exception 'Undo 193 stopped: something of 193 is still there. Nothing was changed.';
  end if;
end $$;

commit;
