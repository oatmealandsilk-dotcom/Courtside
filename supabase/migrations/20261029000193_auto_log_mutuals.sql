-- CourtSide · migration 20261029000193: sessions that log themselves show to
-- friends who follow you back; Fitbit's "Sport" learns from two yeses.
--
-- NOT APPLIED. Run it in the Supabase SQL editor as one piece, after 185 and
-- 194-198 (all live). Ship order: first the app update that reads it, as an
-- over-the-air update on the "production" channel (never "store"); this runs
-- only once that update is out. Build 22 (channel "store", frozen, only
-- Apple's reviewer still on it) never gets the update: there, a player's own
-- session that logged itself reads as already posted. That is accepted.
-- All-or-nothing: if a check fails, it stops and nothing at all changes.
-- Safe to run more than once. Undo: supabase/rollback/193_undo.sql.
-- Named 20261029... so it sorts after the live 195-198 (it was first written
-- as 20261027000193, before them); it is still called migration 193.
--
-- The owner, Oct 27, about sessions that log themselves from an Apple Watch,
-- WHOOP or Fitbit: "how about we make it so mutuals can see, no private, its
-- just mutual or public", "heart rate showing is fine", then "mutuals default
-- auto log fitbit."; Oct 28, about his own WHOOP session that logged itself
-- privately: "It should show up on the activity feed".
--
-- What changes:
--   1. Who sees a session that logged itself (Settings → "Sessions that log
--      themselves", user_state.auto_log_audience): 'mutuals' (friends who
--      follow each other with you), 'public' (whoever can see your posts) or
--      'private' (only you). Under 18 (and anyone whose age is not known to
--      be adult): friends who follow each other at most, never public,
--      whatever is stored. Until the player has chosen (null), nobody but
--      them (review, Oct 28: players who connected under 185 were told "Only
--      you see them until you post one", and builds 21/22 still say so). The
--      app asks once, on "Tennis logged" (Friends or Only me, side by side);
--      connecting WHOOP or another tracker from a screen that says friends
--      will see them saves Friends; connecting Apple Health or Health Connect
--      never chooses for them (Apple's 5.1.3: a clear yes, with a no beside it).
--   2. Each session the server logs for a player (185's auto log) gets a
--      post made by the server (posts.auto_logged): the session's card with
--      its time, kind and length, and for an adult the heart rate, zones,
--      calories (and WHOOP's Strain); for anyone not known to be an adult,
--      no numbers (as a post's "Share health data" starts off for them). No
--      words and no picture. It shows in Activities and on the profile to
--      that audience only, and they can like and comment on it.
--      The database decides (a restrictive read rule on posts, and the
--      functions that hand posts out without it): anyone else never gets
--      the row. It never goes to For you, a group's feed, a court, a guest's
--      feed, a link preview or a tag's list (session_minor_posts) for anyone
--      outside its audience, and it is never a "first post" or an invite's
--      first step.
--   3. The player can still add the score, a photo, tags and a court and
--      post it from "Tennis logged", as before: their own post then stands
--      for the session and the server's steps aside (kept, hidden, with its
--      likes and comments; back if they delete their post). Removing the
--      session ("Not tennis? Remove", Your sessions, the tracker taking it
--      back) takes the server's post with it, and so does disconnecting a
--      tracker and removing what it sent. Only me hides every one of them at
--      once from everyone but the player (who still sees their own in
--      Activities and on their profile); switching back shows them again.
--   4. Apple Health (Guideline 5.1.3): a session from Apple Health or Health
--      Connect, or one logged on Apple Health's word (a WHOOP or Fitbit copy
--      that could not log itself, under 20 minutes or only "Sport", logged
--      because the Apple Watch's twin of it said Tennis), is marked held
--      (posts.auto_held) and, like every one, shown to nobody else until the
--      player has chosen in step 1.
--   5. The alert says who can see it: "Tennis logged" / "Friends who follow
--      you back can see it · tap to add the score or post it." ("On your
--      profile" for public, "Saved privately" for only me and not chosen yet;
--      for several at once, the widest of them). Still no length or numbers
--      on the lock screen.
--   6. Fitbit files tennis as "Sport" ("Was this tennis?", 185's unsure
--      flag). Once a player answers yes, tennis, twice (logs one as
--      practice, a match or drills), their Fitbit Sport sessions of 20
--      minutes or more log themselves like any tennis. A no (hiding one,
--      logging it as fitness, or removing one that logged itself) puts the
--      count back to 0 and stops it (user_state.unsure_yes); taking back a
--      yes (removing a session they logged from one) takes that yes back,
--      so logging the same one again never counts twice (review). Their own
--      log_unsure_tennis() logs every "Was this tennis?" session waiting, in
--      one tap ("Yes, these were tennis"), and counts as that many yeses;
--      one already logged by hand is filed as that, never logged twice (review).
--   7. Existing sessions the server logged before this (185, none posted)
--      each get their post now, at the time they were played, held for the
--      player's choice (step 1). The owner's own account (@mrdinosaur62) is
--      chosen here as Friends, his words above: his WHOOP session of Oct 28
--      shows to his friends who follow him back at once, and so do his
--      sessions from now on (Apple Health's too, if he connects it). He can
--      change it in Settings.
--   8. Only the people who see one can like it (a read rule on likes), and
--      the feed's view counts (feed_post_scores) never name one to anyone
--      else (review). Admins' "posted" for new players leaves them out.
--   9. City boards (196/197, review): a session that logged itself and is
--      seen by nobody but its player (Only me, or not chosen yet) never
--      sets "Usually evenings" or "Played Saturday" under their face, and
--      no Apple Health or Health Connect start time does for a player who
--      has not let anyone see their sessions. It still adds to the monthly
--      counts, as the privacy policy says.
--
-- Left as they are: posts and sessions the players made themselves, 185's
-- auto log rules (20 minutes, Settings → Log tennis automatically), alerts'
-- timing, the map.

begin;

-- ------------------------------------------------------------------ 0. check
-- The functions this file changes, as read from the live database on Oct 27
-- (session_minor_posts and refresh_city_board on Oct 28)
-- (or as this file leaves them, so a second run passes).
do $$
declare
  r record;
  want jsonb := '{
    "auto_log_activity": ["1798d5cf3efbfa7ae723372209347ff4", "f5061800a77fbb088e12ba2b2402540e"],
    "send_activity_pushes": ["42d79ffd3e542dd6c7bf0d59a26e67b5", "c07030432cc8698f53f9e8ab0646bae8"],
    "session_unposted": ["67a5c254f1a37d6c700f64fb88fa05d6", "b2f215cfec2c5bedcb2a708ce2fcd551"],
    "mark_first_post": ["8de9ff13561a56b6d1668ce5369101cb", "f91afaf25816b2cb5b0904cb15312be6"],
    "share_preview": ["766840b69cde1c289d5f906ad2d9dc6b", "de1106c76c98906fe7804b53613f13c4"],
    "group_feed": ["3771d68a8983b7ccba53ed488dd3ff72", "48073ce6bcc04130f1f436f6f7fc5a14"],
    "invite_first_action": ["921304feccd26712d5098653ecce73b6", "53aeb183876852b75fedfe61c517926f"],
    "invite_second_day": ["f1c199bd787c4e2f55115e25d8b8156d", "dc03a465e834a74712b455327345d1fb"],
    "invite_back_at": ["8e321ac7fda0998f6a61d9b25a5522dc", "11a4ea4eefe9f84cd9c86b7fec05a76b"],
    "first_day_stats": ["abbab0e1c72f2d6447867428944ed0a9", "0c3035690a2912d05759871ed9b4fe5e"],
    "feed_post_scores": ["410042789f673344c269fe682f0eae0e", "5c47960c124d4f6941dc222921391108"],
    "admin_new_players": ["326953796d896a3fd58bab643025fa02", "f56c6f4274e83bbcdba74c7d2befeb1a"],
    "session_minor_posts": ["ae903d0b92aa69a1bd364994633c71f8", "af3c97d6d8436618e9197b830ad4cdb7"],
    "refresh_city_board": ["259f5a95e81c26cf195f32a4b2425a48", "653b4f13594b34cff16425c59b3edc63"]
  }';
begin
  if to_regclass('public.posts') is null or to_regclass('public.practice_sessions') is null or to_regclass('public.detected_activities') is null
     or to_regclass('public.user_state') is null or to_regclass('public.follows') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'practice_sessions' and column_name = 'auto_logged')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'detected_activities' and column_name = 'unsure')
     or to_regprocedure('public.follow_each_other(uuid, uuid)') is null or to_regprocedure('public.known_adult(uuid)') is null
     or to_regprocedure('public.tennis_allowed(uuid, text)') is null or to_regprocedure('public.activity_day(uuid, timestamp with time zone, integer)') is null
     or to_regprocedure('public.post_session_stats()') is null or to_regprocedure('public.put_session_with(jsonb, uuid)') is null then
    raise exception 'Migration 20261029000193 stopped before changing anything: migration 185 (the auto log) and the session posts (65, 72) have to run first.';
  end if;
  for r in select k.key as fn, (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = k.key) as n,
                  (select max(md5(p.prosrc)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = k.key) as now_is,
                  k.value as ok
             from jsonb_each(want) k loop
    if r.n <> 1 or not coalesce(r.ok @> to_jsonb(r.now_is), false) then
      raise exception 'Migration 20261029000193 stopped before changing anything: % changed since it was read on Oct 27. This file must be brought up to date with that change first.', r.fn;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------- 1. new columns
-- A post the server made for a session that logged itself (step 2). Never set by a phone.
alter table public.posts add column if not exists auto_logged boolean not null default false;
-- One of those held back until its player has chosen who sees them (step 4 and 7, review): logged
-- on Apple Health's word, or saved privately before this file. Never set by a phone.
alter table public.posts add column if not exists auto_held boolean not null default false;
-- Settings → Sessions that log themselves: 'mutuals', 'public' or 'private'. Null until the player
-- chooses: until then nobody but them sees any (review, Oct 28).
alter table public.user_state add column if not exists auto_log_audience text;
-- Fitbit's "Was this tennis?": yeses since the last no. Two or more, and Fitbit's Sport logs itself.
alter table public.user_state add column if not exists unsure_yes integer not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.user_state'::regclass and conname = 'user_state_auto_log_audience_ok') then
    alter table public.user_state add constraint user_state_auto_log_audience_ok
      check (auto_log_audience is null or auto_log_audience in ('mutuals', 'public', 'private'));
  end if;
end $$;
create index if not exists posts_auto_logged_idx on public.posts (author_id) where auto_logged;

-- ------------------------------------------------------------- 2. who sees one
-- Who sees a player's sessions that log themselves: their choice. Never
-- 'public' for anyone not known to be an adult. Not chosen yet: nobody but
-- them, from any tracker (review, Oct 28: 185 promised "Only you see them
-- until you post one"). `src` (the tracker, as a post or a tracker row names
-- it) no longer changes the answer; it is kept so callers stay as they are.
create or replace function public.auto_log_audience_of(u uuid, src text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when x.aud is null then 'private'
    when x.aud = 'public' and not public.known_adult(u) then 'mutuals'
    else x.aud
  end
  from (select (select us.auto_log_audience from public.user_state us where us.user_id = u) as aud) x
$$;

-- The source the alert judges tracker row a_id by: Apple Health's ("only once
-- the player has chosen") when the server's post of it is held back (auto_held,
-- review), else its tracker's `src`.
create or replace function public.auto_log_src_of(u uuid, a_id uuid, src text) returns text
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.posts p where p.author_id = u and p.auto_logged and p.auto_held
                             and jsonb_typeof(p.session) = 'object' and lower(p.session->>'activityId') = a_id::text)
              then 'apple-health' else src end
$$;

-- The alert's words for it: "Friends who follow you back can see it".
create or replace function public.auto_log_seen_by(u uuid, src text, many boolean) returns text
language sql stable security definer set search_path = public as $$
  select case public.auto_log_audience_of(u, src)
    when 'private' then case when many then 'Only you can see them' else 'Saved privately' end
    when 'public' then 'On your profile'
    else case when many then 'Friends who follow you back can see them' else 'Friends who follow you back can see it' end
  end
$$;

-- The read rule's question (step 3): may whoever is asking see post p_id?
-- True for any post the server did not make (the other rules decide those).
-- One it made: its player (always, Only me and held back included), and
-- their audience, while the player has not posted the session themselves.
-- Signed out: never. One held back (auto_held) goes by Apple Health's rule:
-- nobody else until they chose.
create or replace function public.auto_post_shown(p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_author uuid;
  v_session jsonb;
  v_auto boolean;
  v_held boolean;
  v_aud text;
begin
  select p.author_id, p.session, p.auto_logged, p.auto_held into v_author, v_session, v_auto, v_held from public.posts p where p.id = p_id;
  if not found then return false; end if;
  if not v_auto then return true; end if;
  if v_me is null or jsonb_typeof(v_session) is distinct from 'object' then return false; end if;
  -- Posted by the player since: that post stands for the session, this one steps aside.
  if exists (
       select 1 from public.posts q
        where q.author_id = v_author and not q.auto_logged and jsonb_typeof(q.session) = 'object'
          and ((v_session ? 'sessionId' and lower(q.session->>'sessionId') = lower(v_session->>'sessionId'))
            or (v_session ? 'activityId' and lower(q.session->>'activityId') = lower(v_session->>'activityId')))) then
    return false;
  end if;
  -- Its player always (Oct 28: a player sees their own sessions in Activities and on their profile,
  -- on Only me and while held back too; "Only me" means nobody else).
  if v_me = v_author then return true; end if;
  v_aud := public.auto_log_audience_of(v_author, case when v_held then 'apple-health' else v_session->>'source' end);
  if v_aud = 'private' then return false; end if;
  if v_aud = 'public' then return true; end if;
  return public.follow_each_other(v_me, v_author);
end $$;

-- ------------------------------------------------------------- 3. the server's posts
-- Before every insert and update of a post: only the server makes one of
-- these (auto_post_for_session sets courtside.auto_post), a phone's post is
-- always an ordinary one, and nobody turns one into the other. One of these
-- is never featured, never in a group, never at a court and tags nobody:
-- posting the session (from "Tennis logged") is the way to do those.
create or replace function public.guard_auto_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('courtside.auto_post', true), '') <> 'on' then new.auto_logged := false; end if;
    -- Held back only on one of the server's (review).
    new.auto_held := coalesce(new.auto_logged, false) and coalesce(new.auto_held, false);
  else
    new.auto_logged := old.auto_logged;
    new.auto_held := old.auto_held;
  end if;
  if new.auto_logged then
    new.feature_ok := false;
    if new.group_id is not null then raise exception 'Post this session to share it with a group.'; end if;
    if new.court_id is not null or new.court_name is not null or new.court_lat is not null or new.court_lng is not null then
      raise exception 'Post this session to add the court.';
    end if;
    if coalesce(cardinality(new.tagged_user_ids), 0) > 0 then raise exception 'Post this session to tag people.'; end if;
  end if;
  return new;
end $$;

-- The post for session s_id, if it logged itself and has none (and the
-- player has not posted it). Its card is filled in exactly as for any post
-- of a tracker's session (post_session_stats, put_session_with): kind,
-- length, day, and the heart rate, zones, calories and WHOOP's Strain the
-- tracker recorded. Dated when it was played. Never raises: anything in the
-- way leaves the session as it is, without a post. The new post's id, or null.
-- Held back until the player chooses who sees them (auto_held, review): `held`
-- (a session saved privately before this file), any made while the player has
-- not chosen yet (review, Oct 28), one from Apple Health or Health Connect,
-- and one logged on Apple Health's word: a copy that could not log itself
-- (under 20 minutes, or only "Sport" not yet learned) logged because its Apple
-- Watch twin said Tennis (185's twin rule). The numbers on it (`share`): heart
-- rate, zones, Strain and calories for an adult; none for anyone not known to
-- be an adult (review, Oct 28: as a post's "Share health data" starts off for them).
create or replace function public.auto_post_for_session(s_id uuid, held boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_s public.practice_sessions;
  v_a public.detected_activities;
  v_id uuid;
  v_held boolean;
begin
  select * into v_s from public.practice_sessions where id = s_id;
  if not found or not v_s.auto_logged or v_s.activity_id is null then return null; end if;
  select * into v_a from public.detected_activities where id = v_s.activity_id and user_id = v_s.user_id;
  if not found then return null; end if;
  if exists (select 1 from public.posts p where p.author_id = v_s.user_id and jsonb_typeof(p.session) = 'object'
               and (lower(p.session->>'activityId') = v_a.id::text or lower(p.session->>'sessionId') = v_s.id::text)) then
    return null;
  end if;
  v_held := coalesce(held, false) or v_a.source in ('apple-health', 'health-connect')
    or not exists (select 1 from public.user_state us where us.user_id = v_s.user_id and us.auto_log_audience is not null)
    or ((v_a.unsure and not public.unsure_learned(v_a.user_id, v_a.source)) or v_a.minutes < 20)
       and exists (select 1 from public.detected_activities d
                    where d.user_id = v_a.user_id and d.duplicate_of = v_a.id and d.source in ('apple-health', 'health-connect'));
  begin
    perform set_config('courtside.auto_post', 'on', true);
    insert into public.posts (author_id, kind, body, session, auto_logged, auto_held)
      values (v_s.user_id, 'note', '', jsonb_build_object('activityId', v_a.id, 'drills', '[]'::jsonb,
                     'share', case when public.known_adult(v_s.user_id) then '["hr", "zones", "strain", "kcal"]'::jsonb else '[]'::jsonb end), true, v_held)
      returning id into v_id;
    perform set_config('courtside.auto_post', '', true);
    -- When it was played, not when the tracker sent it (a week caught up arrives at once).
    perform set_config('courtside.counter_ok', 'on', true);
    update public.posts set created_at = least(v_a.ended_at, now()) where id = v_id;
    perform set_config('courtside.counter_ok', '', true);
  exception when others then
    perform set_config('courtside.auto_post', '', true);
    perform set_config('courtside.counter_ok', '', true);
    raise warning 'auto post for session %: %', s_id, sqlerrm;
    return null;
  end;
  return v_id;
end $$;

-- After a session is saved or removed: one that logged itself gets its post;
-- removing it ("Not tennis? Remove", Your sessions, the tracker taking it
-- back, the player's own log taking its place) takes the post with it.
-- Any session removed takes the server's post of it (review: never one left
-- behind for a session that is gone, whatever its flag says by then).
-- Named to run before session_posts_follow_log, so that one never touches it.
create or replace function public.auto_post_follows_session() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.auto_logged and new.activity_id is not null then perform public.auto_post_for_session(new.id); end if;
  else
    delete from public.posts p
     where p.author_id = old.user_id and p.auto_logged and jsonb_typeof(p.session) = 'object'
       and (lower(p.session->>'sessionId') = old.id::text or (old.activity_id is not null and lower(p.session->>'activityId') = old.activity_id::text));
  end if;
  return null;
end $$;

-- After a post's session changes: one of the server's left with no session
-- (disconnecting a tracker and removing what it sent clears its sessions'
-- numbers off posts: forget_tracker_data, forget_whoop_data) goes, rather
-- than staying as an empty post.
create or replace function public.drop_emptied_auto_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.auto_logged and (new.session is null or jsonb_typeof(new.session) <> 'object') then
    delete from public.posts where id = new.id;
  end if;
  return null;
end $$;

-- ------------------------------------------------------------- 4. Fitbit's "Sport"
-- Two yeses since the last no, from Fitbit: its Sport sessions are tennis for this player.
create or replace function public.unsure_learned(u uuid, src text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(src = 'fitbit', false) and coalesce((select us.unsure_yes from public.user_state us where us.user_id = u), 0) >= 2
$$;

-- After a Fitbit "Was this tennis?" row changes: logged by the player as
-- practice, a match or drills is a yes (one); hidden, logged as fitness, or
-- a session that logged itself taken away ("Not tennis?") is a no (back to 0).
-- Sessions logged by "Yes, these were tennis" are counted there.
create or replace function public.count_unsure_answers() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
  v_auto boolean;
begin
  if not new.unsure or new.source <> 'fitbit' or new.status is not distinct from old.status then return null; end if;
  if new.status = 'logged' and new.session_id is not null then
    select s.kind, s.auto_logged into v_kind, v_auto from public.practice_sessions s where s.id = new.session_id;
    if v_kind in ('practice', 'match', 'drills') and not coalesce(v_auto, true) then
      insert into public.user_state (user_id, unsure_yes) values (new.user_id, 1)
        on conflict (user_id) do update set unsure_yes = least(public.user_state.unsure_yes + 1, 1000);
    elsif v_kind = 'fitness' then
      update public.user_state set unsure_yes = 0 where user_id = new.user_id and unsure_yes <> 0;
    end if;
  elsif new.status = 'dismissed' then
    update public.user_state set unsure_yes = 0 where user_id = new.user_id and unsure_yes <> 0;
  end if;
  return null;
end $$;

-- A yes taken back (review): the player removes a session they logged from a
-- Fitbit "Was this tennis?" as practice, a match or drills. Its yes goes, so
-- logging the same one again counts once, never twice. (One that logged
-- itself, taken away, is a no: count_unsure_answers. The player's own log
-- taking the place of one that logged itself is not a removal.)
create or replace function public.unsure_yes_taken_back() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not old.auto_logged and old.activity_id is not null and old.kind in ('practice', 'match', 'drills')
     and coalesce(current_setting('courtside.replacing_auto', true), '') <> '1'
     and exists (select 1 from public.detected_activities d
                  where d.id = old.activity_id and d.user_id = old.user_id and d.source = 'fitbit' and d.unsure) then
    update public.user_state set unsure_yes = greatest(unsure_yes - 1, 0) where user_id = old.user_id and unsure_yes > 0;
  end if;
  return null;
end $$;

-- "Yes, these were tennis": every "Was this tennis?" session of yours still
-- waiting is logged as practice, as if it had logged itself (so it shows to
-- your audience like one, unless Log tennis automatically is off), and
-- counts as a yes each. One already logged by hand is filed as that instead
-- (review). {"logged": n, "already": n, "learned": true once Fitbit's Sport logs itself}.
create or replace function public.log_unsure_tennis() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_auto boolean;
  r record;
  v_n int := 0;
  v_had int := 0;
  v_fit int := 0;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  perform pg_advisory_xact_lock(hashtextextended('activity:' || v_me::text, 0));
  v_auto := coalesce((select us.auto_log from public.user_state us where us.user_id = v_me), true);
  for r in select d.id, d.source, d.started_at, d.ended_at, d.tz_offset_min, d.minutes from public.detected_activities d
            where d.user_id = v_me and d.status = 'new' and d.unsure and d.sport = 'tennis' and d.session_id is null
            order by d.started_at limit 60 loop
    if not public.tennis_allowed(v_me, r.source) then continue; end if;
    -- Already logged by hand (review), as 185 reads it: a tennis session of
    -- theirs saved between its start and 12 hours after its end. Filed as
    -- that (note_detected_activity's 'logged-by-hand'), never logged twice.
    if exists (select 1 from public.practice_sessions s where s.user_id = v_me and s.activity_id is null
                 and s.kind in ('practice', 'match', 'drills')
                 and s.created_at between r.started_at and r.ended_at + interval '12 hours') then
      update public.detected_activities set status = 'duplicate', updated_at = now() where id = r.id and status = 'new';
      delete from public.notifications where user_id = v_me and kind = 'activity' and target_id = r.id::text;
      v_had := v_had + 1;
      -- Still a yes, tennis (count_unsure_answers counts only rows logged).
      if r.source = 'fitbit' then v_fit := v_fit + 1; end if;
      continue;
    end if;
    begin
      insert into public.practice_sessions (user_id, day, minutes, kind, activity_id, auto_logged)
        values (v_me, public.activity_day(v_me, r.started_at, r.tz_offset_min), r.minutes, 'practice', r.id, v_auto);
      v_n := v_n + 1;
      -- Logged as one that logged itself: count_unsure_answers leaves it to here.
      if r.source = 'fitbit' and v_auto then v_fit := v_fit + 1; end if;
    exception when others then
      null;
    end;
  end loop;
  if v_fit > 0 then
    insert into public.user_state (user_id, unsure_yes) values (v_me, v_fit)
      on conflict (user_id) do update set unsure_yes = least(public.user_state.unsure_yes + v_fit, 1000);
  end if;
  return jsonb_build_object('logged', v_n, 'already', v_had, 'learned', public.unsure_learned(v_me, 'fitbit'));
end $$;

-- Settings → Sessions that log themselves. Saves the choice (it is also the
-- yes Apple Health's sessions wait for) and answers with what was kept:
-- 'public' is kept as 'mutuals' for anyone not known to be an adult.
create or replace function public.set_auto_log_sharing(v text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_keep text;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if v is null or v not in ('mutuals', 'public', 'private') then raise exception 'Choose who can see them.'; end if;
  v_keep := case when v = 'public' and not public.known_adult(v_me) then 'mutuals' else v end;
  insert into public.user_state (user_id, auto_log_audience) values (v_me, v_keep)
    on conflict (user_id) do update set auto_log_audience = excluded.auto_log_audience;
  return v_keep;
end $$;

-- ------------------------------------------------------------- 5. changed, word for word but for the lines marked 193
-- 185's auto log: Fitbit's Sport logs itself for a player who said yes twice.
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
  -- Or (193) a Fitbit "Sport" session from someone who said yes, tennis, to two of them since
  -- their last no (unsure_learned).
  if v_a.status <> 'new' or v_a.session_id is not null or v_a.notified_at is null
     or v_a.sport <> 'tennis' or v_by.sport <> 'tennis' or (v_by.unsure and not public.unsure_learned(v_by.user_id, v_by.source)) or v_by.minutes < 20
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

-- 185's alerts: "Tennis logged" says who can see it.
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
end $function$;

-- 185's "not posted yet": the server's own post of it does not count as posted.
CREATE OR REPLACE FUNCTION public.session_unposted(s_id uuid, u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not exists (select 1 from public.posts p where p.author_id = u and p.session->>'sessionId' = s_id::text and not p.auto_logged)
$function$;

-- A session that logged itself is never a first post (the "New here" tag and nudge).
CREATE OR REPLACE FUNCTION public.mark_first_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 193: a session that logged itself is never a first post, and never stops the player's own first one being it.
  new.is_first := not new.auto_logged and not exists (select 1 from public.posts p where p.author_id = new.author_id and not p.auto_logged);
  return new;
end $function$;

-- Link previews (the share worker): a session that logged itself only to its audience,
-- and never in a profile's counts or pictures for strangers.
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
    -- A session that logged itself (193): only to the people its player lets see it.
    if p.auto_logged and not public.auto_post_shown(p.id) then return locked; end if;
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
        'posts', (select count(*) from public.posts x where x.author_id = pr.id and not x.archived and x.removed_at is null and not public.share_in_group(x) and not x.auto_logged),
        'skillSystem', case when pr.profile->>'skillSystem' in ('NTRP', 'UTR', 'ITF') then pr.profile->>'skillSystem' end,
        'rating', case when jsonb_typeof(pr.profile->'rating') = 'number' then pr.profile->'rating' end,
        'openHits', (select count(*) from public.hit_requests y where y.author_id = pr.id and not y.cancelled and y.starts_at > now() and public.hit_is_open(y.id)),
        'recent', coalesce((select jsonb_agg(public.share_tile(x) order by x.created_at desc) from (
          select * from public.posts x where x.author_id = pr.id and not x.archived and x.removed_at is null
            and (x.image_url is not null or x.thumbnail_url is not null) and not public.share_in_group(x) and not x.auto_logged
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

-- Group feeds: never a session that logged itself.
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
      -- 193: never a session that logged itself (Activities and profiles show those, to their audience).
      and not p.auto_logged
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

-- Invites ($1 each, 80/102/116): a post the server made is not the invitee doing anything.
CREATE OR REPLACE FUNCTION public.invite_first_action(u uuid, inviter uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select min(t) from (
              select created_at as t from public.follows           where follower_id = u and following_id is distinct from inviter
    union all select created_at        from public.posts             where author_id = u and not auto_logged
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
    union all select created_at        from public.posts          where author_id = u and not auto_logged
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
    union all select created_at        from public.posts         where author_id = u and not auto_logged
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

-- Admins' first-day numbers: the same.
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
      (exists (select 1 from public.posts x where x.author_id = pe.id and not x.auto_logged and x.created_at < pe.created_at + interval '1 day')
        or exists (select 1 from public.questions q where q.author_id = pe.id and q.created_at < pe.created_at + interval '1 day')
        or exists (select 1 from public.answers a where a.author_id = pe.id and a.created_at < pe.created_at + interval '1 day')) as moved,
      (exists (select 1 from public.feed_signals f where f.user_id = pe.id
                 and (f.last_seen_at between pe.created_at + interval '7 days' and pe.created_at + interval '14 days'
                      or f.first_seen_at between pe.created_at + interval '7 days' and pe.created_at + interval '14 days'))
        or exists (select 1 from public.posts x where x.author_id = pe.id and not x.auto_logged and x.created_at between pe.created_at + interval '7 days' and pe.created_at + interval '14 days')
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

-- The feed's view counts (review): never a session that logged itself to anyone outside its audience
-- (its id alone said a session was there, and whose, through author_of_post).
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
    -- 193: a session that logged itself, only to the people who see it.
    and (not p.auto_logged or public.auto_post_shown(p.id))
  group by f.target_id
  -- Newest posts first: the API hands back at most 1000 rows, so once more
  -- posts than that have been looked at, the ones it leaves out are the
  -- oldest, never a random handful of new ones you have already seen.
  order by max(p.created_at) desc, f.target_id
$function$;

-- Admins' new players (168): "posted" is the player posting, not the server's post of a session that logged itself.
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
           -- 193: a post the server made for a session that logged itself is not them posting.
           exists (select 1 from public.posts x where x.author_id = p.id and x.removed_at is null and not x.auto_logged)
    from public.profiles p
    where p.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30))
      and p.suspended_at is null
      and p.id <> auth.uid()
      and not exists (select 1 from public.blocks b
                      where (b.blocker_id = auth.uid() and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
    order by p.created_at desc, p.id
    limit 200;
end $function$;

-- A tag's list of posts (session_minor_posts, review): a session that logged itself only to the people who see it
-- (it carries sessionId, and its id, through author_of_post, would say whose session it was).
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
    -- The logger's own posts of it. A session that logged itself (193): only to the people who see it.
    select p.id, p.author_id, p.created_at, pl.side as role
      from played pl
      join public.posts p on p.author_id = pl.logger and p.removed_at is null
       and jsonb_typeof(p.session) = 'object' and lower(p.session->>'sessionId') = pl.session_id::text
       and (not p.auto_logged or public.auto_post_shown(p.id))
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
       and (not p.auto_logged or public.auto_post_shown(p.id))
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
$function$
;

-- City boards (196/197, review): "Usually evenings" and "Played Saturday" never come from a session nobody else may see.
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
         -- 193: a session that logged itself counts here only once someone besides its player may see it
         -- (not Only me, not before they chose who sees them).
         and (not s.auto_logged or public.auto_log_audience_of(s.user_id, null) <> 'private')
    ), ten as (
      select r.user_id, r.day, extract(isodow from r.day) >= 6 as weekend,
             -- The hour it started: a tracker's own start in its own offset; else
             -- when it was logged, in the player's time zone, if logged that same day.
             coalesce(extract(hour from (a.started_at at time zone 'UTC') + make_interval(mins => a.tz_offset_min))::int,
                      case when z.name is not null and (r.created_at at time zone z.name)::date = r.day
                           then extract(hour from r.created_at at time zone z.name)::int end) as hour
        from recent r
        left join public.detected_activities a on a.id = r.activity_id and a.tz_offset_min is not null
              -- 193: Apple Health's (and Health Connect's) start time only for a player who lets others see their sessions.
              and (a.source not in ('apple-health', 'health-connect') or public.auto_log_audience_of(r.user_id, null) <> 'private')
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
end $function$
;

-- ------------------------------------------------------------- 6. triggers, the read rule, who may call what
-- Named to come first among posts' triggers (they run in name order), so the rest see it settled.
drop trigger if exists auto_post_guard on public.posts;
create trigger auto_post_guard before insert or update on public.posts
  for each row execute function public.guard_auto_post();
drop trigger if exists auto_post_emptied on public.posts;
create trigger auto_post_emptied after update of session on public.posts
  for each row execute function public.drop_emptied_auto_post();
-- Named to come before session_posts_follow_log (name order).
drop trigger if exists auto_post_follows_session on public.practice_sessions;
create trigger auto_post_follows_session after insert or delete on public.practice_sessions
  for each row execute function public.auto_post_follows_session();
drop trigger if exists count_unsure_answers on public.detected_activities;
create trigger count_unsure_answers after update of status on public.detected_activities
  for each row execute function public.count_unsure_answers();
drop trigger if exists unsure_yes_taken_back on public.practice_sessions;
create trigger unsure_yes_taken_back after delete on public.practice_sessions
  for each row execute function public.unsure_yes_taken_back();

-- On top of every other rule for reading posts (restrictive: it must pass as well).
drop policy if exists "sessions that log themselves: only their audience" on public.posts;
create policy "sessions that log themselves: only their audience" on public.posts as restrictive for select
  using (case when auto_logged then public.auto_post_shown(id) else true end);
-- Liking one (review): only the people who see it (likes' own rule asks only about blocks).
drop policy if exists "sessions that log themselves: liked by their audience" on public.post_likes;
create policy "sessions that log themselves: liked by their audience" on public.post_likes as restrictive for insert
  with check (public.auto_post_shown(post_id));

revoke all on function public.auto_log_audience_of(uuid, text) from public, anon, authenticated;
revoke all on function public.auto_log_seen_by(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.auto_log_src_of(uuid, uuid, text) from public, anon, authenticated;
-- The read rule calls it as whoever reads, signed out too.
revoke all on function public.auto_post_shown(uuid) from public;
grant execute on function public.auto_post_shown(uuid) to anon, authenticated;
revoke all on function public.guard_auto_post() from public, anon, authenticated;
revoke all on function public.drop_emptied_auto_post() from public, anon, authenticated;
revoke all on function public.auto_post_for_session(uuid, boolean) from public, anon, authenticated;
revoke all on function public.auto_post_follows_session() from public, anon, authenticated;
revoke all on function public.unsure_learned(uuid, text) from public, anon, authenticated;
revoke all on function public.count_unsure_answers() from public, anon, authenticated;
revoke all on function public.unsure_yes_taken_back() from public, anon, authenticated;
revoke all on function public.log_unsure_tennis() from public, anon;
grant execute on function public.log_unsure_tennis() to authenticated;
revoke all on function public.set_auto_log_sharing(text) from public, anon;
grant execute on function public.set_auto_log_sharing(text) to authenticated;

-- ------------------------------------------------------------- 7. sessions logged before this
-- Each session the server logged before this file (185) gets its post, at
-- the time it was played. Each was announced "Saved privately", so it is held
-- back (auto_held, review): only the player sees it until they choose who sees
-- these (Settings, or a connect screen that says so); then it follows that choice.
do $$
declare
  r record;
  v_all int := 0;
  v_made int := 0;
begin
  for r in select s.id from public.practice_sessions s where s.auto_logged and s.activity_id is not null order by s.created_at loop
    v_all := v_all + 1;
    if public.auto_post_for_session(r.id, true) is not null then v_made := v_made + 1; end if;
  end loop;
  raise notice 'Sessions that logged themselves before this: %. Posts made for them: %.', v_all, v_made;
end $$;

-- The owner's own choice, Oct 28 (his account @mrdinosaur62): "It should show up on the activity feed",
-- with "mutuals default" before it. Friends, so his WHOOP session of today reaches his friends who follow
-- him back at once. Only if he has not chosen already (a second run never changes his choice).
insert into public.user_state (user_id, auto_log_audience)
select 'a908b335-fe34-4e4f-817b-ede312b446d7'::uuid, 'mutuals'
 where exists (select 1 from public.profiles where id = 'a908b335-fe34-4e4f-817b-ede312b446d7')
on conflict (user_id) do update set auto_log_audience = 'mutuals' where public.user_state.auto_log_audience is null;

-- ------------------------------------------------------------- 8. last check
do $$
declare
  f record;
  k text;
  want jsonb := '{
    "auto_log_activity(uuid,uuid)": "f5061800a77fbb088e12ba2b2402540e",
    "send_activity_pushes(uuid,uuid[])": "c07030432cc8698f53f9e8ab0646bae8",
    "session_unposted(uuid,uuid)": "b2f215cfec2c5bedcb2a708ce2fcd551",
    "mark_first_post()": "f91afaf25816b2cb5b0904cb15312be6",
    "share_preview(text,text)": "de1106c76c98906fe7804b53613f13c4",
    "group_feed(uuid,timestamp with time zone,integer)": "48073ce6bcc04130f1f436f6f7fc5a14",
    "invite_first_action(uuid,uuid)": "53aeb183876852b75fedfe61c517926f",
    "invite_second_day(uuid,timestamp with time zone)": "dc03a465e834a74712b455327345d1fb",
    "invite_back_at(uuid,timestamp with time zone)": "11a4ea4eefe9f84cd9c86b7fec05a76b",
    "first_day_stats()": "0c3035690a2912d05759871ed9b4fe5e",
    "auto_log_audience_of(uuid,text)": "ad0799fd238d65ffa2da74763382e815",
    "auto_log_seen_by(uuid,text,boolean)": "5bef48ae8ad986f188a8455ad5572910",
    "auto_post_shown(uuid)": "817120565ce9e19e1834f29349c68404",
    "guard_auto_post()": "7a56a8f8282dd1d7b4d54219135d3e5f",
    "auto_post_for_session(uuid,boolean)": "4b66fb4ad57e0a41a0d27a218ee0028a",
    "auto_post_follows_session()": "a943542e975922638c38f9ddc7d89f20",
    "drop_emptied_auto_post()": "a157819b85b79b73af9d14d79ba5e628",
    "unsure_learned(uuid,text)": "bb9425abf3dab9ab466ad47eb65f91bf",
    "count_unsure_answers()": "2ad4564a9b94e2bbf3bd885dfb5aaf4e",
    "log_unsure_tennis()": "1ed7ec9f57389a0eb5a7336e2b6a4f20",
    "set_auto_log_sharing(text)": "8ccde8a3e0b051bfa363936cca55170c",
    "auto_log_src_of(uuid,uuid,text)": "3400f6e57ec30e03154421addba7b022",
    "unsure_yes_taken_back()": "e0e5ad92e2f0e78054487b81e41f9cb2",
    "feed_post_scores()": "5c47960c124d4f6941dc222921391108",
    "admin_new_players(integer)": "f56c6f4274e83bbcdba74c7d2befeb1a",
    "session_minor_posts(uuid)": "af3c97d6d8436618e9197b830ad4cdb7",
    "refresh_city_board()": "653b4f13594b34cff16425c59b3edc63"
  }';
  -- Who may call it: [signed out, signed in]. Anything not listed: neither.
  callers jsonb := '{
    "auto_post_shown(uuid)": [true, true],
    "log_unsure_tennis()": [false, true],
    "set_auto_log_sharing(text)": [false, true],
    "share_preview(text,text)": [true, true],
    "group_feed(uuid,timestamp with time zone,integer)": [false, true],
    "mark_first_post()": [true, true],
    "first_day_stats()": [true, true],
    "feed_post_scores()": [false, true],
    "admin_new_players(integer)": [false, true],
    "session_minor_posts(uuid)": [false, true]
  }';
begin
  for k in select jsonb_object_keys(want) loop
    select md5(p.prosrc) as src, p.prosecdef as definer, p.proconfig as config,
           has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as signed_in
      into f from pg_proc p where p.oid = ('public.' || k)::regprocedure;
    if f.src is distinct from want->>k or not f.definer or f.config is distinct from array['search_path=public'] then
      raise exception 'Migration 20261029000193 stopped: % is not this file''s. Nothing was changed.', k;
    end if;
    if f.anon is distinct from coalesce((callers->k->>0)::boolean, false) or f.signed_in is distinct from coalesce((callers->k->>1)::boolean, false) then
      raise exception 'Migration 20261029000193 stopped: who may call % is wrong. Nothing was changed.', k;
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'auto_logged')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'auto_log_audience')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'unsure_yes')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'auto_held')
     or not exists (select 1 from pg_policy where polrelid = 'public.post_likes'::regclass and polname = 'sessions that log themselves: liked by their audience' and not polpermissive)
     or not exists (select 1 from pg_trigger where tgrelid = 'public.practice_sessions'::regclass and tgname = 'unsure_yes_taken_back')
     or not exists (select 1 from pg_policy where polrelid = 'public.posts'::regclass and polname = 'sessions that log themselves: only their audience' and not polpermissive)
     or not exists (select 1 from pg_trigger where tgrelid = 'public.posts'::regclass and tgname = 'auto_post_guard')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.posts'::regclass and tgname = 'auto_post_emptied')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.practice_sessions'::regclass and tgname = 'auto_post_follows_session')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.detected_activities'::regclass and tgname = 'count_unsure_answers') then
    raise exception 'Migration 20261029000193 stopped: a column, the read rule or a trigger is missing. Nothing was changed.';
  end if;
  -- The owner's choice (step 7) is saved.
  if exists (select 1 from public.profiles where id = 'a908b335-fe34-4e4f-817b-ede312b446d7')
     and (select us.auto_log_audience from public.user_state us where us.user_id = 'a908b335-fe34-4e4f-817b-ede312b446d7') is null then
    raise exception 'Migration 20261029000193 stopped: the owner''s choice was not saved. Nothing was changed.';
  end if;
  -- Every session that logged itself, not posted by its player, has its post.
  if exists (select 1 from public.practice_sessions s where s.auto_logged and s.activity_id is not null
               and public.session_unposted(s.id, s.user_id)
               and not exists (select 1 from public.posts p where p.author_id = s.user_id and p.auto_logged and lower(p.session->>'sessionId') = s.id::text)) then
    raise exception 'Migration 20261029000193 stopped: a session that logged itself did not get its post. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 9. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
--
-- (a) The server's posts, by who sees them (counts only):
-- select public.auto_log_audience_of(p.author_id, null) as seen_by, count(*)
--   from public.posts p where p.auto_logged group by 1;
--
-- (b) Players whose Fitbit Sport now logs itself (count only):
-- select count(*) from public.user_state where unsure_yes >= 2;
