-- CourtSide · migration 20261029000201: fewer, better phone alerts.
--
-- NOT APPLIED. Run it in the Supabase SQL editor as one piece, after 200 (or
-- before it: they touch nothing in common). The app update that shows the
-- new "Catch-up alerts" switch reads this file's column and hides the switch
-- until it is there, so either can go first. Never the "store" channel.
-- All-or-nothing: if a check fails, it stops and nothing at all changes.
-- Safe to run more than once. Undo: supabase/rollback/201_undo.sql.
--
-- The owner, Oct 29, choosing from the alerts audit: "activity dected can be
-- up to 3 times a day, … bundle likes is good, night quiet hours i dont htink
-- is neccessary, come back alerts every 5 days."
--
-- What changes:
--   1. "Activity detected", "Tennis detected", "Was this tennis?", "Tennis
--      logged" and "N workouts found" (send_activity_pushes): at most 3 of
--      these phone alerts per person per day, their own day (user_state.tz;
--      UTC when the phone has not said). A 4th and later that day is still
--      filed in Notifications and To do as before, only without the buzz
--      (detected_activities.pushed_as = 'capped'). One WHOOP player got 27
--      in 14 days; nobody's alerts are switched off.
--   2. Likes, bundled: at most one like alert per post (or instant) per
--      hour. The first like buzzes as before ("Sam liked your post: …").
--      Likes in the hour after it are filed in Notifications as always, and
--      once the hour is up ONE alert says "Sam and 4 others liked your clip"
--      (the newest liker by name; clip, photo, session or post by what the
--      post is; "comment" when it was your comment on someone else's post;
--      "instant" for an instant). A like after a quiet hour buzzes at once,
--      counting the ones since the last alert. The "Likes and comments"
--      switch still stops them all.
--      "Your post is taking off": the first alert is now at 50 views (10 and
--      25 no longer buzz; 100, 250 and on stay). The rows still show in
--      Notifications, as before.
--   3. Catch-up alerts (new): for a player with the phone app who has not
--      opened CourtSide for 5 days or more, one alert, then again every 5
--      days while they are still away, and ONLY when there is something real
--      and specific to say, the first of:
--        a. friends who follow each other with them are up for a hit today,
--           near their town ("Sam and Alex are up for a hit today");
--        b. players near their town have open hits in the next 7 days
--           ("3 players near Raleigh are up for a hit this week"; known
--           adults only, as for "New open hits");
--        c. a friend who follows each other with them posted a clip or a
--           session since they left ("Sam posted a new clip");
--        d. their city moved up the city board this week ("Raleigh moved up
--           to #3 on the city board").
--      Nothing to say: no alert (it looks again the next hour). It is one of
--      the come-back alerts of 170/171/180: 9am to 9pm their time, at most
--      one of them a day (private.nudge_ok), and recorded in public.nudges.
--      Teens: never a stranger's name, never a hit by a stranger; only
--      friends who follow each other with them, under the map's teen rule
--      (send_map_alert), and the city board. Its own switch: Settings →
--      Notifications → "Catch-up alerts" (user_state.push_catch_up, on to
--      start with). Away means: no "opened the app" day (app_opens, 110)
--      and no phone check-in (push_tokens.updated_at) in the last 5 days.
--      Words never say how far away anyone is.
--   4. Fix: the "Likes and comments" switch now also stops comment alerts
--      ("Sam commented on your post") and comment replies ("Sam replied to
--      your comment"). It only stopped likes and upvotes before.
--   5. Privacy fix (Apple 5.1.2(i), teen rules): "A friend new to CourtSide
--      checked in" (tell_adults_new_player) went to every adult within 50 km
--      who had the map on, friends or not. Now only to friends who follow
--      each other with the new player (and still adults, still with the
--      "Friends new to CourtSide" switch, still at most one map alert a day).
--
-- No quiet hours: likes, comments and workout alerts still buzz at any hour,
-- as the owner chose. Nothing else changes: words of single alerts, links,
-- the other switches, messages, the map's other alerts.
--
-- Adds: user_state.push_catch_up, private.push_sends (one line per person
-- and kind: the last like alert per post, the day's workout alert count;
-- nobody can read it from the app), private.take_activity_push,
-- private.like_noun, private.like_bundle_words, private.send_like_bundles,
-- public.send_catch_up_alerts, two pg_cron jobs (courtside-like-bundles every
-- 10 minutes, courtside-catch-up-alerts at 55 past every hour), and 'capped'
-- to detected_activities.pushed_as's list. Replaces: push_for_notification,
-- send_activity_pushes, tell_adults_new_player.

begin;

-- ------------------------------------------------------------------ 0. check
-- The functions this file changes, as read from the live database on Oct 29
-- (or as this file leaves them, so a second run passes).
do $$
declare
  r record;
  want jsonb := '{
    "push_for_notification": ["5d81017b02bec3c24b735b6489b7ccbf", "38654034e46b1ddabc0af87e81d2096e"],
    "send_activity_pushes": ["c07030432cc8698f53f9e8ab0646bae8", "439790d34a77a14d5dcc4fee80947add"],
    "tell_adults_new_player": ["76a46bd9d39a7ce1e647a69d7d6ee18c", "7e44fe562f1092d35c40219e4484612e"]
  }';
begin
  if to_regclass('public.notifications') is null or to_regclass('public.detected_activities') is null
     or to_regclass('public.user_state') is null or to_regclass('public.nudges') is null
     or to_regclass('public.app_opens') is null or to_regclass('public.push_tokens') is null
     or to_regclass('public.hit_requests') is null or to_regclass('public.last_seen') is null
     or to_regclass('public.city_board_cities') is null or to_regclass('public.city_board_members') is null
     or to_regclass('public.board_cities') is null or to_regclass('public.post_demotions') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'tz')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'auto_held')
     or to_regprocedure('private.nudge_ok(uuid, timestamp with time zone)') is null
     or to_regprocedure('private.send_nudge(uuid, text, text, text, text, timestamp with time zone)') is null
     or to_regprocedure('public.send_push(uuid, text, text, text)') is null
     or to_regprocedure('public.follow_each_other(uuid, uuid)') is null or to_regprocedure('public.known_adult(uuid)') is null
     or to_regprocedure('public.is_blocked_between(uuid, uuid)') is null or to_regprocedure('public.spot_shown_to(uuid, uuid)') is null
     or to_regprocedure('public.km_between(double precision, double precision, double precision, double precision)') is null
     or to_regprocedure('public.hit_is_open(uuid)') is null or to_regprocedure('public.hit_point(jsonb)') is null
     or to_regprocedure('public.auto_log_audience_of(uuid, text)') is null then
    raise exception 'Migration 20261029000201 stopped before changing anything: a table or function it needs (110, 170, 185, 191, 193, 196) is missing.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'push_catch_up' and data_type <> 'boolean') then
    raise exception 'Migration 20261029000201 stopped before changing anything: user_state already has a push_catch_up column that is not a yes/no.';
  end if;
  for r in select k.key as fn, (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = k.key) as n,
                  (select max(md5(p.prosrc)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = k.key) as now_is,
                  k.value as ok
             from jsonb_each(want) k loop
    if r.n <> 1 or not coalesce(r.ok @> to_jsonb(r.now_is), false) then
      raise exception 'Migration 20261029000201 stopped before changing anything: % changed since it was read on Oct 29. This file must be brought up to date with that change first.', r.fn;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------- 1. the switch
-- Settings → Notifications → "Catch-up alerts" (step 3). On to start with.
alter table public.user_state add column if not exists push_catch_up boolean not null default true;

-- ------------------------------------------------------- 2. the alert notebook
-- One line per person, kind and subject: 'like' + 'post:<id>' (or 'hit:<id>')
-- holds when that post's last like alert went; 'activity' + '2026-10-29'
-- (their own day) holds how many workout alerts went that day (n). Nobody
-- reads or writes it from the app; only the functions below.
create schema if not exists private;
create table if not exists private.push_sends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind    text not null check (char_length(kind) between 1 and 20),
  ref     text not null check (char_length(ref) between 1 and 120),
  sent_at timestamptz not null default now(),
  n       integer not null default 1,
  primary key (user_id, kind, ref)
);
create index if not exists push_sends_sent_idx on private.push_sends (kind, sent_at);
alter table private.push_sends enable row level security;
revoke all on private.push_sends from public, anon, authenticated;

-- ------------------------------------------------- 3. workouts: 3 a day (step 1)
-- A session filed without its buzz because the day's three went: 'capped'
-- (138's list of how one was alerted, plus that).
alter table public.detected_activities drop constraint if exists detected_activities_pushed_as_check;
alter table public.detected_activities add constraint detected_activities_pushed_as_check
  check (pushed_as is null or pushed_as in ('one', 'found', 'folded', 'capped'));

-- Takes one of today's three workout alerts for this person: true (and
-- counted) if one is left, false if all three went today. Their own day.
create or replace function private.take_activity_push(u uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  zone text;
  d text;
  got integer;
begin
  if u is null then return false; end if;
  select us.tz into zone from public.user_state us where us.user_id = u;
  begin
    d := to_char(now() at time zone coalesce(zone, 'UTC'), 'YYYY-MM-DD');
  exception when others then
    d := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  end;
  insert into private.push_sends as s (user_id, kind, ref, sent_at, n) values (u, 'activity', d, now(), 1)
    on conflict (user_id, kind, ref) do update set n = s.n + 1, sent_at = now() where s.n < 3
    returning s.n into got;
  return got is not null;
end $$;
revoke all on function private.take_activity_push(uuid) from public, anon, authenticated;

-- 185/193's send_activity_pushes, with the day's three: each alert it would
-- send first takes one of them; with none left that day the session is
-- marked 'capped' (filed, alerted as far as the "send again" rule is
-- concerned, no buzz). Everything else word for word.
create or replace function public.send_activity_pushes(u uuid, ids uuid[])
returns text language plpgsql security definer set search_path = public as $$
declare
  v_due uuid[];
  v_ones uuid[];
  v_go uuid[];
  v_found boolean;
  v_n int;
  v_tennis boolean;
  v_auto boolean;
  v_capped uuid[] := '{}';
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
      -- (201) At most three a day: the rest are filed without the buzz.
      if not private.take_activity_push(u) then
        v_capped := v_capped || r.id;
        continue;
      end if;
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
    update public.detected_activities set pushed_at = now(), pushed_as = case when id = any(v_capped) then 'capped' else 'one' end where id = any(v_due);
    return case when cardinality(v_capped) = cardinality(v_due) then 'capped' else 'pushed' end;
  end if;
  -- (201) More than three, and none of today's three left: filed without the buzz.
  if not private.take_activity_push(u) then
    update public.detected_activities set pushed_at = now(), pushed_as = 'capped' where id = any(v_due);
    return 'capped';
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
end $$;
revoke all on function public.send_activity_pushes(uuid, uuid[]) from public, anon, authenticated;

-- ------------------------------------------------------ 4. likes, bundled (step 2)
-- What was liked, in the alert's word: "clip", "photo", "session" or "post"
-- for the recipient's own post; "comment" for their comment on someone
-- else's post (or instant); "instant" for their instant; "thread" for a thread.
create or replace function private.like_noun(recipient uuid, p_kind text, p_id text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  p public.posts;
  st_author uuid;
begin
  if p_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return case p_kind when 'hit' then 'instant' when 'question' then 'thread' else 'post' end;
  end if;
  if p_kind = 'post' then
    select * into p from public.posts where id = p_id::uuid;
    if not found then return 'post'; end if;
    if p.author_id is distinct from recipient then return 'comment'; end if;
    if p.kind = 'clip' or p.video_url is not null then return 'clip'; end if;
    if jsonb_typeof(p.session) = 'object' then return 'session'; end if;
    if p.image_url is not null or coalesce(cardinality(p.image_urls), 0) > 0 then return 'photo'; end if;
    return 'post';
  elsif p_kind = 'hit' then
    select author_id into st_author from public.stories where id = p_id::uuid;
    return case when st_author is not distinct from recipient or st_author is null then 'instant' else 'comment' end;
  elsif p_kind = 'question' then
    return 'thread';
  end if;
  return 'post';
end $$;
revoke all on function private.like_noun(uuid, text, text) from public, anon, authenticated;

-- "Sam and 4 others liked your clip". `others` is how many more people liked it since the last alert.
create or replace function private.like_bundle_words(recipient uuid, actor uuid, others integer, p_kind text, p_id text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(nullif(name, ''), handle) from public.profiles where id = actor), 'Someone')
    || ' and ' || others || case when others = 1 then ' other' else ' others' end
    || ' liked your ' || private.like_noun(recipient, p_kind, p_id)
$$;
revoke all on function private.like_bundle_words(uuid, uuid, integer, text, text) from public, anon, authenticated;

-- The alert for every new Notifications row (14, 37, 86, 146, 151, 153, 191),
-- word for word, with three changes (201): the view milestones buzz from 50;
-- "Likes and comments" off also stops comments and comment replies; a like
-- buzzes at most once an hour per post, and the first after a held hour
-- counts the others ("Sam and 4 others liked your clip").
create or replace function public.push_for_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  what text;
  link text;
  likes_on boolean := true;
  coach_on boolean := true;
  hit_chat uuid;
  v_ref text;
  v_prev timestamptz;
  v_others integer := 0;
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
    -- (201) "Your post is taking off" from 50 views; 10 and 25 are filed in Notifications only.
    if coalesce(nullif(regexp_replace(split_part(coalesce(new.preview, ''), ' ', 1), '[^0-9]', '', 'g'), ''), '0')::numeric < 50 then return new; end if;
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
  -- (201) "Likes and comments" means comments too.
  if new.kind in ('comment', 'comment-reply') and likes_on is false then return new; end if;
  if new.kind in ('coach-reply', 'coach-answer') and coach_on is false then return new; end if;
  -- "Sam just joined CourtSide in Raleigh" has its own switch (migration 146). The row
  -- still lands in Notifications; only the phone alert is left out.
  if new.kind = 'joined' and exists (select 1 from public.user_state where user_id = new.user_id and push_joined is false) then return new; end if;
  select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
  link := case
    when new.kind in ('follow', 'follow-request', 'follow-accepted', 'joined') then '/user/' || new.actor_id
    when new.target_kind = 'coaching-request' then '/coach-request/' || new.target_id
    when new.target_kind = 'post' then '/post/' || new.target_id
    when new.target_kind = 'hit' then '/hits/' || new.target_id
    when new.target_kind = 'question' then '/question/' || new.target_id
    when new.target_kind = 'hit-request' then '/hit-request/' || new.target_id
    else '/notifications' end;
  -- (201) Likes: one alert per post an hour. Held ones go out together once
  -- the hour is up (private.send_like_bundles); a like after a quiet hour
  -- buzzes now and counts the ones since the last alert. Should anything
  -- here fail, the like still buzzes as before: a like is never lost.
  if new.kind = 'like' and new.target_id is not null then
    begin
      v_ref := left(coalesce(new.target_kind, '') || ':' || new.target_id, 120);
      select s.sent_at into v_prev from private.push_sends s
       where s.user_id = new.user_id and s.kind = 'like' and s.ref = v_ref for update;
      if found then
        if v_prev > now() - interval '1 hour' then return new; end if;
        update private.push_sends set sent_at = now(), n = 1 where user_id = new.user_id and kind = 'like' and ref = v_ref;
        select count(distinct n.actor_id) into v_others from public.notifications n
         where n.user_id = new.user_id and n.kind = 'like' and n.target_id = new.target_id
           and n.target_kind is not distinct from new.target_kind
           and n.actor_id is distinct from new.actor_id and n.id <> new.id
           and n.created_at > v_prev and n.created_at <= now();
      else
        insert into private.push_sends (user_id, kind, ref, sent_at) values (new.user_id, 'like', v_ref, now())
          on conflict (user_id, kind, ref) do nothing;
        -- Another like's alert just took this hour.
        if not found then return new; end if;
      end if;
      if v_others > 0 then
        perform public.send_push(new.user_id, 'CourtSide', private.like_bundle_words(new.user_id, new.actor_id, v_others, new.target_kind, new.target_id), link);
        return new;
      end if;
    exception when others then
      raise warning 'like alert bundling for %: %', new.user_id, sqlerrm;
    end;
  end if;
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
  -- Two lines like other apps (migration 86): the app name on top, what happened underneath.
  perform public.send_push(new.user_id, 'CourtSide',
    coalesce(who, 'Someone') || ' ' || what || case when new.kind = 'joined' then '' else coalesce(': ' || nullif(btrim(new.preview), ''), '') end, link);
  return new;
end $$;

-- Every 10 minutes: likes held back in the hour after an alert go out as
-- one ("Sam and 4 others liked your clip"; "Sam liked your post: …" when it
-- was one) once that hour is up. Also clears notebook lines older than 40 days.
create or replace function private.send_like_bundles(p_now timestamptz default now(), p_dry_run boolean default false)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  v_latest record;
  v_count integer;
  v_body text;
  v_link text;
  sent integer := 0;
begin
  if not p_dry_run then
    delete from private.push_sends where sent_at < p_now - interval '40 days';
  end if;
  for r in
    select s.user_id, s.ref, s.sent_at, split_part(s.ref, ':', 1) as t_kind, substr(s.ref, strpos(s.ref, ':') + 1) as t_id
      from private.push_sends s
     where s.kind = 'like' and s.sent_at <= p_now - interval '1 hour' and s.sent_at > p_now - interval '3 hours'
     order by s.sent_at
     limit 500
  loop
    begin
      select n.actor_id, n.preview, n.created_at into v_latest from public.notifications n
       where n.user_id = r.user_id and n.kind = 'like' and n.target_id = r.t_id
         and coalesce(n.target_kind, '') = r.t_kind and n.created_at > r.sent_at and n.created_at <= p_now
       order by n.created_at desc limit 1;
      continue when not found;
      select count(distinct n.actor_id) into v_count from public.notifications n
       where n.user_id = r.user_id and n.kind = 'like' and n.target_id = r.t_id
         and coalesce(n.target_kind, '') = r.t_kind and n.created_at > r.sent_at and n.created_at <= p_now;
      if not p_dry_run then
        update private.push_sends set sent_at = p_now where user_id = r.user_id and kind = 'like' and ref = r.ref and sent_at = r.sent_at;
        continue when not found;
      end if;
      continue when exists (select 1 from public.user_state us where us.user_id = r.user_id and us.push_likes is false);
      continue when exists (select 1 from public.profiles p where p.id = r.user_id and p.suspended_at is not null);
      v_link := case r.t_kind when 'post' then '/post/' || r.t_id when 'hit' then '/hits/' || r.t_id
                              when 'question' then '/question/' || r.t_id else '/notifications' end;
      if v_count > 1 then
        v_body := private.like_bundle_words(r.user_id, v_latest.actor_id, v_count - 1, r.t_kind, r.t_id);
      else
        -- One like: the usual words.
        v_body := coalesce((select coalesce(nullif(name, ''), handle) from public.profiles where id = v_latest.actor_id), 'Someone')
          || ' liked your ' || case r.t_kind when 'hit' then 'instant' when 'question' then 'thread' else 'post' end
          || coalesce(': ' || nullif(btrim(v_latest.preview), ''), '');
      end if;
      if not p_dry_run then
        perform public.send_push(r.user_id, 'CourtSide', v_body, v_link);
      end if;
      sent := sent + 1;
    exception when others then
      raise warning 'like bundle for %: %', r.user_id, sqlerrm;
    end;
  end loop;
  return sent;
end $$;
revoke all on function private.send_like_bundles(timestamptz, boolean) from public, anon, authenticated;

-- --------------------------------------- 5. "A friend new to CourtSide" (step 5)
-- 78/124's tell_adults_new_player, word for word, except who hears it: only
-- friends who follow each other with the new player (it said "a friend"
-- and went to every adult with the map on within 50 km).
create or replace function public.tell_adults_new_player()
returns trigger language plpgsql security definer set search_path = public as $$
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
          -- (201) Friends only: they follow each other.
          and public.follow_each_other(s.user_id, new.user_id)
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
end $$;

-- ------------------------------------------------ 6. catch-up alerts (step 3)
-- Hourly. p_dry_run: who would get one right now, in the exact words; sends
-- and records nothing.
create or replace function public.send_catch_up_alerts(p_now timestamptz default now(), p_dry_run boolean default false)
returns table (who uuid, nudge text, words text, link text)
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  w text;
  l text;
  here_lat double precision;
  here_lng double precision;
  town text;
  v_n integer;
  v_names text[];
  v_first uuid;
  v_weekend boolean;
  v_clips boolean;
  v_sessions boolean;
  v_post uuid;
  since timestamptz;
  planned uuid[] := '{}';
begin
  for r in
    -- Only time zones Postgres knows (the list is read first, so a bad name can never stop the job).
    with zones as materialized (select z.name from pg_catalog.pg_timezone_names z),
    people as materialized (
      select us.user_id, us.tz, coalesce(us.muted_ids, '{}') || coalesce(us.blocked_ids, '{}') as quiet,
             (p_now at time zone us.tz)::date as today
        from public.user_state us
        join public.profiles pr on pr.id = us.user_id and pr.suspended_at is null
       where us.tz is not null and us.tz in (select name from zones)
         and us.push_catch_up is not false
         and exists (select 1 from public.push_tokens t where t.user_id = us.user_id)
    )
    select pe.user_id, pe.tz, pe.quiet, pe.today, pr.location, pr.city_lat, pr.city_lng,
           ls.lat as spot_lat, ls.lng as spot_lng,
           greatest((select max(a.day) from public.app_opens a where a.user_id = pe.user_id),
                    (select (max(t.updated_at) at time zone pe.tz)::date from public.push_tokens t where t.user_id = pe.user_id)) as last_day,
           (select max((n.sent_at at time zone pe.tz)::date) from public.nudges n where n.user_id = pe.user_id and n.kind = 'catch-up') as last_alert
      from people pe
      join public.profiles pr on pr.id = pe.user_id
      left join public.last_seen ls on ls.user_id = pe.user_id
     order by pe.user_id
     limit 5000
  loop
    begin
      -- Away 5 days or more, and 5 days or more since the last of these.
      continue when r.last_day is null or r.today - r.last_day < 5;
      continue when r.last_alert is not null and r.today - r.last_alert < 5;
      continue when r.user_id = any (planned);
      continue when not private.nudge_ok(r.user_id, p_now);
      w := null; l := null;
      here_lat := coalesce(r.city_lat, r.spot_lat);
      here_lng := case when r.city_lat is not null then r.city_lng else r.spot_lng end;
      town := nullif(btrim(split_part(coalesce(r.location, ''), ',', 1)), '');
      -- When they left: the day after their last open, their time.
      since := greatest(((r.last_day + 1)::timestamp at time zone r.tz), p_now - interval '5 days');

      -- a. Friends who follow each other with them, up for a hit today, near them.
      --    The map's rule for "Friends up for a hit": two known adults, or their spot is shown to them.
      if here_lat is not null then
        select count(*), (array_agg(x.nm order by x.until desc))[1:2], (array_agg(x.id order by x.until desc))[1]
          into v_n, v_names, v_first
          from (
            select p.id, split_part(coalesce(nullif(btrim(p.name), ''), p.handle), ' ', 1) as nm, p.open_to_hit_until as until
              from public.follows f
              join public.profiles p on p.id = f.following_id
              join public.last_seen s on s.user_id = p.id
             where f.follower_id = r.user_id
               and p.open_to_hit_until > p_now and p.suspended_at is null
               and public.follow_each_other(r.user_id, p.id)
               and not (p.id::text = any (r.quiet))
               and not public.is_blocked_between(r.user_id, p.id)
               and ((public.known_adult(r.user_id) and public.known_adult(p.id)) or public.spot_shown_to(r.user_id, p.id))
               and public.km_between(here_lat, here_lng, s.lat, s.lng) <= 50
          ) x;
        if v_n = 1 then
          w := v_names[1] || ' is up for a hit today';
          l := '/user/' || v_first;
        elsif v_n = 2 then
          w := v_names[1] || ' and ' || v_names[2] || ' are up for a hit today';
          l := '/map';
        elsif v_n > 2 then
          w := v_names[1] || ' and ' || (v_n - 1) || ' other friends are up for a hit today';
          l := '/map';
        end if;
      end if;

      -- b. Open hits near their town in the next 7 days, by known adults, to known adults only.
      if w is null and here_lat is not null and public.known_adult(r.user_id) then
        select count(distinct h.author_id), coalesce(bool_and(extract(isodow from (h.starts_at at time zone r.tz)) in (6, 7)
                                                            and (h.starts_at at time zone r.tz)::date - r.today <= 7 - extract(isodow from r.today)::int), false)
          into v_n, v_weekend
          from public.hit_requests h
          join public.profiles a on a.id = h.author_id and a.suspended_at is null
          cross join lateral public.hit_point(h.place) hp
         where not h.cancelled and h.starts_at > p_now and h.starts_at < p_now + interval '7 days'
           and coalesce(h.audience, 'everyone') = 'everyone'
           and h.author_id <> r.user_id
           and public.known_adult(h.author_id)
           and not (h.author_id::text = any (r.quiet))
           and not public.is_blocked_between(r.user_id, h.author_id)
           and public.hit_is_open(h.id)
           and hp.p_lat is not null and hp.p_lng is not null
           and public.km_between(here_lat, here_lng, hp.p_lat, hp.p_lng) <= 25;
        if v_n > 0 then
          w := case when v_n = 1 then 'A player near ' || coalesce(town, 'you') || ' is up for a hit'
                    else v_n || ' players near ' || coalesce(town, 'you') || ' are up for a hit' end
               || case when v_weekend then ' this weekend' else ' this week' end;
          l := '/map';
        end if;
      end if;

      -- c. A clip or session posted since they left by friends who follow each other with them.
      if w is null then
        select count(distinct x.author_id), (array_agg(x.nm order by x.created_at desc))[1:2], (array_agg(x.id order by x.created_at desc))[1],
               coalesce(bool_and(x.is_clip), false), coalesce(bool_and(not x.is_clip), false)
          into v_n, v_names, v_post, v_clips, v_sessions
          from (
            select distinct on (p.author_id) p.id, p.author_id, p.created_at,
                   split_part(coalesce(nullif(btrim(a.name), ''), a.handle), ' ', 1) as nm,
                   (p.kind = 'clip' or p.video_url is not null) as is_clip
              from public.follows f
              join public.posts p on p.author_id = f.following_id
              join public.profiles a on a.id = p.author_id and a.suspended_at is null
             where f.follower_id = r.user_id
               and p.created_at > since and p.created_at <= p_now
               and p.removed_at is null and not coalesce(p.archived, false) and p.group_id is null
               and not coalesce(p.auto_held, false)
               and (p.kind = 'clip' or p.video_url is not null or jsonb_typeof(p.session) = 'object')
               and (not coalesce(p.auto_logged, false) or public.auto_log_audience_of(p.author_id, null) in ('mutuals', 'public'))
               and not exists (select 1 from public.post_demotions d where d.post_id = p.id)
               and public.follow_each_other(r.user_id, p.author_id)
               and not (p.author_id::text = any (r.quiet))
               and not public.is_blocked_between(r.user_id, p.author_id)
             order by p.author_id, p.created_at desc
          ) x;
        if v_n = 1 then
          w := v_names[1] || ' posted a new ' || case when v_clips then 'clip' else 'session' end;
        elsif v_n = 2 then
          w := v_names[1] || ' and ' || v_names[2] || ' posted new ' || case when v_clips then 'clips' when v_sessions then 'sessions' else 'clips and sessions' end;
        elsif v_n > 2 then
          w := v_names[1] || ' and ' || (v_n - 1) || ' other friends posted new ' || case when v_clips then 'clips' when v_sessions then 'sessions' else 'clips and sessions' end;
        end if;
        if w is not null then l := '/post/' || v_post; end if;
      end if;

      -- d. Their city moved up the city board this week (196).
      if w is null then
        select bc.name || ' moved up to #' || c.rank || ' on the city board', '/city/' || c.city_id
          into w, l
          from public.city_board_members m
          join public.city_board_cities c on c.month = m.month and c.city_id = m.city_id
          join public.board_cities bc on bc.id = c.city_id
         where m.user_id = r.user_id
           and m.month = (select max(cm.month) from public.city_board_cities cm where cm.month <= r.today)
           and c.rank is not null and c.week_ago_rank is not null and c.rank < c.week_ago_rank
         limit 1;
      end if;

      -- Nothing real to say: nothing sent (the next hour looks again).
      continue when w is null;
      if not p_dry_run then
        continue when not private.send_nudge(r.user_id, 'catch-up', to_char(r.today, 'YYYY-MM-DD'), w, l, p_now);
      end if;
      planned := planned || r.user_id;
      who := r.user_id; nudge := 'catch-up'; words := w; link := l;
      return next;
    exception when others then
      raise warning 'catch-up alert for %: %', r.user_id, sqlerrm;
    end;
  end loop;
  return;
end $$;
revoke all on function public.send_catch_up_alerts(timestamptz, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------- 7. the jobs
-- Scheduling the same job name again replaces it. Where pg_cron is not
-- turned on this says so and carries on (nothing sent).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('courtside-like-bundles', '*/10 * * * *', 'select private.send_like_bundles()');
    perform cron.schedule('courtside-catch-up-alerts', '55 * * * *', 'select count(*) from public.send_catch_up_alerts()');
  else
    raise notice 'pg_cron not turned on: no like bundles or catch-up alerts until it is';
  end if;
exception when others then
  raise notice 'pg_cron not set up (%): no like bundles or catch-up alerts until it is', sqlerrm;
end $$;

-- ------------------------------------------------------------- 8. last check
do $$
declare
  r record;
  want jsonb := '{
    "push_for_notification": "38654034e46b1ddabc0af87e81d2096e",
    "send_activity_pushes": "439790d34a77a14d5dcc4fee80947add",
    "tell_adults_new_player": "7e44fe562f1092d35c40219e4484612e"
  }';
begin
  for r in select k.key as fn, k.value #>> '{}' as ok,
                  (select max(md5(p.prosrc)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = k.key) as now_is
             from jsonb_each(want) k loop
    if r.now_is is distinct from r.ok then
      raise exception 'Migration 20261029000201 stopped: % is not as this file writes it (%). Nothing was changed.', r.fn, r.now_is;
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'push_catch_up')
     or not (select relrowsecurity from pg_class where oid = 'private.push_sends'::regclass)
     or has_table_privilege('anon', 'private.push_sends', 'select') or has_table_privilege('authenticated', 'private.push_sends', 'select')
     or has_function_privilege('authenticated', 'public.send_catch_up_alerts(timestamp with time zone, boolean)', 'execute')
     or has_function_privilege('anon', 'public.send_catch_up_alerts(timestamp with time zone, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.send_activity_pushes(uuid, uuid[])', 'execute')
     or has_function_privilege('authenticated', 'private.send_like_bundles(timestamp with time zone, boolean)', 'execute')
     or has_function_privilege('authenticated', 'private.take_activity_push(uuid)', 'execute')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'push_for_notification')
     or not exists (select 1 from pg_constraint where conrelid = 'public.detected_activities'::regclass and conname = 'detected_activities_pushed_as_check' and pg_get_constraintdef(oid) like '%capped%')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.last_seen'::regclass and tgname = 'tell_adults_new_player') then
    raise exception 'Migration 20261029000201 stopped: the result was not as planned. Nothing was changed.';
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and (not exists (select 1 from cron.job where jobname = 'courtside-like-bundles' and schedule = '*/10 * * * *')
          or not exists (select 1 from cron.job where jobname = 'courtside-catch-up-alerts' and schedule = '55 * * * *')) then
    raise exception 'Migration 20261029000201 stopped: the two jobs were not scheduled. Nothing was changed.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ------------------------------------------------------------- DRY RUN
-- Who would get a catch-up alert RIGHT NOW, in the exact words. Sends nothing:
-- select n.who, p.handle, n.words, n.link from public.send_catch_up_alerts(now(), true) n join public.profiles p on p.id = n.who;

-- ------------------------------------------------- 9. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
-- (a) The two jobs (expect courtside-like-bundles */10 and courtside-catch-up-alerts 55):
-- select jobname, schedule from cron.job where jobname in ('courtside-like-bundles', 'courtside-catch-up-alerts');
-- (b) Workout alerts held back by the 3-a-day rule, last 14 days:
-- select count(*) from public.detected_activities where pushed_as = 'capped' and pushed_at > now() - interval '14 days';
-- (c) The last 50 catch-up alerts:
-- select n.sent_at, p.handle, n.words from public.nudges n join public.profiles p on p.id = n.user_id where n.kind = 'catch-up' order by n.sent_at desc limit 50;
