-- CourtSide · migration 68: every share pulls someone in.
--
-- 1. A shared link opens for someone with no account: share_preview() hands
--    the page a read-only look at one post, profile, open hit, thread or
--    court. Only what a stranger may see comes back: the author must be a
--    public account, not suspended, and known to be an adult (a teen, or an
--    account with no birthday yet, never shows to a stranger). Anything else
--    comes back as { open: false } and the page shows "Join CourtSide to see
--    this" without saying whose it is or what it was.
-- 2. Who invited whom. profiles.referred_by (migration 28) already holds it,
--    set once, inside a day of signing up, by claim_referral. Here the
--    inviter is also told: "X joined CourtSide from your link" (the follow
--    the invite makes carries that line, so it rides the existing follow
--    alert and its push).
--
-- 3. A teen (or anyone whose age is not on file yet) who joins through a
--    link is not made to follow the sharer: under migration 64 a teen who
--    follows an adult is open to them. The invite is still counted
--    (referred_by); the follow waits until the age says adult
--    (follow_my_inviter, called by the app once the birthday is in).
-- 4. Group posts (migration 67, posts.group_id) never show, are never
--    counted, and someone blocked by the author is never shown anything.
--    group_id is read through to_jsonb so this still runs before 67.
--
-- Needs migrations 18, 36 and 64. Safe to run more than once.

-- ============================================================ 1. helpers (server only)

-- Whether a stranger may see this person's things: public, not suspended,
-- and known to be an adult (known_adult, never age_group directly).
create or replace function public.share_open(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select u is not null
     and exists (select 1 from public.profiles p where p.id = u and not p.is_private and p.suspended_at is null)
     and public.known_adult(u)
$$;
revoke all on function public.share_open(uuid) from public, anon, authenticated;

-- share_open, and the signed-in person asking is not blocked either way.
create or replace function public.share_open_to_me(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.share_open(u)
     and (auth.uid() is null or not public.is_blocked_between(auth.uid(), u))
$$;
revoke all on function public.share_open_to_me(uuid) from public, anon, authenticated;

-- A post that lives in a group (migration 67): never shown outside it.
create or replace function public.share_in_group(p public.posts)
returns boolean language sql stable security definer set search_path = public as $$
  select (to_jsonb(p)->>'group_id') is not null
$$;
revoke all on function public.share_in_group(public.posts) from public, anon, authenticated;

-- The few things a stranger sees about a person.
create or replace function public.share_person(u uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p.id, 'name', p.name, 'handle', p.handle, 'avatarUrl', p.avatar_url,
    'location', nullif(btrim(p.location), ''), 'isCoach', p.is_coach))
  from public.profiles p where p.id = u
$$;
revoke all on function public.share_person(uuid) from public, anon, authenticated;

-- One post as a small tile (its picture and a line of words).
create or replace function public.share_tile(p public.posts)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'body', left(regexp_replace(p.body, '\s+', ' ', 'g'), 80),
    'imageUrl', p.image_url, 'thumbnailUrl', p.thumbnail_url))
$$;
revoke all on function public.share_tile(public.posts) from public, anon, authenticated;

-- ============================================================ 2. the public look
-- p_kind: 'post' | 'profile' | 'hit-request' | 'question' | 'court' | 'referrer'.
-- Always answers with { kind, open }: open true carries the thing; open
-- false carries nothing else. "gone" is only said about something whose
-- author a stranger may see anyway (a hit that is over or called off).
create or replace function public.share_preview(p_kind text, p_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
        'comments', (select count(*) from public.comments c where c.post_id = p.id),
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
        'openHits', (select count(*) from public.hit_requests y where y.author_id = pr.id and not y.cancelled and y.starts_at > now()),
        'recent', coalesce((select jsonb_agg(public.share_tile(x) order by x.created_at desc) from (
          select * from public.posts x where x.author_id = pr.id and not x.archived and x.removed_at is null
            and (x.image_url is not null or x.thumbnail_url is not null) and not public.share_in_group(x)
          order by x.created_at desc limit 6) x), '[]'::jsonb))));
  end if;

  if p_kind = 'hit-request' then
    if not is_uuid then return locked; end if;
    select * into h from public.hit_requests where id = p_id::uuid;
    if h.id is null or not public.share_open_to_me(h.author_id) then return locked; end if;
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
    if q.id is null or not public.share_open_to_me(q.author_id) then return locked; end if;
    return jsonb_build_object('kind', 'question', 'open', true,
      'author', public.share_person(q.author_id),
      'question', jsonb_build_object(
        'id', q.id, 'title', left(q.title, 200), 'body', left(q.body, 400), 'createdAt', q.created_at,
        'answers', (select count(*) from public.answers a where a.question_id = q.id)));
  end if;

  if p_kind = 'court' then
    -- A court is a public place: its page always opens. What it counts and
    -- shows is only from people a stranger may see.
    if coalesce(p_id, '') !~ '^(node|way|relation)[0-9]{1,15}$' then return locked; end if;
    return jsonb_build_object('kind', 'court', 'open', true,
      'court', jsonb_strip_nulls(jsonb_build_object(
        'name', (select x.court_name from public.posts x where x.court_id = p_id and x.court_name is not null and not public.share_in_group(x) order by x.created_at desc limit 1),
        'openHits', (select count(*) from public.hit_requests y where y.place->>'id' = p_id and not y.cancelled and y.starts_at > now() and public.share_open_to_me(y.author_id)),
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
end $$;
revoke all on function public.share_preview(text, text) from public;
grant execute on function public.share_preview(text, text) to anon, authenticated;

-- ============================================================ 3. "X joined from your link"
-- As in migration 36, and the follow (or follow request) it makes now says
-- where it came from, so the inviter's alert reads "joined CourtSide from
-- your link" instead of a plain follow.
create or replace function public.claim_referral(p_handle text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  wanted text := lower(trim(coalesce(p_handle, '')));
  who uuid;
  mine public.profiles;
begin
  if me is null then raise exception 'sign in first'; end if;
  select * into mine from public.profiles where id = me for update;
  if mine.id is null or mine.referred_by is not null or mine.created_at < now() - interval '1 day' then return null; end if;
  select id into who from public.profiles where handle = wanted;
  if who is null and to_regclass('public.handle_history') is not null then
    execute 'select user_id from public.handle_history where handle = $1 order by released_at desc limit 1' into who using wanted;
  end if;
  if who is null or who = me or public.is_blocked_between(me, who) then return null; end if;
  perform set_config('courtside.referral', 'on', true);
  update public.profiles set referred_by = who where id = me;
  perform set_config('courtside.referral', 'off', true);
  -- The invite counts either way. The follow only when this person is known
  -- to be an adult: a teen following an adult opens the teen to them
  -- (migration 64). Answers null when no follow was made, so the app says
  -- nothing; follow_my_inviter makes it once the birthday says adult.
  if not public.known_adult(me) then return null; end if;
  perform public.follow_inviter_now(me, who);
  return who;
end;
$$;
revoke all on function public.claim_referral(text) from public;
grant execute on function public.claim_referral(text) to authenticated;

-- The follow (or follow request, for a private account) an invite makes,
-- carrying the "joined from your link" line.
create or replace function public.follow_inviter_now(me uuid, who uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('courtside.invite', 'on', true);
  if coalesce((select is_private from public.profiles where id = who), false) then
    insert into public.follow_requests (requester_id, target_id) values (me, who) on conflict do nothing;
  else
    insert into public.follows (follower_id, following_id) values (me, who) on conflict do nothing;
  end if;
  perform set_config('courtside.invite', 'off', true);
end $$;
revoke all on function public.follow_inviter_now(uuid, uuid) from public, anon, authenticated;

-- For someone whose age was not on file when they claimed their invite
-- (signed up with Google, say): once it says adult, the follow is made.
-- Only inside a week of signing up, never across a block, and never over
-- an existing follow, request or follow alert between the two.
create or replace function public.follow_my_inviter()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mine public.profiles;
begin
  if me is null then return null; end if;
  select * into mine from public.profiles where id = me;
  if mine.id is null or mine.referred_by is null or mine.created_at < now() - interval '7 days' then return null; end if;
  if not public.known_adult(me) or public.is_blocked_between(me, mine.referred_by) then return null; end if;
  if exists (select 1 from public.follows where follower_id = me and following_id = mine.referred_by)
     or exists (select 1 from public.follow_requests where requester_id = me and target_id = mine.referred_by)
     or exists (select 1 from public.notifications where user_id = mine.referred_by and actor_id = me and kind in ('follow', 'follow-request', 'follow-accepted')) then
    return null;
  end if;
  perform public.follow_inviter_now(me, mine.referred_by);
  return mine.referred_by;
end $$;
revoke all on function public.follow_my_inviter() from public, anon;
grant execute on function public.follow_my_inviter() to authenticated;

-- The line an invite's alert carries. The app reads it to say "joined
-- CourtSide from your link"; the push shows it under the follow.
create or replace function public.invite_words()
returns text language sql stable as $$
  select case when coalesce(current_setting('courtside.invite', true), '') = 'on' then 'Joined CourtSide from your link' end
$$;
revoke all on function public.invite_words() from public, anon, authenticated;

-- As in migration 18, with the invite's line.
create or replace function public.notify_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not distinct from new.following_id then
    update public.notifications set kind = 'follow', read = true
      where user_id = new.following_id and actor_id = new.follower_id and kind = 'follow-request';
    perform public.file_notification(new.follower_id, new.following_id, 'follow-accepted', new.following_id::text, 'post', null, true, interval '7 days');
  else
    perform public.file_notification(new.following_id, new.follower_id, 'follow', new.follower_id::text, 'post', public.invite_words(), true, interval '7 days');
  end if;
  return new;
end $$;

create or replace function public.notify_follow_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.file_notification(new.target_id, new.requester_id, 'follow-request', new.requester_id::text, 'post', public.invite_words());
  return new;
end $$;
revoke all on function public.notify_follow() from public, anon, authenticated;
revoke all on function public.notify_follow_request() from public, anon, authenticated;

-- ============================================================ 4. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) A stranger may ask for a look (expect true, true, false):
-- select has_function_privilege('anon', 'public.share_preview(text, text)', 'execute'),
--        has_function_privilege('authenticated', 'public.share_preview(text, text)', 'execute'),
--        has_function_privilege('anon', 'public.share_open(uuid)', 'execute');
--
-- (b) Something made up comes back closed (expect {"kind": "post", "open": false}):
-- select public.share_preview('post', '00000000-0000-0000-0000-000000000000');
