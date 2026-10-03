-- 76: friends first. A hit can go to the people you invite before anyone else.
--
-- NOT APPLIED — needs the owner's OK.
--
-- The owner's change (Oct 3, "friends first"): the hit form asks "Who sees
-- it first", with three answers.
--
--   * Everyone (audience 'everyone'): as today, and what every hit already
--     posted is.
--   * Invite first ('invite_first'): only the players you invite (and, when
--     you turn on "My groups", the people in your groups) can see it and say
--     "I'm in". It opens to everyone on its own at the earlier of an hour
--     after posting or three hours before it starts (opens_at, worked out
--     here when it is posted), unless it is full by then; a spot that opens
--     up later puts it back out. You can open it to everyone any time
--     ("Open to everyone now", open_hit_now).
--   * Only people I invite ('invite_only'): never public.
--
-- Invited players are told ("Sam invited you to hit", kind 'hit-invite',
-- with its own phone alert) and the app puts the hit's card in your chat
-- with each of them, as "Ask to hit" already does. Spots go to whoever says
-- "I'm in" first, as before.
--
-- Until a hit is open, nobody else gets it from anywhere: reading the table
-- (Find Players, the map, a court's page, search, live updates), the hit's
-- "who's in", the court rings and counts, "people you follow play here",
-- shared links (share_preview says "Join CourtSide to see this"), new-hit
-- and court alerts, and "also looking for a hit" matches. "I'm in" from
-- anyone else is refused ('not_invited'). Every rule that was already there
-- still holds on top (blocks either way, the teen rules of 55/64).
--
-- Opening by time needs no timer: the rule asks "is it past opens_at" every
-- time the hit is read. Opening on time sends no alerts (nobody is around to
-- send them at that minute); "Open to everyone now" sends the usual new-hit
-- alerts at once, as if it had just been posted for everyone.
--
-- What changes, by name:
--   hit_requests: + audience, opens_at, include_groups. A new rule ("hits
--     wait for their invite", restrictive, so it is added to whichever
--     "hits are visible" is in place, 55's or 64's). The poster cannot
--     change who sees it by editing the row; only open_hit_now can.
--   hit_invites (new): who was invited to which hit. The poster reads the
--     list for their own hit; an invited player reads their own row.
--   invite_to_hit(hit, people), open_hit_now(hit), hit_reaches_you(hit):
--     what the app calls.
--   hit_joins: "I'm in" checks the hit reaches you (a trigger; join_hit is
--     not touched, so migration 64's check of it still passes).
--   tell_hit_matches_open (new): migration 64's tell_hit_matches, which
--     also leaves out other hits that are not open yet. The new-hit triggers
--     run it and tell_map_about_hit only for a hit posted for everyone, and
--     again when a hit is opened. tell_hit_matches itself is left as it is,
--     unused, so 64 (not yet run) still recognises it; 64 rewriting it
--     changes nothing.
--   court_rings, court_people_you_follow, my_courts (60) and share_preview
--     (68): the same, leaving out hits that do not reach the reader.
--   The phone-alert trigger on notifications skips 'hit-invite', which sends
--     its own alert (as the map's alerts do since 60).
--
-- Needs 43, 53, 55, 60 (known_adult) and 68. Works with or without 64 and
-- 67 ("My groups" reads 67's members when it is there; without 67 nobody is
-- in a group). Stops without changing anything if any function it replaces
-- has changed since 74. After this has run, do not run 53, 60 or 68 again
-- (they would put the older versions back); if one ever is, run this again.
-- Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
-- md5 of each function's body: as 60/68 left it (unchanged through 74), or as this file leaves it.
do $$
declare
  expected constant text[][] := array[
    -- name, as 74 leaves it, as 76 leaves it
    ['court_rings', '195afc4feb739d935c3b84db54491ef0', 'a195e26a3a9421e5e8fa9720ab3b1ea2'],
    ['court_people_you_follow', '39ff801072d214bf491ef8e0e103ed65', 'b993d87828478e4c6818f8db171953d2'],
    ['my_courts', 'fcec30a6cd3934fccfffd572fbf0c7a6', 'f88a9c2c11488a0496f03dc6fa4827d0'],
    ['share_preview', 'db37e712b986d5b3b91b286f44e97749', 'b7fb9a8d65fde56d5b046f95fe5f94f2']
  ];
  i int;
  now_is text;
  wrong text[] := '{}';
  v_fn text;
begin
  if to_regclass('public.hit_requests') is null or to_regprocedure('public.known_adult(uuid)') is null
     or to_regprocedure('public.share_open_to_me(uuid)') is null or to_regprocedure('public.blocked_with(uuid)') is null
     or to_regprocedure('public.hit_when(timestamptz, jsonb)') is null then
    raise exception 'Migration 76 stopped before changing anything: migrations 43, 53, 55, 60 and 68 have to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    select md5(p.prosrc) into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1];
    if now_is is null or now_is not in (expected[i][2], expected[i][3]) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  -- The new-hit triggers run 53's and 60's functions (or this file's, on a re-run).
  select t.tgfoid::regproc::text into v_fn from pg_trigger t
    where t.tgrelid = 'public.hit_requests'::regclass and t.tgname = 'tell_hit_matches' and not t.tgisinternal;
  if v_fn is null or v_fn not in ('tell_hit_matches', 'tell_hit_matches_open') then
    wrong := wrong || 'the hit_requests trigger tell_hit_matches'::text;
  end if;
  select t.tgfoid::regproc::text into v_fn from pg_trigger t
    where t.tgrelid = 'public.hit_requests'::regclass and t.tgname = 'tell_map_about_hit' and not t.tgisinternal;
  if v_fn is distinct from 'tell_map_about_hit' then
    wrong := wrong || 'the hit_requests trigger tell_map_about_hit'::text;
  end if;
  select t.tgfoid::regproc::text into v_fn from pg_trigger t
    where t.tgrelid = 'public.notifications'::regclass and t.tgname = 'push_for_notification' and not t.tgisinternal;
  if v_fn is distinct from 'push_for_notification' then
    wrong := wrong || 'the notifications trigger push_for_notification'::text;
  end if;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 76 stopped before changing anything: % changed since it was written. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ------------------------------------------------------------ 1. who sees it first
alter table public.hit_requests add column if not exists audience text not null default 'everyone';
alter table public.hit_requests add column if not exists opens_at timestamptz;
alter table public.hit_requests add column if not exists include_groups boolean not null default false;
do $$ begin
  alter table public.hit_requests add constraint hit_requests_audience_check check (audience in ('everyone', 'invite_first', 'invite_only'));
exception when duplicate_object then null; end $$;

-- When it opens is the server's: worked out once, as it is posted. Who sees
-- it is changed only by open_hit_now (which switches courtside.hit_system
-- on, as join_hit does for the chat link).
create or replace function public.guard_hit_audience() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.audience := coalesce(new.audience, 'everyone');
    new.include_groups := coalesce(new.include_groups, false) and new.audience <> 'everyone';
    new.opens_at := case when new.audience = 'invite_first'
      then least(now() + interval '1 hour', new.starts_at - interval '3 hours') end;
    return new;
  end if;
  if auth.uid() is not null and coalesce(current_setting('courtside.hit_system', true), '') <> 'on' then
    new.audience := old.audience; new.opens_at := old.opens_at; new.include_groups := old.include_groups;
  end if;
  return new;
end $$;
drop trigger if exists guard_hit_audience on public.hit_requests;
create trigger guard_hit_audience before insert or update on public.hit_requests
  for each row execute function public.guard_hit_audience();

-- Who was invited. Written only by invite_to_hit.
create table if not exists public.hit_invites (
  hit_id     uuid not null references public.hit_requests (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (hit_id, user_id)
);
create index if not exists hit_invites_user_idx on public.hit_invites (user_id);
alter table public.hit_invites enable row level security;
drop policy if exists "hit invites: yours or your hit's" on public.hit_invites;
create policy "hit invites: yours or your hit's" on public.hit_invites for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.hit_requests h where h.id = hit_id and h.author_id = auth.uid()));

-- ------------------------------------------------------------------- 2. helpers
-- Whether two people are in a group together (migration 67's groups). Read
-- by name at run time, so this works before 67 too (nobody is in a group).
create or replace function public.share_a_feed_group(a uuid, b uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  found_one boolean;
begin
  if a is null or b is null or to_regclass('public.feed_group_members') is null then return false; end if;
  execute 'select exists (select 1 from public.feed_group_members x join public.feed_group_members y on y.group_id = x.group_id
             where x.user_id = $1 and y.user_id = $2)' into found_one using a, b;
  return coalesce(found_one, false);
end $$;
revoke all on function public.share_a_feed_group(uuid, uuid) from public, anon, authenticated;

-- Whether a hit is out for everyone: posted that way, opened by its poster,
-- or invite-first, past its time, with a spot still free.
create or replace function public.hit_is_open(hit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.hit_requests h
    where h.id = hit and (
      h.audience = 'everyone'
      or (h.audience = 'invite_first' and h.opens_at is not null and now() >= h.opens_at
          and (select count(*) from public.hit_joins j where j.hit_id = h.id) < h.spots)))
$$;
revoke all on function public.hit_is_open(uuid) from public, anon, authenticated;

-- Whether a hit reaches someone, as far as who-sees-it-first goes: it is
-- open, or theirs, or they were invited, or they are in it, or it is for
-- the poster's groups and they share one. (Blocks and the teen rules are
-- the other rules' to say, and still do.)
create or replace function public.hit_reaches(viewer uuid, hit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and exists (
    select 1 from public.hit_requests h
    where h.id = hit and (
      h.author_id = viewer
      or public.hit_is_open(h.id)
      or exists (select 1 from public.hit_invites i where i.hit_id = h.id and i.user_id = viewer)
      or exists (select 1 from public.hit_joins j where j.hit_id = h.id and j.user_id = viewer)
      or (h.include_groups and public.share_a_feed_group(h.author_id, viewer))))
$$;
revoke all on function public.hit_reaches(uuid, uuid) from public, anon, authenticated;

-- The same, about yourself only: what the table's rule asks.
create or replace function public.hit_reaches_you(hit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.hit_reaches(auth.uid(), hit)
$$;
revoke all on function public.hit_reaches_you(uuid) from public, anon;
grant execute on function public.hit_reaches_you(uuid) to authenticated;

-- ------------------------------------------------------------- 3. the read rule
-- Restrictive: added to "hits are visible" (55's or 64's), never instead of
-- it. A hit for everyone, and your own, are read off the row itself (a hit
-- being posted is not there yet for the helper to find). "Who's in" reads
-- hit_requests under these rules, so it follows.
drop policy if exists "hits wait for their invite" on public.hit_requests;
create policy "hits wait for their invite" on public.hit_requests as restrictive for select to authenticated
  using (audience = 'everyone' or author_id = auth.uid() or public.hit_reaches_you(id));

-- "I'm in" only for someone the hit reaches. join_hit is the only writer.
create or replace function public.guard_hit_join() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.hit_reaches(new.user_id, new.hit_id) then raise exception 'not_invited'; end if;
  return new;
end $$;
revoke all on function public.guard_hit_join() from public, anon, authenticated;
drop trigger if exists guard_hit_join on public.hit_joins;
create trigger guard_hit_join before insert on public.hit_joins for each row execute function public.guard_hit_join();

-- ------------------------------------------------------------ 4. inviting
-- The poster invites players to their invite-first or invite-only hit (up
-- to 20 in all). Left out, without saying who: yourself, anyone blocked
-- either way, a suspended account, and, under the teen rule join_hit uses,
-- anyone where one of you is not known to be an adult unless you follow
-- each other (they could not join it anyway). Each one invited is told
-- once, unless they blocked or muted you in the app. Answers with who was
-- invited this time. On a hit for everyone it does nothing.
create or replace function public.invite_to_hit(hit uuid, people uuid[]) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  h public.hit_requests;
  who uuid;
  added uuid[] := '{}';
  have int;
  me_name text;
  words text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into h from public.hit_requests where id = hit for update;
  if not found or h.author_id <> me then raise exception 'not_yours'; end if;
  if h.cancelled or h.starts_at < now() - interval '1 hour' then raise exception 'That hit is no longer on.'; end if;
  if h.audience = 'everyone' then return added; end if;
  select count(*) into have from public.hit_invites where hit_id = hit;
  select coalesce(nullif(name, ''), handle, 'Someone') into me_name from public.profiles where id = me;
  words := public.hit_when(h.starts_at, h.place) || ' · ' || coalesce(h.place->>'name', 'a court');
  for who in select distinct x from unnest(coalesce(people, '{}')) as x where x is not null loop
    exit when have >= 20;
    continue when who = me;
    continue when not exists (select 1 from public.profiles p where p.id = who and p.suspended_at is null);
    continue when public.is_blocked_between(me, who);
    continue when (not public.known_adult(me) or not public.known_adult(who))
      and not (exists (select 1 from public.follows where follower_id = me and following_id = who)
           and exists (select 1 from public.follows where follower_id = who and following_id = me));
    insert into public.hit_invites (hit_id, user_id) values (hit, who) on conflict do nothing;
    continue when not found;
    have := have + 1;
    added := added || who;
    continue when exists (select 1 from public.user_state s where s.user_id = who
      and (me::text = any (coalesce(s.blocked_ids, '{}')) or me::text = any (coalesce(s.muted_ids, '{}'))));
    perform public.file_notification(who, me, 'hit-invite', hit::text, 'hit-request', words, true);
    begin
      perform public.send_push(who, coalesce(me_name, 'Someone') || ' invited you to hit', upper(left(words, 1)) || substr(words, 2), '/hit-request/' || hit);
    exception when others then
      null;
    end;
  end loop;
  -- Touch the hit, so the live feed tells the people just invited (the row reaches them now).
  if cardinality(added) > 0 then
    perform set_config('courtside.hit_system', 'on', true);
    update public.hit_requests set include_groups = include_groups where id = hit;
    perform set_config('courtside.hit_system', 'off', true);
  end if;
  return added;
end $$;
revoke all on function public.invite_to_hit(uuid, uuid[]) from public, anon;
grant execute on function public.invite_to_hit(uuid, uuid[]) to authenticated;

-- "Open to everyone now": the poster's, for an invite-first hit. From here
-- it is a hit for everyone, and the usual new-hit alerts go out (below).
create or replace function public.open_hit_now(hit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  h public.hit_requests;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into h from public.hit_requests where id = hit for update;
  if not found or h.author_id <> me then raise exception 'not_yours'; end if;
  if h.audience = 'invite_only' then raise exception 'invite_only'; end if;
  if h.audience = 'everyone' then return; end if;
  if h.cancelled then raise exception 'That hit is no longer on.'; end if;
  perform set_config('courtside.hit_system', 'on', true);
  update public.hit_requests set audience = 'everyone', opens_at = least(coalesce(opens_at, now()), now()) where id = hit;
  perform set_config('courtside.hit_system', 'off', true);
end $$;
revoke all on function public.open_hit_now(uuid) from public, anon;
grant execute on function public.open_hit_now(uuid) to authenticated;

-- ------------------------------------------------------ 5. alerts about a new hit
-- Migration 64's tell_hit_matches, word for word, but the other hits it
-- matches against must be open too (an invite-first hit is nobody else's
-- business yet). It reads ages only through known_adult, so it is right
-- before and after 64.
create or replace function public.tell_hit_matches_open()
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
  if not found or not public.known_adult(new.author_id) then return new; end if;
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
      and public.known_adult(h.author_id)
      and not public.is_blocked_between(h.author_id, new.author_id)
      and public.hit_is_open(h.id)
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
        and public.known_adult(p.id)
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
revoke all on function public.tell_hit_matches_open() from public, anon, authenticated;

-- Posted for everyone: as before. Opened later by its poster: the same, then.
drop trigger if exists tell_hit_matches on public.hit_requests;
create trigger tell_hit_matches after insert on public.hit_requests
  for each row when (new.audience = 'everyone') execute function public.tell_hit_matches_open();
drop trigger if exists tell_map_about_hit on public.hit_requests;
create trigger tell_map_about_hit after insert on public.hit_requests
  for each row when (new.audience = 'everyone') execute function public.tell_map_about_hit();
drop trigger if exists tell_hit_matches_on_open on public.hit_requests;
create trigger tell_hit_matches_on_open after update of audience on public.hit_requests
  for each row when (old.audience <> 'everyone' and new.audience = 'everyone') execute function public.tell_hit_matches_open();
drop trigger if exists tell_map_about_hit_on_open on public.hit_requests;
create trigger tell_map_about_hit_on_open after update of audience on public.hit_requests
  for each row when (old.audience <> 'everyone' and new.audience = 'everyone') execute function public.tell_map_about_hit();

-- "Sam invited you to hit" sends its own phone alert (above), so the general one skips it.
drop trigger if exists push_for_notification on public.notifications;
create trigger push_for_notification after insert on public.notifications
  for each row when (new.kind not in ('map-friend-hit', 'map-new-hit', 'map-new-player', 'court-activity', 'hit-invite'))
  execute function public.push_for_notification();

-- ------------------------------------------------------------ 6. what the map reads
-- Migration 60's court_rings, with hits that do not reach you left out.
create or replace function public.court_rings(min_lat double precision, min_lng double precision, max_lat double precision, max_lng double precision)
returns table (court_id text, name text, lat double precision, lng double precision, posts integer, hits integer, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  with act as (
    select p.court_id as cid, 1 as is_post, p.created_at as at from public.posts p
    where p.court_id is not null and p.created_at > now() - interval '7 days' and not p.archived and p.removed_at is null
      and public.shows_at_court(auth.uid(), p.author_id)
    union all
    select h.place->>'id', 0, h.created_at from public.hit_requests h
    where h.place ? 'id' and h.created_at > now() - interval '7 days' and not h.cancelled
      and public.shows_at_court(auth.uid(), h.author_id)
      and (h.audience = 'everyone' or public.hit_reaches(auth.uid(), h.id))
  ), per as (
    select cid, sum(is_post)::int as posts, (count(*) - sum(is_post))::int as hits, max(at) as last_at from act group by cid
  )
  select c.id, c.name, c.lat, c.lng, per.posts, per.hits, per.last_at
  from per join public.courts c on c.id = per.cid
  where c.lat between least(min_lat, max_lat) and greatest(min_lat, max_lat)
    and c.lng between least(min_lng, max_lng) and greatest(min_lng, max_lng)
  order by per.last_at desc
  limit 300
$$;
revoke all on function public.court_rings(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.court_rings(double precision, double precision, double precision, double precision) to authenticated;

-- Migration 60's court_people_you_follow, with hits that do not reach you left out.
create or replace function public.court_people_you_follow(ids text[])
returns table (court_id text, user_ids uuid[])
language sql stable security definer set search_path = public as $$
  with wanted as (select distinct x as id from unnest(ids[1:50]) as x where x is not null),
  acts as (
    select p.court_id as cid, p.author_id as uid, p.created_at as at from public.posts p
    where p.court_id in (select id from wanted) and p.created_at > now() - interval '90 days' and not p.archived and p.removed_at is null
    union all
    select h.place->>'id', h.author_id, h.created_at from public.hit_requests h
    where h.place->>'id' in (select id from wanted) and h.created_at > now() - interval '90 days' and not h.cancelled
      and (h.audience = 'everyone' or public.hit_reaches(auth.uid(), h.id))
    union all
    select h.place->>'id', j.user_id, j.created_at from public.hit_joins j join public.hit_requests h on h.id = j.hit_id
    where h.place->>'id' in (select id from wanted) and j.created_at > now() - interval '90 days' and not h.cancelled
      and (h.audience = 'everyone' or public.hit_reaches(auth.uid(), h.id))
  ), people as (
    select a.cid, a.uid, max(a.at) as last from acts a
    where a.uid <> auth.uid()
      and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = a.uid)
      and public.shows_at_court(auth.uid(), a.uid)
    group by a.cid, a.uid
  )
  select cid, (array_agg(uid order by last desc))[1:5] from people group by cid
$$;
revoke all on function public.court_people_you_follow(text[]) from public, anon;
grant execute on function public.court_people_you_follow(text[]) to authenticated;

-- Migration 60's my_courts, with hits that do not reach you left out of the counts.
create or replace function public.my_courts()
returns table (court_id text, name text, lat double precision, lng double precision, access text, followed_at timestamptz,
  new_posts integer, upcoming_hits integer, next_hit_at timestamptz, status text, status_at timestamptz, last_at timestamptz, you_here boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.lat, c.lng, c.access, f.created_at,
    coalesce(p.n, 0), coalesce(h.n, 0), h.next_at, st.status, st.created_at, greatest(p.last, h.last),
    exists (select 1 from public.court_checkins k where k.user_id = f.user_id and k.court_id = c.id and k.until > now())
  from public.court_follows f
  join public.courts c on c.id = f.court_id
  left join lateral (
    select count(*)::int as n, max(po.created_at) as last from public.posts po
    where po.court_id = c.id and po.created_at > now() - interval '7 days' and not po.archived and po.removed_at is null
      and po.author_id <> f.user_id and public.shows_at_court(f.user_id, po.author_id)) p on true
  left join lateral (
    select count(*)::int as n, min(hr.starts_at) as next_at, max(hr.created_at) as last from public.hit_requests hr
    where hr.place->>'id' = c.id and not hr.cancelled and hr.starts_at > now()
      and hr.author_id <> f.user_id and public.shows_at_court(f.user_id, hr.author_id)
      and (hr.audience = 'everyone' or public.hit_reaches(f.user_id, hr.id))) h on true
  left join lateral (
    select s.status, s.created_at from public.court_status s
    where s.court_id = c.id and s.created_at > now() - interval '90 minutes'
    order by s.created_at desc limit 1) st on true
  where f.user_id = auth.uid()
  order by greatest(p.last, h.last) desc nulls last, f.created_at desc
  limit 100
$$;
revoke all on function public.my_courts() from public, anon;
grant execute on function public.my_courts() to authenticated;

-- ------------------------------------------------------------ 7. shared links
-- Migration 68's share_preview. A hit that is not open yet shows only to
-- someone signed in whom it reaches (its poster, an invited player, someone
-- in it, or in the poster's groups when it is for them); to anyone else it
-- is locked, like any other private thing. A profile's and a court's
-- "open hits" count only hits that are out for everyone.
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
end $$;
revoke all on function public.share_preview(text, text) from public;
grant execute on function public.share_preview(text, text) to anon, authenticated;

commit;

-- ------------------------------------------------------------ 8. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The new columns, table and rules (expect 3 columns; hit_invites with row security on; the restrictive rule):
-- select (select count(*) from information_schema.columns where table_name = 'hit_requests' and column_name in ('audience', 'opens_at', 'include_groups')) as cols,
--        (select relrowsecurity from pg_class where relname = 'hit_invites') as invites_rls,
--        (select permissive from pg_policies where tablename = 'hit_requests' and policyname = 'hits wait for their invite') as permissive;
--
-- (b) Every hit already posted is for everyone (expect 0):
-- select count(*) from hit_requests where audience <> 'everyone';
--
-- (c) Who may call what (expect true, true, true, false, false):
-- select has_function_privilege('authenticated', 'public.invite_to_hit(uuid, uuid[])', 'execute'),
--        has_function_privilege('authenticated', 'public.open_hit_now(uuid)', 'execute'),
--        has_function_privilege('authenticated', 'public.hit_reaches_you(uuid)', 'execute'),
--        has_function_privilege('authenticated', 'public.hit_reaches(uuid, uuid)', 'execute'),
--        has_function_privilege('anon', 'public.invite_to_hit(uuid, uuid[])', 'execute');
