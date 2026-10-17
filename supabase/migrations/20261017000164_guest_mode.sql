-- CourtSide · migration 20261017000164: guest mode, reading the app on the
-- website before you have an account (Oct 17, owner: "we still want people
-- to be able to read discussions etc, or even view videos, like if someone
-- clicked a Reddit link, they can view stuff, it's just when you want to
-- actually do something that requires profile it will make you sign up").
--
-- What it is for: someone opens app.courtsidebase.com (or a link to a thread
-- or a clip) without an account. The web app now opens in "guest mode": the
-- normal tabs, read-only. The Feed shows recent clips, photos and posts; the
-- Discussions show threads and their replies. Anything that needs a profile
-- (like, reply, follow, post, message) asks them to make a free account.
-- The iPhone app is unchanged: signed out, it still opens on sign-in.
--
-- In plain words, this file adds four things a visitor with no account may
-- ask for, and nothing else:
--   guest_feed(before, how many): recent posts, newest first, at most 30 at
--     a time and only from the last 90 days, each with up to 20 comments.
--   guest_threads(topic, before, how many): Discussions threads, newest
--     first, at most 30 at a time, with how many replies a visitor may read.
--   guest_thread(id): one thread and the replies a visitor may read (up to 200).
--   guest_coaches(): the coaches listed on the Coaching tab, with what they offer.
-- And it closes one old door: signed out, the threads, replies and polls
-- tables could still be read straight through the app's gateway, voter lists
-- included (who voted is a list of account ids, teens' too). Nothing in the
-- app or the website reads them that way; from now on a visitor reads them
-- only through the four functions above.
--
-- The safety rules (minors use this app), all checked here on the server,
-- never left to the website:
--   * Only what a known adult wrote: a public account, not suspended, with a
--     birthday on file saying 18 or over (share_open, migration 68). Never a
--     teen, never an account with no birthday, never a private account.
--   * A thread by anyone else is left out whole. A reply or comment by anyone
--     else is left out, and so is everything under it.
--   * A post is left out whole when it tags anyone, or lists anyone on its
--     session, who is not a known adult.
--   * Never a taken-down post, comment, thread or reply (removed_at, 108),
--     never a post an admin pushed to the bottom (post_demotions, 152), never
--     a comment or reply someone's Hidden words hid (117), never a post put
--     away (archived), shared only to a group (67), or one whose author said
--     CourtSide may not feature it (feature_ok off).
--   * About each person only: their first name, their handle, their photo
--     and the level on their posts (NTRP 4.0). Never a last name, an email,
--     a town, a birthday or an age, goals or injuries, a follower list, who
--     liked or voted, or when anyone was last seen.
--   * About each post only what the screens draw: the words (first 2,000
--     letters), its photos or clip (the public media addresses the app
--     already uses; only https ones), the number of likes, and its
--     session's shape (minutes, focus, kind, drills, the score). Never heart
--     rate, zones, strain, calories, a tracker, the people on the session, a
--     match opponent's name, or where it was (no court, no map spot, no
--     typed place).
--   * Nothing about the map, open-to-hit, people nearby, messages,
--     notifications, or who follows whom. (The peek, migration 163, already
--     shows open hits at listed courts with no names.)
--   * Hard limits: 30 posts or threads a call, 20 comments a post, 200
--     replies a thread; posts only from the last 90 days.
--
-- Said plainly, as migration 109 does: a visitor's list of threads and
-- posts leaves out teens and accounts with no birthday, while a free
-- account's list includes public ones. Comparing the two could suggest that
-- an author is "not known to be an adult" (a teen OR someone who skipped
-- their birthday; it cannot tell which). share_preview (68) already answers
-- the same question one link at a time. The limits above (90 days, 30 a
-- call) and having no lookup by person (no profile pages for visitors)
-- make that slower, not impossible: someone patient could still page
-- through it. Closing it fully means hiding teens' public posts from
-- strangers who are signed in too: an owner decision, not made here.
--
-- Photos and clips: they live in the "media" storage bucket, which is
-- public (anyone with an address can load it; the app has always used its
-- public addresses). This file changes no storage rule. Chat photos and
-- coach applications live in private buckets and are never returned here.
--
-- Nothing already saved changes. Needs migrations 21, 67, 68, 108, 109, 117
-- and 152 (all live). Stops before changing anything if the helpers it leans
-- on (known_adult, share_open) have changed since they were written, if a
-- table or column it reads is missing, or if one of its functions already
-- exists and is not this file's. Safe to run more than once.
--
-- ------------------------------------------------------------- HOW TO RUN IT
-- Supabase -> SQL Editor -> New query, paste this whole file, press Run.
-- "Success. No rows returned" means it is in. Anything else: nothing was
-- changed; the message says why. (Try the DRY RUN at the bottom first.)

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  -- md5 of each helper's body as its migration left it (live since Oct 5; the same as 163 checks).
  want constant jsonb := jsonb_build_object(
    'known_adult', 'a79e745befd4374ea124ccf1692145a2',  -- 109
    'share_open',  '4b238dfbfac4f00409d2bf793120f186'); -- 68
  k text;
  r record;
begin
  if to_regclass('public.posts') is null or to_regclass('public.comments') is null or to_regclass('public.post_likes') is null
     or to_regclass('public.questions') is null or to_regclass('public.answers') is null or to_regclass('public.polls') is null
     or to_regclass('public.profiles') is null or to_regclass('public.user_state') is null
     or to_regclass('public.coaches') is null or to_regclass('public.coach_services') is null then
    raise exception 'Migration 164 stopped before changing anything: the posts, comments, threads, replies, polls, profiles and coaches tables have to be there first.';
  end if;
  if to_regclass('public.post_demotions') is null then
    raise exception 'Migration 164 stopped before changing anything: run migration 152 (push to bottom) first, so a pushed-down post never shows to a visitor.';
  end if;
  if to_regclass('public.comment_word_holds') is null or to_regnamespace('private') is null then
    raise exception 'Migration 164 stopped before changing anything: run migrations 109 and 117 (Hidden words) first, so a hidden comment never shows to a visitor.';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'posts'
       and column_name in ('archived', 'removed_at', 'group_id', 'feature_ok', 'tagged_user_ids', 'session', 'match', 'image_urls')) <> 8 then
    raise exception 'Migration 164 stopped before changing anything: posts is missing columns migrations 28, 67, 108 and 159 add.';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'comments'
       and column_name in ('removed_at', 'parent_id', 'reply_to_id', 'image_url')) <> 4
     or (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'answers'
       and column_name in ('removed_at', 'parent_answer_id', 'media_url', 'media_kind', 'media_thumb')) <> 5
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'questions' and column_name = 'removed_at') then
    raise exception 'Migration 164 stopped before changing anything: comments, threads or replies are missing columns migrations 40, 52, 56 and 108 add.';
  end if;
  for k in select jsonb_object_keys(want) loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = k) then
      raise exception 'Migration 164 stopped before changing anything: public.% is missing.', k;
    end if;
    for r in select md5(p.prosrc) as m from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = k loop
      if r.m <> want->>k then
        raise exception 'Migration 164 stopped before changing anything: public.% has changed since it was written (md5 %). Check that guest mode still keeps to its rules first.', k, r.m;
      end if;
    end loop;
  end loop;
  -- Every function this file makes is either absent or this file's own (it says guest_164 inside).
  for r in select n.nspname, p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and p.proname in ('guest_feed', 'guest_threads', 'guest_thread', 'guest_coaches'))
               or (n.nspname = 'private' and p.proname in ('guest_post_ok', 'guest_comment_ok', 'guest_answer_ok', 'guest_people')) loop
    if position('guest_164' in r.prosrc) = 0 then
      raise exception 'Migration 164 stopped before changing anything: %.% already exists and is not this file''s. Compare before replacing it.', r.nspname, r.proname;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------- 1. the rules, server only
-- These live in "private", which the app's gateway does not open (see 109),
-- and nobody but the functions below may run them.

-- A post a visitor may see (everything but its age: guest_feed adds the 90 days).
create or replace function private.guest_post_ok(p public.posts)
returns boolean language sql stable security definer set search_path = public as $$
  -- guest_164
  select p.id is not null
     and not p.archived
     and p.removed_at is null
     and p.group_id is null
     and p.feature_ok is not false
     and public.share_open(p.author_id)
     -- Everyone tagged on it is a known adult (a tag is a name on the post).
     and not exists (select 1 from unnest(coalesce(p.tagged_user_ids, '{}'::uuid[])) t(u) where not public.known_adult(t.u))
     -- Everyone on its session is a known adult (their names are on the stats).
     and not exists (
       select 1 from jsonb_array_elements(case when jsonb_typeof(p.session->'with') = 'array' then p.session->'with' else '[]'::jsonb end) w(e)
       where not (coalesce(w.e->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  and public.known_adult((w.e->>'id')::uuid)))
     -- Never one an admin pushed to the bottom.
     and not exists (select 1 from public.post_demotions d where d.post_id = p.id)
$$;

-- A comment a visitor may see: not taken down, by a known adult, not hidden
-- by anyone's Hidden words, and (a reply) under a comment that passes too.
create or replace function private.guest_comment_ok(c public.comments)
returns boolean language sql stable security definer set search_path = public as $$
  -- guest_164
  select c.id is not null
     and c.removed_at is null
     and public.share_open(c.author_id)
     and not exists (select 1 from public.comment_word_holds w where w.kind = 'comment' and w.item_id in (c.id, c.parent_id))
     and (c.parent_id is null or exists (
       select 1 from public.comments x where x.id = c.parent_id and x.removed_at is null and public.share_open(x.author_id)))
$$;

-- A reply on its own (its place in the thread is checked by guest_thread):
-- not taken down, by a known adult, not hidden by anyone's Hidden words.
create or replace function private.guest_answer_ok(a public.answers)
returns boolean language sql stable security definer set search_path = public as $$
  -- guest_164
  select a.id is not null
     and a.removed_at is null
     and public.share_open(a.author_id)
     and not exists (select 1 from public.comment_word_holds w where w.kind = 'answer' and w.item_id in (a.id, a.parent_answer_id))
$$;

-- The few things a visitor sees about the people on a page: first name,
-- handle, photo and level. Only ever asked about people who passed share_open.
create or replace function private.guest_people(ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  -- guest_164
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', p.id,
           'name', coalesce(nullif(left(split_part(btrim(p.name), ' ', 1), 30), ''), p.handle),
           'handle', p.handle,
           'avatar_url', case when p.avatar_url like 'https://%' then left(p.avatar_url, 600) end,
           -- The level on their posts (as share_preview's profile card shows it): scale and number only.
           'skill_system', case when p.profile->>'skillSystem' in ('NTRP', 'UTR', 'ITF') then p.profile->>'skillSystem' end,
           'rating', case when jsonb_typeof(p.profile->'rating') = 'number' then p.profile->'rating' end))
         order by p.id), '[]'::jsonb)
  from public.profiles p
  where p.id = any (coalesce(ids, '{}'::uuid[])) and public.share_open(p.id)
$$;

revoke all on function private.guest_post_ok(public.posts) from public, anon, authenticated;
revoke all on function private.guest_comment_ok(public.comments) from public, anon, authenticated;
revoke all on function private.guest_answer_ok(public.answers) from public, anon, authenticated;
revoke all on function private.guest_people(uuid[]) from public, anon, authenticated;

-- ------------------------------------------------------------- 2. guest_feed
drop function if exists public.guest_feed(timestamptz, integer);
create function public.guest_feed(p_before timestamptz default null, p_limit integer default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  -- guest_164
  with page as (
    select p.* from public.posts p
    where p.created_at > now() - interval '90 days'
      and p.created_at < least(coalesce(p_before, now() + interval '1 minute'), now() + interval '1 minute')
      and private.guest_post_ok(p)
    order by p.created_at desc, p.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 30)
  ),
  ranked as (
    select c.*, row_number() over (partition by c.post_id order by c.created_at desc, c.id desc) as n
    from public.comments c
    where c.post_id in (select id from page) and private.guest_comment_ok(c)
  ),
  kept as (select * from ranked where n <= 20),
  shown as (
    select p.id, p.created_at, jsonb_strip_nulls(jsonb_build_object(
      'id', p.id, 'author_id', p.author_id, 'kind', p.kind, 'body', left(p.body, 2000), 'created_at', p.created_at,
      'media_label', left(p.media_label, 80),
      'image_url', case when p.image_url like 'https://%' then p.image_url end,
      'image_urls', case when p.image_url like 'https://%' and cardinality(p.image_urls) between 2 and 10
                          and not exists (select 1 from unnest(p.image_urls) u where u not like 'https://%') then to_jsonb(p.image_urls) end,
      'video_url', case when p.video_url like 'https://%' then p.video_url end,
      'thumbnail_url', case when p.thumbnail_url like 'https://%' then p.thumbnail_url end,
      'orientation', case when p.orientation in ('portrait', 'landscape') then p.orientation end,
      'trim_start', p.trim_start, 'trim_end', p.trim_end, 'muted', p.muted, 'crop', p.crop,
      'speed', p.speed, 'volume', p.volume,
      'tags', to_jsonb((coalesce(p.tags, '{}'::text[]))[1:10]),
      'views', p.views, 'edited_at', p.edited_at, 'is_first', p.is_first,
      -- No place at all: not the court tagged, not its map spot, not a typed place.
      -- A match's score and surface, never the opponent's name.
      'match', case when jsonb_typeof(p.match) = 'object' then jsonb_build_object(
        'opponentName', '',
        'sets', coalesce((select jsonb_agg(s.v) from jsonb_array_elements(case when jsonb_typeof(p.match->'sets') = 'array' then p.match->'sets' else '[]'::jsonb end) with ordinality s(v, i)
                          where jsonb_typeof(s.v) = 'string' and char_length(s.v #>> '{}') <= 12 and s.i <= 5), '[]'::jsonb),
        'won', coalesce(case when jsonb_typeof(p.match->'won') = 'boolean' then p.match->'won' end, 'false'::jsonb),
        'surface', case when p.match->>'surface' in ('hard', 'clay', 'grass', 'indoor') then p.match->>'surface' else 'hard' end) end,
      -- Only the session's shape and score: never a tracker's numbers or who else played.
      'session', case when jsonb_typeof(p.session) = 'object' then jsonb_strip_nulls(jsonb_build_object(
        'minutes', case when jsonb_typeof(p.session->'minutes') = 'number' then p.session->'minutes' else '0'::jsonb end,
        'focus', coalesce(left(p.session->>'focus', 60), ''),
        'drills', coalesce((select jsonb_agg(left(d.v #>> '{}', 40)) from jsonb_array_elements(case when jsonb_typeof(p.session->'drills') = 'array' then p.session->'drills' else '[]'::jsonb end) with ordinality d(v, i)
                            where jsonb_typeof(d.v) = 'string' and d.i <= 10), '[]'::jsonb),
        'intensity', case when p.session->>'intensity' in ('1', '2', '3', '4', '5') then p.session->'intensity' end,
        'kind', case when p.session->>'kind' in ('practice', 'match', 'drills', 'fitness') then p.session->>'kind' end,
        'won', case when jsonb_typeof(p.session->'won') = 'boolean' then p.session->'won' end,
        'sets', case when jsonb_typeof(p.session->'sets') = 'array' and jsonb_array_length(p.session->'sets') <= 5 then p.session->'sets' end,
        'tiebreaks', case when jsonb_typeof(p.session->'tiebreaks') = 'array' and jsonb_array_length(p.session->'tiebreaks') <= 5 then p.session->'tiebreaks' end)) end,
      'like_count', (select count(*) from public.post_likes l where l.post_id = p.id),
      'comments', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', k.id, 'post_id', k.post_id, 'author_id', k.author_id, 'body', left(k.body, 2000), 'created_at', k.created_at,
          'image_url', case when k.image_url like 'https://%' then k.image_url end,
          'parent_id', k.parent_id,
          -- Which comment it answers, only when that one shows too.
          'reply_to_id', case when k.reply_to_id in (select x.id from kept x) then k.reply_to_id end,
          'like_count', (select count(*) from public.comment_likes cl where cl.comment_id = k.id)))
        order by k.created_at) from kept k where k.post_id = p.id), '[]'::jsonb))) as row
    from page p
  )
  select jsonb_build_object(
    'posts', coalesce((select jsonb_agg(s.row order by s.created_at desc, s.id desc) from shown s), '[]'::jsonb),
    'people', private.guest_people(array(select author_id from page union select author_id from kept)))
$$;

-- ----------------------------------------------------------- 3. guest_threads
-- One thread's replies a visitor may read: each passes guest_answer_ok, and
-- so does every reply above it (a reply under a hidden one is hidden too).
-- Used by guest_threads (for the count) and guest_thread (for the replies).
drop function if exists public.guest_threads(text, timestamptz, integer);
create function public.guest_threads(p_topic text default null, p_before timestamptz default null, p_limit integer default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  -- guest_164
  with recursive page as (
    select q.* from public.questions q
    where q.removed_at is null
      and public.share_open(q.author_id)
      and (p_topic is null or q.topic = p_topic)
      and q.created_at < least(coalesce(p_before, now() + interval '1 minute'), now() + interval '1 minute')
    order by q.created_at desc, q.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 30)
  ),
  open_answers as (
    select a.id, a.question_id from public.answers a
    where a.question_id in (select id from page) and a.parent_answer_id is null and private.guest_answer_ok(a)
    union
    select a.id, a.question_id from public.answers a join open_answers o on a.parent_answer_id = o.id
    where private.guest_answer_ok(a)
  )
  select jsonb_build_object(
    'threads', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', q.id, 'author_id', q.author_id, 'title', left(q.title, 300), 'body', left(q.body, 4000),
        'topic', q.topic, 'tags', to_jsonb((coalesce(q.tags, '{}'::text[]))[1:10]), 'votes', q.votes,
        'accepted_answer_id', case when q.accepted_answer_id in (select o.id from open_answers o) then q.accepted_answer_id end,
        'edited_at', q.edited_at, 'created_at', q.created_at,
        'answer_ids', coalesce((select jsonb_agg(o.id) from open_answers o where o.question_id = q.id), '[]'::jsonb),
        'poll', (select jsonb_build_object('options', to_jsonb(pl.options), 'counts', to_jsonb(coalesce(pl.counts, '{}'::int[])))
                 from public.polls pl where pl.question_id = q.id)))
      order by q.created_at desc, q.id desc) from page q), '[]'::jsonb),
    'people', private.guest_people(array(select author_id from page)))
$$;

-- ------------------------------------------------------------ 4. guest_thread
drop function if exists public.guest_thread(uuid);
create function public.guest_thread(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  -- guest_164
  with recursive thread as (
    select q.* from public.questions q
    where q.id = p_id and q.removed_at is null and public.share_open(q.author_id)
  ),
  open_answers as (
    select a.* from public.answers a
    where a.question_id in (select id from thread) and a.parent_answer_id is null and private.guest_answer_ok(a)
    union all
    select a.* from public.answers a join open_answers o on a.parent_answer_id = o.id
    where private.guest_answer_ok(a)
  ),
  kept as (select * from open_answers order by created_at, id limit 200)
  select case when not exists (select 1 from thread) then null else jsonb_build_object(
    'thread', (select jsonb_strip_nulls(jsonb_build_object(
        'id', q.id, 'author_id', q.author_id, 'title', left(q.title, 300), 'body', left(q.body, 4000),
        'topic', q.topic, 'tags', to_jsonb((coalesce(q.tags, '{}'::text[]))[1:10]), 'votes', q.votes,
        'accepted_answer_id', case when q.accepted_answer_id in (select k.id from kept k) then q.accepted_answer_id end,
        'edited_at', q.edited_at, 'created_at', q.created_at,
        'poll', (select jsonb_build_object('options', to_jsonb(pl.options), 'counts', to_jsonb(coalesce(pl.counts, '{}'::int[])))
                 from public.polls pl where pl.question_id = q.id))) from thread q),
    'answers', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', k.id, 'question_id', k.question_id, 'author_id', k.author_id,
        -- A reply whose parent was cut by the 200 limit shows at the top level, never lost under nothing.
        'parent_answer_id', case when k.parent_answer_id in (select x.id from kept x) then k.parent_answer_id end,
        'body', left(k.body, 4000), 'votes', k.votes, 'from_coach', k.from_coach, 'created_at', k.created_at,
        'media_url', case when k.media_url like 'https://%' and k.media_kind in ('photo', 'video') then k.media_url end,
        'media_kind', case when k.media_url like 'https://%' and k.media_kind in ('photo', 'video') then k.media_kind end,
        'media_thumb', case when k.media_thumb like 'https://%' then k.media_thumb end))
      order by k.created_at, k.id) from kept k), '[]'::jsonb),
    'people', private.guest_people(array(select author_id from thread union select author_id from kept))) end
$$;

-- ----------------------------------------------------------- 5. guest_coaches
drop function if exists public.guest_coaches();
create function public.guest_coaches()
returns jsonb language sql stable security definer set search_path = public as $$
  -- guest_164
  with listed as (
    select c.* from public.coaches c
    where c.listed and public.share_open(c.user_id)
    order by c.rating_count desc, c.created_at, c.id
    limit 50
  )
  select jsonb_build_object(
    'coaches', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'user_id', c.user_id, 'headline', c.headline, 'credentials', to_jsonb(c.credentials), 'specialties', to_jsonb(c.specialties),
        'years_coaching', c.years_coaching, 'response_time_hours', c.response_time_hours, 'verified', c.verified, 'listed', c.listed,
        'payouts_ready', c.payouts_ready, 'payouts_started', c.payouts_started, 'rating_avg', c.rating_avg, 'rating_count', c.rating_count,
        'created_at', c.created_at,
        'services', coalesce((select jsonb_agg(jsonb_build_object(
            'id', s.id, 'coach_id', s.coach_id, 'title', s.title, 'description', s.description, 'price_cents', s.price_cents,
            'turnaround_hours', s.turnaround_hours, 'kind', s.kind, 'active', s.active, 'position', s.position) order by s.position)
          from public.coach_services s where s.coach_id = c.id and s.active), '[]'::jsonb))
      order by c.rating_count desc, c.created_at, c.id) from listed c), '[]'::jsonb),
    'people', private.guest_people(array(select user_id from listed)))
$$;

-- Only a visitor with no account asks for these (signed in, the app reads the real thing).
revoke all on function public.guest_feed(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.guest_threads(text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.guest_thread(uuid) from public, anon, authenticated;
revoke all on function public.guest_coaches() from public, anon, authenticated;
grant execute on function public.guest_feed(timestamptz, integer) to anon;
grant execute on function public.guest_threads(text, timestamptz, integer) to anon;
grant execute on function public.guest_thread(uuid) to anon;
grant execute on function public.guest_coaches() to anon;

-- ------------------------------------------------ 6. close the old door
-- Signed out, the threads, replies and polls tables are read only through
-- the functions above (and share_preview, 68, for a shared link's card).
drop policy if exists "signed out read threads through guest mode" on public.questions;
create policy "signed out read threads through guest mode" on public.questions as restrictive for select to anon using (false);
drop policy if exists "signed out read replies through guest mode" on public.answers;
create policy "signed out read replies through guest mode" on public.answers as restrictive for select to anon using (false);
drop policy if exists "signed out read polls through guest mode" on public.polls;
create policy "signed out read polls through guest mode" on public.polls as restrictive for select to anon using (false);

-- ------------------------------------------------- 7. it did what it says
do $$
declare
  f text;
begin
  foreach f in array array['public.guest_feed(timestamptz, integer)', 'public.guest_threads(text, timestamptz, integer)', 'public.guest_thread(uuid)', 'public.guest_coaches()'] loop
    if not has_function_privilege('anon', f, 'execute') then raise exception 'migration 164: a visitor cannot ask for %', f; end if;
    if has_function_privilege('authenticated', f, 'execute') then raise exception 'migration 164: % is for visitors only', f; end if;
    if (select p.provolatile from pg_proc p where p.oid = f::regprocedure) <> 's' then raise exception 'migration 164: % must only read', f; end if;
  end loop;
  foreach f in array array['private.guest_post_ok(public.posts)', 'private.guest_comment_ok(public.comments)', 'private.guest_answer_ok(public.answers)', 'private.guest_people(uuid[])'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'migration 164: % must be the server''s alone', f;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;

-- ------------------------------------------------------------- DRY RUN
-- To try this file without keeping anything: run it with its "commit;" line
-- (just above) replaced by the lines below, each without its leading "-- ".
-- It counts what a visitor would see now, checks that no author in it is a
-- teen or has no birthday, then undoes it all.
--
-- do $$ declare f jsonb; t jsonb; bad int; begin
--   f := public.guest_feed(null, 30); t := public.guest_threads(null, null, 30);
--   select count(*) into bad from (
--     select (x->>'author_id')::uuid u from jsonb_array_elements(f->'posts') x
--     union all select (c->>'author_id')::uuid from jsonb_array_elements(f->'posts') x, jsonb_array_elements(x->'comments') c
--     union all select (x->>'author_id')::uuid from jsonb_array_elements(t->'threads') x) a
--   where not public.known_adult(a.u);
--   raise notice 'dry run: % posts and % threads a visitor would see, % by someone who is not a known adult (expect 0)',
--     jsonb_array_length(f->'posts'), jsonb_array_length(t->'threads'), bad;
--   if bad > 0 then raise exception 'dry run: someone who is not a known adult would show'; end if;
-- end $$;
-- rollback;

-- ------------------------------------------------- 8. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) How many posts and threads a visitor sees right now:
-- select jsonb_array_length(public.guest_feed(null, 30)->'posts') as posts, jsonb_array_length(public.guest_threads(null, null, 30)->'threads') as threads;
--
-- (b) Every author a visitor sees is a known adult (expect 0):
-- select count(*) from jsonb_array_elements(public.guest_feed(null, 30)->'people') x where not public.known_adult((x->>'id')::uuid);
--
-- (c) Only visitors may ask, and the tables are closed to them (expect true, false, 3):
-- select has_function_privilege('anon', 'public.guest_feed(timestamptz, integer)', 'execute'),
--        has_function_privilege('authenticated', 'public.guest_feed(timestamptz, integer)', 'execute'),
--        (select count(*) from pg_policies where policyname like 'signed out read % through guest mode');
