-- CourtSide · undo for migration 20261029000201_notif_tune (201).
--
-- NOT A MIGRATION (it lives outside supabase/migrations on purpose). Run it in
-- the Supabase SQL editor as one piece only to take 201 back out.
-- All-or-nothing; safe to run more than once.
--
-- It puts back push_for_notification, send_activity_pushes and
-- tell_adults_new_player exactly as they were live on Oct 29 (checked letter
-- for letter at the end), stops the two jobs (courtside-like-bundles,
-- courtside-catch-up-alerts), and removes what 201 added: the catch-up
-- function, the like and workout helpers, private.push_sends and
-- user_state.push_catch_up. Afterwards: workout alerts have no daily limit,
-- every like buzzes on its own, 10 and 25 views buzz again, comments buzz
-- with "Likes and comments" off, "A friend new to CourtSide checked in"
-- goes to every adult nearby with the map on again (the privacy fix is
-- undone too), and no catch-up alerts are sent. The lines already in
-- public.nudges (kind 'catch-up') stay, as a record. The app hides its
-- "Catch-up alerts" switch by itself once the column is gone.

begin;

do $$
declare
  r record;
  want jsonb := '{
    "push_for_notification": ["5d81017b02bec3c24b735b6489b7ccbf", "7cb911ec389617fe1d6c341664e1997c"],
    "send_activity_pushes": ["c07030432cc8698f53f9e8ab0646bae8", "439790d34a77a14d5dcc4fee80947add"],
    "tell_adults_new_player": ["76a46bd9d39a7ce1e647a69d7d6ee18c", "7e44fe562f1092d35c40219e4484612e"]
  }';
begin
  for r in select k.key as fn, (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = k.key) as n,
                  (select max(md5(p.prosrc)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = k.key) as now_is,
                  k.value as ok
             from jsonb_each(want) k loop
    if r.n <> 1 or not coalesce(r.ok @> to_jsonb(r.now_is), false) then
      raise exception 'Undo 201 stopped before changing anything: % changed after 201. Ask Claude to look.', r.fn;
    end if;
  end loop;
end $$;

-- The two jobs stop first, so nothing calls what goes next.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'courtside-like-bundles') then perform cron.unschedule('courtside-like-bundles'); end if;
    if exists (select 1 from cron.job where jobname = 'courtside-catch-up-alerts') then perform cron.unschedule('courtside-catch-up-alerts'); end if;
  end if;
end $$;

-- The three functions, exactly as they were live before 201.
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
  -- "Sam just joined CourtSide in Raleigh" has its own switch (migration 146). The row
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
    -- Their town, as their profile says it (migration 191), never how near they are.
    when 'joined' then 'just joined CourtSide' || coalesce(' in ' || nullif(btrim(split_part(coalesce(new.preview, ''), ',', 1)), ''), '')
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
    coalesce(who, 'Someone') || ' ' || what || case when new.kind = 'joined' then '' else coalesce(': ' || nullif(btrim(new.preview), ''), '') end, link);
  return new;
end $function$

;

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
    for r in select d.id, d.sport, d.status, d.unsure, d.source from public.detected_activities d where d.id = any(v_due) order by d.ended_at loop
      if r.status = 'logged' then
        -- Opens its post page (photo, score, tags, court, caption).
        -- Who can see it, in the player's own setting (193): "Friends who follow you back can see it".
        perform public.send_push(u, 'Tennis logged', public.auto_log_seen_by(u, public.auto_log_src_of(u, r.id, r.source), false) || ' · tap to add the score or post it.', '/log-session?activity=' || r.id);
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
    -- Who can see them: the widest of the go (193, review), so it never says fewer people than see one.
    case when v_auto then public.auto_log_seen_by(u, (select x.src from (select public.auto_log_src_of(u, d.id, d.source) as src from public.detected_activities d where d.id = any(v_go)) x
                                                    order by case public.auto_log_audience_of(u, x.src) when 'public' then 0 when 'mutuals' then 1 else 2 end limit 1), true) || ' · tap to post one.' else 'Tap to log them on CourtSide.' end,
    '/notifications?workouts=' || array_to_string(v_go[1:40], ','));
  update public.detected_activities set pushed_at = now(), pushed_as = case when id = v_due[1] then 'found' else 'folded' end where id = any(v_due);
  return 'pushed-found';
end $function$

;

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
        where s.user_id <> new.user_id and s.seen_at > now() - interval '30 days' and s.until > now()
          and public.known_adult(s.user_id)
          and public.km_between(new.lat, new.lng, s.lat, s.lng) <= 50
          and not exists (select 1 from public.notifications n where n.user_id = s.user_id and n.actor_id = new.user_id and n.kind = 'joined')
          and public.spot_shown_to(s.user_id, new.user_id)
        order by 2 limit 50) x
      order by x.id
    loop
      perform public.send_map_alert(r.id, new.user_id, 'map-new-player', new.user_id::text, 'profile',
        public.miles_text(r.km) || ' from you',
        'A friend new to CourtSide checked in',
        public.miles_text(r.km) || ' from you. Say hi on the map.',
        '/map?lat=' || new.lat || '&lng=' || new.lng);
    end loop;
  exception when others then
    raise warning 'map alerts for new player %: %', new.user_id, sqlerrm;
  end;
  return new;
end $function$

;

revoke all on function public.send_activity_pushes(uuid, uuid[]) from public, anon, authenticated;

-- What 201 added.
drop function if exists public.send_catch_up_alerts(timestamptz, boolean);
drop function if exists private.send_like_bundles(timestamptz, boolean);
drop function if exists private.like_bundle_words(uuid, uuid, integer, text, text, text);
drop function if exists private.like_comment_mix(uuid, text, text, timestamptz, timestamptz);
drop function if exists private.like_noun(uuid, text, text, text);
drop function if exists private.take_activity_push(uuid);
drop table if exists private.push_sends;
alter table public.user_state drop column if exists push_catch_up;
-- Sessions filed without a buzz under 201's three a day count as alerted ('one'), so none buzzes late.
update public.detected_activities set pushed_as = 'one' where pushed_as = 'capped';
alter table public.detected_activities drop constraint if exists detected_activities_pushed_as_check;
alter table public.detected_activities add constraint detected_activities_pushed_as_check
  check (pushed_as is null or pushed_as in ('one', 'found', 'folded'));

do $$
begin
  if (select md5(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'push_for_notification') <> '5d81017b02bec3c24b735b6489b7ccbf'
     or (select md5(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'send_activity_pushes') <> 'c07030432cc8698f53f9e8ab0646bae8'
     or (select md5(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'tell_adults_new_player') <> '76a46bd9d39a7ce1e647a69d7d6ee18c'
     or to_regprocedure('public.send_catch_up_alerts(timestamp with time zone, boolean)') is not null
     or to_regclass('private.push_sends') is not null
     or exists (select 1 from public.detected_activities where pushed_as = 'capped')
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'push_catch_up')
     or (exists (select 1 from pg_extension where extname = 'pg_cron')
         and exists (select 1 from cron.job where jobname in ('courtside-like-bundles', 'courtside-catch-up-alerts'))) then
    raise exception 'Undo 201 stopped: the result was not as planned. Nothing was changed.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
