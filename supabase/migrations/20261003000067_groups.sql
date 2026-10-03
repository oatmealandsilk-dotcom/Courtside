-- 67: groups, with a feed of their own.
--
-- NOT APPLIED — needs the owner's OK. This file has not been run on the live
-- database. Until it runs, the app shows no groups: the Feed's top row is
-- just "For you", and the Groups page says groups are not switched on yet.
--
-- What it does (the owner's spec, Oct 2):
--   * Anyone can start a group: a name (up to 40 characters), a short
--     description if they like (up to 140), and whether anyone can join or
--     people ask first. Whoever starts it is its admin.
--   * Nobody is in more than 3 groups. Checked here, under a lock per
--     person, so two taps at once cannot make it 4.
--   * Joining: an open group, straight in; an ask-first group, a request the
--     admin says yes or no to. Someone the admin removed can only ask again,
--     even in an open group. Admins approve requests and remove members.
--     When the last admin leaves, whoever has been in longest takes over.
--     A group is never deleted, so its posts never become public.
--   * A post can be shared to one group you are in (posts.group_id). Then
--     only that group's members (and its author) can read it, or its
--     comments and likes, by any path: the feed, a profile, a court, a link.
--     A block still hides it both ways. Everything else about who can read
--     a post is unchanged. Which group a post is in cannot be changed later.
--   * A group post carries no map court (so it never alerts a court's
--     followers or counts on the map), and only tags of members alert.
--   * Group posts are not in the "For you" feed (the app leaves them out);
--     the ranking itself is untouched.
--   * Teens can join groups like anyone. Nothing about chats changes: groups
--     have no chat of their own in this version.
--
-- Errors the app relies on, word for word: 'group_limit' (you are in 3),
-- 'their_limit' (the person asking is now in 3), 'not_admin', 'not_found',
-- 'name_needed', 'slow_down', 'not_in_group', 'group_fixed'.
--
-- Needs migrations 02, 21, 23, 56 and 62. Safe to run more than once. Nothing
-- here deletes anyone's posts.

-- ============================================================ 1. tables

create table if not exists public.feed_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  description text check (description is null or char_length(description) <= 140),
  ask_to_join boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.feed_group_members (
  group_id uuid not null references public.feed_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists feed_group_members_user_idx on public.feed_group_members (user_id);

create table if not exists public.feed_group_requests (
  group_id uuid not null references public.feed_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists feed_group_requests_user_idx on public.feed_group_requests (user_id);

-- Who an admin took out. They can ask again, never walk straight back in.
-- The app never reads it.
create table if not exists public.feed_group_removals (
  group_id uuid not null references public.feed_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.feed_groups enable row level security;
alter table public.feed_group_members enable row level security;
alter table public.feed_group_requests enable row level security;
alter table public.feed_group_removals enable row level security;

-- Every change goes through the functions below; the app only reads.
revoke all on public.feed_groups, public.feed_group_members, public.feed_group_requests, public.feed_group_removals from anon, authenticated;
grant select on public.feed_groups, public.feed_group_members, public.feed_group_requests to authenticated;

-- ============================================================ 2. helpers

-- The most groups one person can be in.
create or replace function public.feed_group_cap()
returns int language sql immutable as $$ select 3 $$;
revoke all on function public.feed_group_cap() from public, anon, authenticated;

-- Whether the person signed in is in a group. Read by the rules below (it
-- reads the members table directly, so a rule on that table can ask it).
create or replace function public.in_feed_group(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select g is not null and exists (select 1 from public.feed_group_members where group_id = g and user_id = auth.uid());
$$;
revoke all on function public.in_feed_group(uuid) from public;
-- anon too: the posts rule below names it, and Postgres checks the right to
-- call every function in a rule before the query runs, even on a branch
-- that never runs. Without this, every signed-out read of posts (and of
-- comments and likes, whose rules look at posts) fails. Signed out it
-- always answers false.
grant execute on function public.in_feed_group(uuid) to anon, authenticated;

create or replace function public.is_feed_group_admin(g uuid, who uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.feed_group_members where group_id = g and user_id = who and role = 'admin');
$$;
revoke all on function public.is_feed_group_admin(uuid, uuid) from public, anon;
-- Signed-in players need it for the requests rule below; it only answers yes or no.
grant execute on function public.is_feed_group_admin(uuid, uuid) to authenticated;

-- One person's group changes, one at a time (the cap of 3 stays 3).
create or replace function public.lock_feed_groups_of(who uuid)
returns void language sql volatile as $$
  select pg_advisory_xact_lock(hashtextextended('feed_groups:' || who::text, 67));
$$;
revoke all on function public.lock_feed_groups_of(uuid) from public, anon, authenticated;

create or replace function public.feed_group_count(who uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.feed_group_members where user_id = who;
$$;
revoke all on function public.feed_group_count(uuid) from public, anon, authenticated;

-- A name or description as typed, tidied: one line, no spaces at the ends.
create or replace function public.clean_group_text(t text, n int)
returns text language sql immutable as $$
  select nullif(btrim(left(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')), n)), '');
$$;
revoke all on function public.clean_group_text(text, int) from public, anon, authenticated;

-- ============================================================ 3. who reads what

-- A group: its members. Anyone else sees its name only through
-- feed_group_card (an invite link).
drop policy if exists "groups you are in" on public.feed_groups;
create policy "groups you are in" on public.feed_groups for select
  using (public.in_feed_group(id));

-- Members: the others in your groups, minus anyone you are blocked with.
drop policy if exists "people in your groups" on public.feed_group_members;
create policy "people in your groups" on public.feed_group_members for select
  using (user_id = auth.uid() or (public.in_feed_group(group_id) and not public.blocked_with(user_id)));

-- Requests: your own, and, for a group's admins, the ones to it.
drop policy if exists "your requests and your groups' requests" on public.feed_group_requests;
create policy "your requests and your groups' requests" on public.feed_group_requests for select
  using (user_id = auth.uid() or (public.is_feed_group_admin(group_id, auth.uid()) and not public.blocked_with(user_id)));

-- ============================================================ 4. posts in a group

alter table public.posts add column if not exists group_id uuid references public.feed_groups (id) on delete restrict;
create index if not exists posts_group_idx on public.posts (group_id, created_at desc) where group_id is not null;

-- Only a member can post to a group; the group a post is in never changes;
-- a group post carries no map court (no court alerts, no map counts). The
-- place in words stays.
create or replace function public.guard_post_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    raise exception 'group_fixed';
  end if;
  if tg_op = 'INSERT' and new.group_id is not null
     and not exists (select 1 from public.feed_group_members where group_id = new.group_id and user_id = new.author_id) then
    raise exception 'not_in_group';
  end if;
  if new.group_id is not null then
    new.court_id := null; new.court_name := null; new.court_lat := null; new.court_lng := null;
  end if;
  return new;
end $$;
revoke all on function public.guard_post_group() from public, anon, authenticated;
drop trigger if exists guard_post_group on public.posts;
create trigger guard_post_group before insert or update on public.posts
  for each row execute function public.guard_post_group();

-- Who can read a post (migration 62's rule), plus: a group post only for
-- its group's members and its author (and an admin, for a report). Comments
-- and likes follow the post (they are only read where the post can be).
drop policy if exists "read live posts" on public.posts;
create policy "read live posts" on public.posts for select
  using ((not archived or auth.uid() = author_id)
    and (case when group_id is null
           then (public.can_view(author_id) or auth.uid() = any(tagged_user_ids)
                 or (session->'with') @> jsonb_build_array(jsonb_build_object('id', auth.uid())))
           else (auth.uid() = author_id or public.in_feed_group(group_id) or public.is_admin())
         end)
    and not public.blocked_with(author_id)
    and (removed_at is null or public.is_admin()));

-- Tags on a group post alert only members; @mentions in one alert nobody
-- (the words would reach people who cannot open it).
create or replace function public.notify_post_tags()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tagged uuid;
  words text := coalesce(nullif(btrim(new.body), ''), 'a post');
  before_tags uuid[] := '{}';
  body_changed boolean := true;
begin
  -- The earlier version exists only on an edit; a new post has none to compare with.
  if tg_op = 'UPDATE' then
    before_tags := coalesce(old.tagged_user_ids, '{}');
    body_changed := new.body is distinct from old.body;
  end if;
  for tagged in select unnest(coalesce(new.tagged_user_ids, '{}')) except select unnest(before_tags) loop
    if new.group_id is null
       or exists (select 1 from public.feed_group_members m where m.group_id = new.group_id and m.user_id = tagged) then
      perform public.file_notification(tagged, new.author_id, 'tag', new.id::text, 'post', words);
    end if;
  end loop;
  if body_changed and new.group_id is null then
    perform public.file_mentions(new.body, new.author_id, new.id::text, 'post', null);
  end if;
  return new;
end $$;

-- A comment on a group post (migration 56's notify_comment otherwise): the
-- one answered is told only if they are still in the group, and @mentions
-- alert only members, since the comment's words would reach people who
-- cannot open the post. The post's author is always told.
create or replace function public.notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  grp uuid;
  replied_to uuid;
  wanted text;
  who uuid;
begin
  select author_id, group_id into owner, grp from public.posts where id = new.post_id;
  if new.parent_id is not null then
    select author_id into replied_to from public.comments where id = coalesce(new.reply_to_id, new.parent_id);
    if grp is null or replied_to = owner
       or exists (select 1 from public.feed_group_members m where m.group_id = grp and m.user_id = replied_to) then
      perform public.file_notification(replied_to, new.author_id, 'comment-reply', new.post_id::text, 'post', new.body, false);
    end if;
  end if;
  if owner is distinct from replied_to then
    perform public.file_notification(owner, new.author_id, 'comment', new.post_id::text, 'post', new.body, false);
  end if;
  if grp is null then
    perform public.file_mentions_except(new.body, new.author_id, new.post_id::text, 'post', array[owner, replied_to]);
  else
    for wanted in
      select distinct lower(r.parts[1]) from regexp_matches(coalesce(new.body, ''), '@([A-Za-z0-9_]{2,24})', 'g') as r(parts)
    loop
      who := null;
      select id into who from public.profiles where handle = wanted;
      if who is not null and who <> new.author_id and who is distinct from owner and who is distinct from replied_to
         and exists (select 1 from public.feed_group_members m where m.group_id = grp and m.user_id = who) then
        perform public.file_notification(who, new.author_id, 'tag', new.post_id::text, 'post', new.body);
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.notify_comment() from public, anon, authenticated;
drop trigger if exists notify_comment on public.comments;
create trigger notify_comment after insert on public.comments for each row execute function public.notify_comment();

-- ============================================================ 5. keeping an admin

-- Whoever leaves, is removed or deletes their account: if the group has
-- people but no admin, the one in it longest becomes admin.
create or replace function public.feed_group_keep_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.feed_group_members where group_id = old.group_id and role = 'admin') then
    update public.feed_group_members set role = 'admin'
      where (group_id, user_id) = (
        select group_id, user_id from public.feed_group_members
        where group_id = old.group_id order by joined_at, user_id limit 1);
  end if;
  return null;
end $$;
revoke all on function public.feed_group_keep_admin() from public, anon, authenticated;
drop trigger if exists feed_group_keep_admin on public.feed_group_members;
create trigger feed_group_keep_admin after delete on public.feed_group_members
  for each row execute function public.feed_group_keep_admin();

-- ============================================================ 6. what the app calls

-- Start a group. Returns its id.
create or replace function public.create_feed_group(p_name text, p_description text default null, p_ask boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_name text := public.clean_group_text(p_name, 40);
  v_id uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if v_name is null then raise exception 'name_needed'; end if;
  perform public.lock_feed_groups_of(me);
  if public.feed_group_count(me) >= public.feed_group_cap() then raise exception 'group_limit'; end if;
  if (select count(*) from public.feed_groups where created_by = me and created_at > now() - interval '1 day') >= 5 then
    raise exception 'slow_down';
  end if;
  insert into public.feed_groups (name, description, ask_to_join, created_by)
    values (v_name, public.clean_group_text(p_description, 140), coalesce(p_ask, false), me)
    returning id into v_id;
  insert into public.feed_group_members (group_id, user_id, role) values (v_id, me, 'admin');
  return v_id;
end $$;

-- What an invite link shows before you are in: the name, the description,
-- how many are in it, whether it asks first, and where you stand. Null for
-- a group that does not exist.
create or replace function public.feed_group_card(g uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  grp public.feed_groups;
begin
  if me is null then return null; end if;
  select * into grp from public.feed_groups where id = g;
  if grp.id is null then return null; end if;
  return jsonb_build_object(
    'id', grp.id,
    'name', grp.name,
    'description', grp.description,
    'ask', grp.ask_to_join,
    'members', (select count(*) from public.feed_group_members where group_id = g),
    'member', exists (select 1 from public.feed_group_members where group_id = g and user_id = me),
    'requested', exists (select 1 from public.feed_group_requests where group_id = g and user_id = me),
    'createdAt', grp.created_at);
end $$;

-- Join (an open group) or ask to (an ask-first group, or one an admin took
-- you out of). Returns 'joined', 'requested' or 'already'.
create or replace function public.join_feed_group(g uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  grp public.feed_groups;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into grp from public.feed_groups where id = g;
  if grp.id is null then raise exception 'not_found'; end if;
  perform public.lock_feed_groups_of(me);
  if exists (select 1 from public.feed_group_members where group_id = g and user_id = me) then return 'already'; end if;
  if public.feed_group_count(me) >= public.feed_group_cap() then raise exception 'group_limit'; end if;
  if grp.ask_to_join or exists (select 1 from public.feed_group_removals where group_id = g and user_id = me) then
    if not exists (select 1 from public.feed_group_requests where group_id = g and user_id = me)
       and (select count(*) from public.feed_group_requests where user_id = me) >= 10 then
      raise exception 'slow_down';
    end if;
    insert into public.feed_group_requests (group_id, user_id) values (g, me) on conflict do nothing;
    return 'requested';
  end if;
  insert into public.feed_group_members (group_id, user_id) values (g, me);
  delete from public.feed_group_requests where group_id = g and user_id = me;
  return 'joined';
end $$;

-- Leave a group, or take back a request to join it.
create or replace function public.leave_feed_group(g uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  delete from public.feed_group_requests where group_id = g and user_id = me;
  delete from public.feed_group_members where group_id = g and user_id = me;
end $$;

-- An admin says yes or no to someone asking to join.
create or replace function public.answer_feed_group_request(g uuid, who uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.is_feed_group_admin(g, me) then raise exception 'not_admin'; end if;
  if not exists (select 1 from public.feed_group_requests where group_id = g and user_id = who) then return; end if;
  if not coalesce(accept, false) then
    delete from public.feed_group_requests where group_id = g and user_id = who;
    return;
  end if;
  perform public.lock_feed_groups_of(who);
  if public.feed_group_count(who) >= public.feed_group_cap() then raise exception 'their_limit'; end if;
  insert into public.feed_group_members (group_id, user_id) values (g, who) on conflict do nothing;
  delete from public.feed_group_requests where group_id = g and user_id = who;
  delete from public.feed_group_removals where group_id = g and user_id = who;
end $$;

-- An admin takes someone out (not themselves: that is leaving).
create or replace function public.remove_feed_group_member(g uuid, who uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.is_feed_group_admin(g, me) then raise exception 'not_admin'; end if;
  if who = me then raise exception 'not_admin'; end if;
  delete from public.feed_group_members where group_id = g and user_id = who;
  insert into public.feed_group_removals (group_id, user_id) values (g, who)
    on conflict (group_id, user_id) do update set removed_at = now();
end $$;

-- An admin changes the name, the description, or open / ask first.
create or replace function public.update_feed_group(g uuid, p_name text, p_description text, p_ask boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_name text := public.clean_group_text(p_name, 40);
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.is_feed_group_admin(g, me) then raise exception 'not_admin'; end if;
  if v_name is null then raise exception 'name_needed'; end if;
  update public.feed_groups
    set name = v_name, description = public.clean_group_text(p_description, 140), ask_to_join = coalesce(p_ask, ask_to_join)
    where id = g;
end $$;

-- Everything the app needs about your groups in one go: each group you are
-- in with its members (minus anyone you are blocked with), the requests to
-- it if you are an admin, and the groups you have asked to join.
create or replace function public.my_feed_groups()
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id)
  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'description', g.description, 'ask', g.ask_to_join,
        'createdAt', g.created_at, 'joinedAt', mine.joined_at,
        'members', (select coalesce(jsonb_agg(jsonb_build_object('id', m.user_id, 'admin', m.role = 'admin') order by m.joined_at), '[]'::jsonb)
                    from public.feed_group_members m
                    where m.group_id = g.id and (m.user_id = me.id or not public.blocked_with(m.user_id))),
        'requests', case when mine.role = 'admin' then (
                      select coalesce(jsonb_agg(r.user_id order by r.created_at), '[]'::jsonb)
                      from public.feed_group_requests r
                      where r.group_id = g.id and not public.blocked_with(r.user_id))
                    else '[]'::jsonb end
      ) order by mine.joined_at)
      from public.feed_group_members mine join public.feed_groups g on g.id = mine.group_id
      where mine.user_id = me.id), '[]'::jsonb),
    'asked', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by r.created_at)
      from public.feed_group_requests r join public.feed_groups g on g.id = r.group_id
      where r.user_id = me.id), '[]'::jsonb))
  from me where me.id is not null;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_feed_group(text, text, boolean)', 'feed_group_card(uuid)', 'join_feed_group(uuid)',
    'leave_feed_group(uuid)', 'answer_feed_group_request(uuid, uuid, boolean)',
    'remove_feed_group_member(uuid, uuid)', 'update_feed_group(uuid, text, text, boolean)', 'my_feed_groups()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
