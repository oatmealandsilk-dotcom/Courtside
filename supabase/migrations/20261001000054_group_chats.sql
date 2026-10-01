-- 54: group chats, done properly.
--
-- Migration 42 gave us basic groups (a name, up to 16 people, add, leave,
-- rename). This finishes them, the way Instagram and WhatsApp work:
--
--   * Admins. Whoever starts a group is its admin. Anyone in it can add
--     people, rename it or change its photo; only admins can remove someone
--     or make someone else an admin. When the last admin leaves, the person
--     who has been in the group longest takes over.
--   * Event lines in the chat: "Alex created the group", "Alex added Dev and
--     June", "Alex removed Dev", "Mira left", "Alex named the group …",
--     "Alex changed the group photo", "Alex made Dev an admin", "Dev is in
--     for the hit". They are messages of kind 'system' that only the server
--     can write, and nobody can edit, unsend or react to them.
--   * A group photo (from our own media bucket only).
--   * Mute, per chat and only for you (1:1 chats too). A muted chat sends no
--     alerts, except when someone @mentions you. Nobody can see you muted it.
--   * A "Message alerts" switch in Settings (user_state.push_messages).
--   * Alerts that name the group: "Mira in Saturday hitters", or, for a
--     group with no name, the people's names with "Mira: …" as the text.
--     Someone who is added hears "Alex added you to Saturday hitters".
--   * Reactions that cannot overwrite each other: each person only ever
--     changes their own reaction, even from older app builds.
--   * Someone an admin removes stays out: they cannot put themselves back by
--     tapping "I'm in" on the hit the chat is for. Anyone in the group can
--     still add them back.
--   * A reported group can be read by an admin (its last 30 messages), so a
--     report of a group chat can be acted on.
--   * A rename or a new photo reaches everyone's screen with its event line
--     (the app already hears new messages live, and an event line makes it
--     fetch the group again), so the conversations table itself is not
--     streamed.
--
-- Owner decisions (October 1):
--   * A group holds up to 16 people (group_cap below is the one place it lives).
--   * Blocking inside a group works like Instagram: both people stay and can
--     still write there (the app folds the blocked person's messages away for
--     the one who blocked). A one-to-one chat stays locked by a block. Nobody
--     can be added to a group with someone they are blocked with, either way.
--   * Teens follow the same rule as a one-to-one chat: anyone not known to be
--     an adult can only be added by someone they follow.
--
-- Also fixed: a two-person group (a hit chat, or a group down to two) was
-- being mistaken for the one-to-one chat between those two people.
--
-- Errors the app can rely on, word for word: 'blocked', 'teen_closed',
-- 'group_full', 'not_admin', 'not in this group', 'removed' (join_hit: an
-- admin took you out of that hit's chat).
--
-- Needs migrations 06, 08, 12, 13, 14, 16, 18, 21, 23, 36, 42, 43 and 44. Run 53
-- first if it is not live yet (they go in number order), then this one.
-- Safe to run more than once. Nothing here deletes anyone's messages.

-- ============================================================ 1. new columns

-- Whether an address is one file in our own public media bucket, inside the
-- folder of `owner` (null: inside anyone's folder). Its start is fixed to
-- this project's own two addresses: auth.courtsidebase.com (the address the
-- app talks to, so the one its uploads come back with) and the project's
-- supabase.co address. After the folder comes one plain file name and
-- nothing more: no ?, no #, no %, no "..", no further folder. That way
-- nobody can plant an image from another site (which would tell that site
-- who opened the chat, and when) in everyone's chat. Anyone may call it: it
-- only answers yes or no.
create or replace function public.is_own_media_url(url text, owner uuid)
returns boolean language sql immutable as $$
  select coalesce(
    char_length(url) <= 600
      and url ~ '^https://(auth\.courtsidebase\.com|cgitvbnvchmofqkhtlml\.supabase\.co)/storage/v1/object/public/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_+-][A-Za-z0-9._+-]*$'
      and position('..' in url) = 0
      and (owner is null or split_part(url, '/', 9) = owner::text),
    false);
$$;

-- A group photo: only a file in our own media bucket (see just above).
-- The rule is put on afresh each run (an earlier draft of this file had a
-- looser one). A photo already set that it would refuse, which only that
-- draft could have let in, is taken off first.
alter table public.conversations add column if not exists photo_url text;
alter table public.conversations drop constraint if exists conversations_photo_url_check;
alter table public.conversations drop constraint if exists conversations_photo_url_own_media;
update public.conversations set photo_url = null
  where photo_url is not null and not public.is_own_media_url(photo_url, null);
alter table public.conversations add constraint conversations_photo_url_own_media
  check (photo_url is null or public.is_own_media_url(photo_url, null));

-- Each member's place in a group: admin or member, when they joined, and who
-- added them. The first run also fills these in for the groups already there:
-- whoever started a group becomes its admin, and everyone counts as having
-- joined when the group was made (or, in a hit chat, when they said "I'm in").
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'conversation_members' and column_name = 'role') then
    alter table public.conversation_members add column role text not null default 'member' check (role in ('admin', 'member'));
    update public.conversation_members m set role = 'admin'
      from public.conversations c
      where c.id = m.conversation_id and c.is_group and c.created_by = m.user_id;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'conversation_members' and column_name = 'joined_at') then
    alter table public.conversation_members add column joined_at timestamptz not null default now();
    update public.conversation_members m
      set joined_at = coalesce(
        (select j.created_at from public.hit_joins j join public.hit_requests h on h.id = j.hit_id
          where h.conversation_id = m.conversation_id and j.user_id = m.user_id
          order by j.created_at limit 1),
        c.created_at)
      from public.conversations c
      where c.id = m.conversation_id;
  end if;
end $$;
alter table public.conversation_members add column if not exists added_by uuid references public.profiles (id) on delete set null;
create index if not exists conversation_members_joined_idx on public.conversation_members (conversation_id, joined_at);

-- What an event line is about, for the app to word in its own way ("You
-- added Dev"). Shape: {"type": "created|added|removed|left|renamed|photo|
-- admin|joined", "targets": [ids], "title": text, "on": true/false}.
alter table public.messages add column if not exists event jsonb
  check (event is null or (jsonb_typeof(event) = 'object' and pg_column_size(event) < 2000));

-- The "Message alerts" switch in Settings. On unless someone turns it off.
alter table public.user_state add column if not exists push_messages boolean not null default true;

-- Your own settings for a chat (for now: muted until when). A table of its
-- own, not a column on conversation_members, because everyone in a chat can
-- read conversation_members: a column there would tell them you muted them.
-- You can read your own rows; changes only go through set_chat_mute below.
create table if not exists public.conversation_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  muted_until timestamptz,
  primary key (user_id, conversation_id)
);
alter table public.conversation_prefs enable row level security;
drop policy if exists "your chat settings" on public.conversation_prefs;
create policy "your chat settings" on public.conversation_prefs for select using (user_id = auth.uid());
revoke all on public.conversation_prefs from anon;
revoke insert, update, delete on public.conversation_prefs from authenticated;
grant select on public.conversation_prefs to authenticated;

-- Who an admin took out of which group, and when. join_hit reads it, so a
-- removed person cannot put themselves back into a hit's chat by tapping
-- "I'm in" again; add_group_members clears it when someone in the group
-- adds them back. The app never reads or writes it (no rule lets it).
create table if not exists public.conversation_removals (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.conversation_removals enable row level security;
revoke all on public.conversation_removals from anon, authenticated;

-- ============================================================ 2. internal helpers
-- None of these can be called from the app; only the functions below use them.

-- The most people a group can hold, you included. The one place it lives
-- (the app keeps the same number as GROUP_CAP).
create or replace function public.group_cap()
returns int language sql immutable as $$ select 16 $$;
revoke all on function public.group_cap() from public, anon, authenticated;

-- A group name as typed, tidied: one line, no spaces at the ends, at most 60
-- characters (cut rather than refused). Empty means "no name".
create or replace function public.clean_chat_title(t text)
returns text language sql immutable as $$
  select nullif(btrim(left(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')), 60)), '');
$$;
revoke all on function public.clean_chat_title(text) from public, anon, authenticated;

-- Whether some people can join a group. Null when they can; otherwise the
-- reason, never naming anyone:
--   'blocked'     a newcomer and someone already there (or another newcomer)
--                 are blocked, either way;
--   'teen_closed' a newcomer not known to be an adult does not follow the
--                 person adding them (the same rule as starting a 1:1 chat).
create or replace function public.group_fits(adder uuid, members uuid[], newcomers uuid[])
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if exists (
    select 1 from unnest(coalesce(newcomers, '{}')) n, unnest(coalesce(members, '{}') || coalesce(newcomers, '{}')) m
    where m <> n and public.is_blocked_between(n, m)
  ) then
    return 'blocked';
  end if;
  if exists (
    select 1 from unnest(coalesce(newcomers, '{}')) n
    join public.profiles p on p.id = n
    where n <> adder and p.age_group is distinct from 'adult'
      and not exists (select 1 from public.follows f where f.follower_id = n and f.following_id = adder)
  ) then
    return 'teen_closed';
  end if;
  return null;
end $$;
revoke all on function public.group_fits(uuid, uuid[], uuid[]) from public, anon, authenticated;

-- First names in a sentence: "Dev", "Dev and June", "Dev, June and Mira",
-- "Dev, June and 3 others".
create or replace function public.chat_first_names(ids uuid[])
returns text language plpgsql stable security definer set search_path = public as $$
declare
  firsts text[];
  n int;
begin
  select coalesce(array_agg(coalesce(nullif(split_part(btrim(p.name), ' ', 1), ''), p.handle) order by t.ord), '{}')
    into firsts
    from unnest(coalesce(ids, '{}')) with ordinality as t(id, ord)
    join public.profiles p on p.id = t.id;
  n := coalesce(array_length(firsts, 1), 0);
  if n = 0 then return 'someone'; end if;
  if n = 1 then return firsts[1]; end if;
  if n <= 3 then return array_to_string(firsts[1:n - 1], ', ') || ' and ' || firsts[n]; end if;
  return firsts[1] || ', ' || firsts[2] || ' and ' || (n - 2) || ' others';
end $$;
revoke all on function public.chat_first_names(uuid[]) from public, anon, authenticated;

-- A group's name as one person sees it: the name it was given, or the first
-- names of the others in it ("Mira, Dev & June", "Mira, Dev + 3"). The same
-- rule as groupName in src/features/messages/groups.tsx.
create or replace function public.group_label(conv uuid, viewer uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  named text;
  firsts text[];
  n int;
begin
  select nullif(btrim(c.title), '') into named from public.conversations c where c.id = conv;
  if named is not null then return named; end if;
  select coalesce(array_agg(coalesce(nullif(split_part(btrim(p.name), ' ', 1), ''), p.handle) order by m.joined_at, m.user_id), '{}')
    into firsts
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
    where m.conversation_id = conv and m.user_id is distinct from viewer;
  n := coalesce(array_length(firsts, 1), 0);
  if n = 0 then return 'Group'; end if;
  if n = 1 then return firsts[1]; end if;
  if n <= 3 then return array_to_string(firsts[1:n - 1], ', ') || ' & ' || firsts[n]; end if;
  return firsts[1] || ', ' || firsts[2] || ' + ' || (n - 2);
end $$;
revoke all on function public.group_label(uuid, uuid) from public, anon, authenticated;

-- Whether someone is an admin of a group.
create or replace function public.is_group_admin(conv uuid, who uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members
                 where conversation_id = conv and user_id = who and role = 'admin');
$$;
revoke all on function public.is_group_admin(uuid, uuid) from public, anon, authenticated;

-- A group always has an admin. With none left, the person who has been in
-- it longest takes over (WhatsApp's rule).
create or replace function public.ensure_group_admin(conv uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.conversation_members where conversation_id = conv and role = 'admin') then
    return;
  end if;
  update public.conversation_members set role = 'admin'
    where conversation_id = conv
      and user_id = (select m.user_id from public.conversation_members m
                     where m.conversation_id = conv order by m.joined_at, m.user_id limit 1);
end $$;
revoke all on function public.ensure_group_admin(uuid) from public, anon, authenticated;

-- Writes one event line into a group, sent by the person who acted. The
-- words are a plain sentence made from names at this moment, which is what
-- older app builds show; newer builds word it from `event` instead ("You
-- added Dev"). Only this function can write kind 'system' (see the guard in
-- section 4), the same switch-on, write, switch-off pattern join_hit uses.
create or replace function public.post_group_event(
  conv uuid, actor uuid, what text, targets uuid[] default '{}', label_text text default null, flag boolean default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  target_names text;
  sentence text;
  made uuid;
begin
  actor_name := coalesce((select coalesce(nullif(split_part(btrim(p.name), ' ', 1), ''), p.handle) from public.profiles p where p.id = actor), 'Someone');
  target_names := public.chat_first_names(targets);
  sentence := case what
    when 'created' then actor_name || ' created the group' || coalesce(' "' || label_text || '"', '')
    when 'added'   then actor_name || ' added ' || target_names
    when 'removed' then actor_name || ' removed ' || target_names
    when 'left'    then actor_name || ' left'
    when 'renamed' then case when label_text is null then actor_name || ' removed the group name'
                             else actor_name || ' named the group "' || label_text || '"' end
    when 'photo'   then case when flag then actor_name || ' changed the group photo'
                             else actor_name || ' removed the group photo' end
    when 'admin'   then case when flag then actor_name || ' made ' || target_names || ' an admin'
                             else actor_name || ' removed ' || target_names || ' as an admin' end
    when 'joined'  then actor_name || ' is in for the hit'
    else actor_name || ' changed the group' end;
  perform set_config('courtside.group_event', 'on', true);
  insert into public.messages (conversation_id, sender_id, body, kind, event)
    values (conv, actor, left(sentence, 4000), 'system',
            jsonb_strip_nulls(jsonb_build_object('type', what, 'targets', to_jsonb(coalesce(targets, '{}')), 'title', label_text, 'on', flag)))
    returning id into made;
  perform set_config('courtside.group_event', 'off', true);
  return made;
end $$;
revoke all on function public.post_group_event(uuid, uuid, text, uuid[], text, boolean) from public, anon, authenticated;

-- ============================================================ 3. what the app calls

-- Start a group with the people picked (2 to 15 others, so 3 to 16 people).
-- `wanted` is the id the app already shows, so a retry after a slow first try
-- returns the same group instead of making a second one. Each person put in
-- it hears "Alex added you to …", the same alert as add_group_members (the
-- "created" line is an event line, which sends no alert of its own).
create or replace function public.create_group(group_title text, member_ids uuid[], wanted uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  others uuid[];
  fits text;
  cleaned text := public.clean_chat_title(group_title);
  made uuid;
  my_name text;
  n uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if wanted is not null and exists (
    select 1 from public.conversations c join public.conversation_members m on m.conversation_id = c.id
    where c.id = wanted and c.is_group and m.user_id = me
  ) then
    return wanted;
  end if;
  if wanted is not null and exists (select 1 from public.conversations where id = wanted) then
    raise exception 'that chat id is taken';
  end if;
  select coalesce(array_agg(distinct x), '{}') into others
    from unnest(coalesce(member_ids, '{}')) x where x is not null and x <> me;
  if cardinality(others) < 2 then raise exception 'a group needs at least two other people'; end if;
  if cardinality(others) > public.group_cap() - 1 then raise exception 'group_full'; end if;
  if exists (select 1 from unnest(others) x where not exists (select 1 from public.profiles p where p.id = x)) then
    raise exception 'unknown player';
  end if;
  fits := public.group_fits(me, array[me], others);
  if fits is not null then raise exception '%', fits; end if;
  insert into public.conversations (id, title, is_group, created_by)
    values (coalesce(wanted, gen_random_uuid()), cleaned, true, me)
    returning id into made;
  insert into public.conversation_members (conversation_id, user_id, role, added_by) values (made, me, 'admin', null);
  insert into public.conversation_members (conversation_id, user_id, role, added_by)
    select made, x, 'member', me from unnest(others) x;
  perform public.post_group_event(made, me, 'created', '{}', cleaned);
  my_name := coalesce((select coalesce(nullif(p.name, ''), p.handle) from public.profiles p where p.id = me), 'Someone');
  foreach n in array others loop
    if coalesce((select s.push_messages from public.user_state s where s.user_id = n), true) then
      perform public.send_push(n, my_name || ' added you to ' || public.group_label(made, n), null, '/messages/' || made);
    end if;
  end loop;
  return made;
end $$;
revoke all on function public.create_group(text, uuid[], uuid) from public, anon;
grant execute on function public.create_group(text, uuid[], uuid) to authenticated;

-- Add people to a group you are in. Returns who was actually added (anyone
-- already in it is skipped). Each person added gets an alert.
create or replace function public.add_group_members(conv uuid, member_ids uuid[])
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  present uuid[];
  newcomers uuid[];
  fits text;
  my_name text;
  n uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  -- Hold the group still while it is counted, so two people adding at the
  -- same moment cannot both squeeze past the cap.
  perform 1 from public.conversations where id = conv and is_group for update;
  if not found or not exists (select 1 from public.conversation_members where conversation_id = conv and user_id = me) then
    raise exception 'not in this group';
  end if;
  select coalesce(array_agg(user_id), '{}') into present from public.conversation_members where conversation_id = conv;
  select coalesce(array_agg(distinct x), '{}') into newcomers
    from unnest(coalesce(member_ids, '{}')) x where x is not null and not (x = any (present));
  if cardinality(newcomers) = 0 then return newcomers; end if;
  if cardinality(present) + cardinality(newcomers) > public.group_cap() then raise exception 'group_full'; end if;
  if exists (select 1 from unnest(newcomers) x where not exists (select 1 from public.profiles p where p.id = x)) then
    raise exception 'unknown player';
  end if;
  fits := public.group_fits(me, present, newcomers);
  if fits is not null then raise exception '%', fits; end if;
  insert into public.conversation_members (conversation_id, user_id, role, added_by)
    select conv, x, 'member', me from unnest(newcomers) x
    on conflict do nothing;
  -- Someone an admin had taken out is welcome again: someone in the group chose to add them back.
  delete from public.conversation_removals where conversation_id = conv and user_id = any (newcomers);
  perform public.post_group_event(conv, me, 'added', newcomers);
  -- "Alex added you to Saturday hitters": straight to their phone, the way
  -- Instagram keeps chat events out of the Activity list.
  my_name := coalesce((select coalesce(nullif(p.name, ''), p.handle) from public.profiles p where p.id = me), 'Someone');
  foreach n in array newcomers loop
    if coalesce((select s.push_messages from public.user_state s where s.user_id = n), true) then
      perform public.send_push(n, my_name || ' added you to ' || public.group_label(conv, n), null, '/messages/' || conv);
    end if;
  end loop;
  return newcomers;
end $$;
revoke all on function public.add_group_members(uuid, uuid[]) from public, anon;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;

-- An admin takes someone out of a group. (Leaving yourself is leave_group.)
-- The line goes in first, so it stays in the history everyone else sees.
-- A hit chat's "I'm in" goes with them, and the removal is written down so
-- they cannot tap "I'm in" again to come straight back (see join_hit).
create or replace function public.remove_group_member(conv uuid, member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  perform 1 from public.conversations where id = conv and is_group for update;
  if not found or not exists (select 1 from public.conversation_members where conversation_id = conv and user_id = me) then
    raise exception 'not in this group';
  end if;
  if not public.is_group_admin(conv, me) then raise exception 'not_admin'; end if;
  if member is null or member = me then raise exception 'leave the group instead'; end if;
  -- Already out (a second tap, or a retry): nothing to do.
  if not exists (select 1 from public.conversation_members where conversation_id = conv and user_id = member) then return; end if;
  perform public.post_group_event(conv, me, 'removed', array[member]);
  delete from public.conversation_members where conversation_id = conv and user_id = member;
  delete from public.conversation_prefs where conversation_id = conv and user_id = member;
  delete from public.hit_joins j using public.hit_requests h
    where h.conversation_id = conv and j.hit_id = h.id and j.user_id = member;
  insert into public.conversation_removals (conversation_id, user_id) values (conv, member)
    on conflict (conversation_id, user_id) do update set removed_at = now();
  perform public.ensure_group_admin(conv);
end $$;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

-- Leaving a group (same name and inputs as migration 42, which the app
-- already calls). Everyone sees "Mira left". In a hit chat, leaving the chat
-- also takes back your "I'm in", so the two never disagree. When the last
-- person leaves, the group is deleted; when the last admin leaves, the
-- longest-standing member takes over. A 1:1 chat cannot be left.
create or replace function public.leave_group(conv uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  grp boolean;
begin
  if me is null then raise exception 'not signed in'; end if;
  select c.is_group into grp from public.conversations c where c.id = conv for update;
  -- Already gone, or already left (a retry): nothing to do.
  if not found then return; end if;
  if not exists (select 1 from public.conversation_members where conversation_id = conv and user_id = me) then return; end if;
  if not grp then raise exception 'not in this group'; end if;
  -- The "left" line is skipped rather than keeping someone in a group they
  -- want out of (a suspended account cannot write it, nor can someone over
  -- the 30-messages-a-minute limit).
  begin
    perform public.post_group_event(conv, me, 'left');
  exception when others then
    null;
  end;
  delete from public.conversation_members where conversation_id = conv and user_id = me;
  delete from public.conversation_prefs where conversation_id = conv and user_id = me;
  delete from public.hit_joins j using public.hit_requests h
    where h.conversation_id = conv and j.hit_id = h.id and j.user_id = me;
  if not exists (select 1 from public.conversation_members where conversation_id = conv) then
    -- Deleting the chat clears hit_requests.conversation_id, which the hit
    -- guard (migration 43) only lets the server change.
    perform set_config('courtside.hit_system', 'on', true);
    delete from public.conversations where id = conv;
    perform set_config('courtside.hit_system', 'off', true);
  else
    perform public.ensure_group_admin(conv);
  end if;
end $$;
revoke all on function public.leave_group(uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;

-- Renaming a group (same name and inputs as migration 42). Anyone in it can.
-- Too long is cut to 60 characters rather than refused; an empty name
-- removes the name. Renaming a 1:1 chat is refused instead of quietly
-- doing nothing.
create or replace function public.rename_group(conv uuid, new_title text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cleaned text := public.clean_chat_title(new_title);
  before_title text;
begin
  select c.title into before_title from public.conversations c
    where c.id = conv and c.is_group
      and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = me)
    for update of c;
  if not found then raise exception 'not in this group'; end if;
  if before_title is not distinct from cleaned then return; end if;
  update public.conversations set title = cleaned where id = conv;
  perform public.post_group_event(conv, me, 'renamed', '{}', cleaned);
end $$;
revoke all on function public.rename_group(uuid, text) from public, anon;
grant execute on function public.rename_group(uuid, text) to authenticated;

-- A group's photo. Anyone in it can change it; null removes it. Only a photo
-- you uploaded yourself to our media bucket: an address that starts with
-- this project's own media address and your own folder in it, with nothing
-- after the file name (is_own_media_url, section 1).
create or replace function public.set_group_photo(conv uuid, photo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cleaned text := nullif(btrim(coalesce(photo, '')), '');
  before_photo text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select c.photo_url into before_photo from public.conversations c
    where c.id = conv and c.is_group
      and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = me)
    for update of c;
  if not found then raise exception 'not in this group'; end if;
  if cleaned is not null and not public.is_own_media_url(cleaned, me) then
    raise exception 'bad photo';
  end if;
  if before_photo is not distinct from cleaned then return; end if;
  update public.conversations set photo_url = cleaned where id = conv;
  perform public.post_group_event(conv, me, 'photo', '{}', null, cleaned is not null);
end $$;
revoke all on function public.set_group_photo(uuid, text) from public, anon;
grant execute on function public.set_group_photo(uuid, text) to authenticated;

-- An admin makes someone an admin (make = true) or takes it away (false).
-- The last admin cannot step down (the call does nothing): they can leave,
-- and the longest-standing member takes over.
create or replace function public.set_group_admin(conv uuid, member uuid, make boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wanted_role text := case when make then 'admin' else 'member' end;
  now_role text;
begin
  if me is null then raise exception 'not signed in'; end if;
  perform 1 from public.conversations where id = conv and is_group for update;
  if not found or not exists (select 1 from public.conversation_members where conversation_id = conv and user_id = me) then
    raise exception 'not in this group';
  end if;
  if not public.is_group_admin(conv, me) then raise exception 'not_admin'; end if;
  select m.role into now_role from public.conversation_members m where m.conversation_id = conv and m.user_id = member;
  if not found then raise exception 'not a member'; end if;
  if now_role = wanted_role then return; end if;
  if wanted_role = 'member' and not exists (
    select 1 from public.conversation_members
    where conversation_id = conv and role = 'admin' and user_id <> member
  ) then
    return;
  end if;
  update public.conversation_members set role = wanted_role where conversation_id = conv and user_id = member;
  perform public.post_group_event(conv, me, 'admin', array[member], null, wanted_role = 'admin');
end $$;
revoke all on function public.set_group_admin(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_group_admin(uuid, uuid, boolean) to authenticated;

-- Mute a chat you are in, group or 1:1, until a moment; null (or a moment
-- already past) unmutes. The app sends 9999-12-31 for "until I turn it back on".
create or replace function public.set_chat_mute(conv uuid, until timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_member(conv) then raise exception 'not in this chat'; end if;
  insert into public.conversation_prefs (user_id, conversation_id, muted_until)
    values (me, conv, case when until > now() then until end)
    on conflict (user_id, conversation_id) do update set muted_until = excluded.muted_until;
end $$;
revoke all on function public.set_chat_mute(uuid, timestamptz) from public, anon;
grant execute on function public.set_chat_mute(uuid, timestamptz) to authenticated;

-- React to a message, or take your reaction back by sending the same one
-- again. Only your own reaction ever changes, so two people reacting at the
-- same moment both stick. Returns everyone's reactions as they now stand.
create or replace function public.toggle_reaction(msg uuid, emoji text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m public.messages;
  mark text := btrim(coalesce(emoji, ''));
  next_map jsonb;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into m from public.messages where id = msg for update;
  if not found or not public.is_member(m.conversation_id) then raise exception 'not in this chat'; end if;
  if m.kind = 'system' then raise exception 'event lines take no reactions'; end if;
  if char_length(mark) not between 1 and 16 then raise exception 'bad reaction'; end if;
  next_map := coalesce(m.reactions, '{}'::jsonb);
  if next_map ->> me::text = mark then
    next_map := next_map - me::text;
  else
    next_map := next_map || jsonb_build_object(me::text, mark);
  end if;
  update public.messages set reactions = next_map where id = msg;
  return next_map;
end $$;
revoke all on function public.toggle_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;

-- Opening a 1:1 chat (same name and inputs as before; latest was migration
-- 36). The only change: a group never counts as the 1:1 chat, even one with
-- just the two of you in it (a fresh hit chat, or a group down to two).
create or replace function public.open_conversation(other uuid, wanted uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  found_id uuid;
begin
  if me is null or other is null or other = me then raise exception 'bad participants'; end if;
  select cm.conversation_id into found_id
    from public.conversation_members cm
    join public.conversation_members o on o.conversation_id = cm.conversation_id and o.user_id = other
    where cm.user_id = me
      and (select count(*) from public.conversation_members x where x.conversation_id = cm.conversation_id) = 2
      and not exists (select 1 from public.conversations c where c.id = cm.conversation_id and c.is_group)
    limit 1;
  if found_id is not null then return found_id; end if;
  if public.is_blocked_between(me, other) then
    raise exception 'blocked';
  end if;
  -- Anyone not known to be an adult gets the teen protection: they must follow you first.
  if exists (select 1 from public.profiles where id = other and age_group is distinct from 'adult')
     and not exists (select 1 from public.follows where follower_id = other and following_id = me) then
    raise exception 'teen_closed';
  end if;
  insert into public.conversations (id) values (coalesce(wanted, gen_random_uuid())) returning id into found_id;
  insert into public.conversation_members (conversation_id, user_id) values (found_id, me), (found_id, other);
  return found_id;
end $$;
grant execute on function public.open_conversation(uuid, uuid) to authenticated;

-- Whether a chat is locked by a block (same name and inputs as migration 21).
-- Now only a 1:1 chat locks: in a group, both people stay and can still
-- write (Instagram's way). The "members send as themselves" rule on messages
-- uses this, so it follows along with no change of its own.
create or replace function public.chat_is_blocked(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((select c.is_group from public.conversations c where c.id = conv), false)
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = conv and m.user_id <> auth.uid() and public.is_blocked_between(auth.uid(), m.user_id));
$$;
grant execute on function public.chat_is_blocked(uuid) to authenticated;

-- "I'm in" on a hit (same name and inputs as migration 43). Changes:
--   * the hit is held still while it is counted, so two last-second joins
--     cannot both take the final spot;
--   * once the chat exists, it is refused when the chat is full, and when
--     you are blocked with anyone already in it, not just the poster;
--   * someone an admin removed from the chat is refused ('removed') until
--     someone in it adds them back;
--   * the poster is the chat's admin;
--   * everyone in the chat sees "Dev is in for the hit" (skipped, never
--     blocking the join, if that line cannot be written).
-- The teen rule for hits (the poster and the player follow each other) is
-- unchanged, as are the two courtside.hit_system lines the hit guard needs.
create or replace function public.join_hit(hit uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  h public.hit_requests;
  taken int;
  conv uuid;
  label text;
  in_chat uuid[];
  fits text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into h from public.hit_requests where id = hit for update;
  if not found or h.cancelled then raise exception 'That hit is no longer on.'; end if;
  if h.author_id = me then raise exception 'That is your own hit.'; end if;
  if h.starts_at < now() - interval '1 hour' then raise exception 'That hit has already happened.'; end if;
  if public.is_blocked_between(me, h.author_id) then raise exception 'blocked'; end if;
  -- Teen protection, as in chats: a player not known to be an adult only plays with people who follow each other.
  if (exists (select 1 from public.profiles where id in (me, h.author_id) and age_group is distinct from 'adult'))
     and not (exists (select 1 from public.follows where follower_id = me and following_id = h.author_id)
          and exists (select 1 from public.follows where follower_id = h.author_id and following_id = me)) then
    raise exception 'teen_closed';
  end if;
  if exists (select 1 from public.hit_joins where hit_id = hit and user_id = me) then return h.conversation_id; end if;
  select count(*) into taken from public.hit_joins where hit_id = hit;
  if taken >= h.spots then raise exception 'That hit is full.'; end if;
  conv := h.conversation_id;
  if conv is not null then
    perform 1 from public.conversations where id = conv for update;
    select coalesce(array_agg(user_id), '{}') into in_chat from public.conversation_members where conversation_id = conv;
    if not (me = any (in_chat)) then
      if exists (select 1 from public.conversation_removals r where r.conversation_id = conv and r.user_id = me) then
        raise exception 'removed';
      end if;
      if cardinality(in_chat) >= public.group_cap() then raise exception 'That hit is full.'; end if;
      fits := public.group_fits(h.author_id, in_chat, array[me]);
      if fits is not null then raise exception '%', fits; end if;
    end if;
  end if;
  insert into public.hit_joins (hit_id, user_id) values (hit, me);
  if conv is null then
    label := 'Hit · ' || coalesce(h.place->>'name', 'Court');
    insert into public.conversations (title, is_group, created_by) values (left(label, 60), true, h.author_id) returning id into conv;
    insert into public.conversation_members (conversation_id, user_id, role) values (conv, h.author_id, 'admin'), (conv, me, 'member') on conflict do nothing;
    perform set_config('courtside.hit_system', 'on', true);
    update public.hit_requests set conversation_id = conv where id = hit;
    perform set_config('courtside.hit_system', 'off', true);
  else
    insert into public.conversation_members (conversation_id, user_id) values (conv, me) on conflict do nothing;
  end if;
  -- The line is skipped rather than refusing the join (a suspended account
  -- cannot write it, nor can someone over the 30-messages-a-minute limit).
  begin
    perform public.post_group_event(conv, me, 'joined');
  exception when others then
    null;
  end;
  perform public.file_notification(h.author_id, me, 'hit-join', hit::text, 'hit-request', coalesce(h.place->>'name', 'your hit'), false);
  return conv;
end $$;
grant execute on function public.join_hit(uuid) to authenticated;

-- The names older app builds call (the live web build among them). Same
-- names, inputs and results as migration 42; they now follow every rule above.
create or replace function public.open_group(members uuid[], group_title text default null, wanted uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  return public.create_group(group_title, members, wanted);
end $$;
grant execute on function public.open_group(uuid[], text, uuid) to authenticated;

create or replace function public.add_to_group(conv uuid, member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.add_group_members(conv, array[member]);
end $$;
grant execute on function public.add_to_group(uuid, uuid) to authenticated;

-- ============================================================ 4. guards and alerts

-- Event lines come only from the server. A phone cannot write kind 'system',
-- and only event lines carry an `event`.
create or replace function public.guard_system_messages()
returns trigger language plpgsql as $$
begin
  if new.kind = 'system' and coalesce(current_setting('courtside.group_event', true), '') <> 'on' then
    raise exception 'system lines come from the server';
  end if;
  if new.event is not null and new.kind <> 'system' then
    raise exception 'only event lines carry an event';
  end if;
  return new;
end $$;
drop trigger if exists guard_system_messages on public.messages;
create trigger guard_system_messages before insert on public.messages
  for each row execute function public.guard_system_messages();

-- What can change on a message once sent (latest was migration 44). The same
-- rules, plus:
--   * an event line's words and its `event` never change, and it takes no
--     reactions (older builds may try; the change is quietly ignored);
--   * each person only changes their own reaction. An older build sends the
--     whole set of reactions as it saw them; only the sender's own entry is
--     taken from it, so a reaction someone else added a moment ago survives.
create or replace function public.guard_message_columns()
returns trigger language plpgsql as $$
declare
  me text := auth.uid()::text;
  mine jsonb;
begin
  if new.sender_id <> old.sender_id or new.conversation_id <> old.conversation_id
     or new.kind <> old.kind or new.shared_id is distinct from old.shared_id or new.created_at <> old.created_at
     or new.place is distinct from old.place or new.audio_url is distinct from old.audio_url or new.audio_ms is distinct from old.audio_ms
     or new.event is distinct from old.event then
    raise exception 'only reactions, and the sender''s own words, can change';
  end if;
  if old.kind = 'system' and new.body is distinct from old.body then
    raise exception 'event lines cannot be edited';
  end if;
  if new.body <> old.body then
    if auth.uid() is distinct from old.sender_id then
      raise exception 'only the sender can edit a message';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  if me is not null then
    if old.kind = 'system' then
      new.reactions := old.reactions;
    else
      mine := new.reactions -> me;
      if mine is not null and (jsonb_typeof(mine) <> 'string' or char_length(mine #>> '{}') not between 1 and 16) then
        raise exception 'bad reaction';
      end if;
      new.reactions := (coalesce(old.reactions, '{}'::jsonb) - me)
        || case when mine is null then '{}'::jsonb else jsonb_build_object(me, mine) end;
    end if;
  end if;
  return new;
end $$;

-- Unsend: still the sender's alone, and never an event line.
drop policy if exists "senders unsend" on public.messages;
create policy "senders unsend" on public.messages for delete using (auth.uid() = sender_id and kind <> 'system');

-- The alert for a new message (latest was migration 14). Now:
--   * event lines send no alert (someone added gets their own, above);
--   * nobody is alerted who turned Message alerts off, who is blocked with
--     the sender either way, or who muted this chat (unless the message
--     @mentions them);
--   * a named group reads "Mira Lopez in Saturday hitters"; a group with no
--     name shows its people as the title and "Mira: …" as the text; a 1:1
--     chat reads as before, the sender's name;
--   * courts, voice messages and shared hits have words, not an empty alert.
create or replace function public.push_for_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  sender_first text;
  words text;
  grp boolean;
  named text;
  mentioned text[];
  link text;
  r record;
begin
  if new.kind = 'system' then return new; end if;
  link := '/messages/' || new.conversation_id;
  select coalesce(nullif(p.name, ''), p.handle), coalesce(nullif(split_part(btrim(p.name), ' ', 1), ''), p.handle)
    into who, sender_first
    from public.profiles p where p.id = new.sender_id;
  who := coalesce(who, 'New message');
  sender_first := coalesce(sender_first, 'Someone');
  words := case new.kind
    when 'post' then 'Sent a clip'
    when 'question' then 'Sent a thread'
    when 'profile' then 'Sent a profile'
    when 'court' then 'Sent a court' || coalesce(': ' || nullif(new.place->>'name', ''), '')
    when 'voice' then 'Sent a voice message'
    when 'hit-request' then 'Sent a hit'
    else coalesce(nullif(new.body, ''), 'Sent a message') end;
  mentioned := array(
    select distinct lower(x.parts[1])
    from regexp_matches(coalesce(new.body, ''), '@([A-Za-z0-9_]{2,24})', 'g') as x(parts));
  select coalesce(c.is_group, false), nullif(btrim(c.title), '') into grp, named
    from public.conversations c where c.id = new.conversation_id;
  for r in
    select m.user_id
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
    left join public.user_state s on s.user_id = m.user_id
    left join public.conversation_prefs cp on cp.user_id = m.user_id and cp.conversation_id = m.conversation_id
    where m.conversation_id = new.conversation_id
      and m.user_id <> new.sender_id
      and s.push_messages is not false
      and not public.is_blocked_between(m.user_id, new.sender_id)
      and (cp.muted_until is null or cp.muted_until <= now() or lower(p.handle) = any (mentioned))
  loop
    if not coalesce(grp, false) then
      perform public.send_push(r.user_id, who, words, link);
    elsif named is not null then
      perform public.send_push(r.user_id, who || ' in ' || named, words, link);
    else
      perform public.send_push(r.user_id, public.group_label(new.conversation_id, r.user_id), sender_first || ': ' || words, link);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists push_for_message on public.messages;
create trigger push_for_message after insert on public.messages
  for each row execute function public.push_for_message();

-- ============================================================ 5. reports of a group chat

-- What an admin sees of a reported chat ("Report group" files it as
-- 'conversation:<id>'): its name, who is in it, and its last 30 messages,
-- oldest first. Only for admins (is_admin, migration 23), and only for a
-- chat someone has reported: nobody else can read a group they are not in.
-- Null when the chat no longer exists. Shape:
--   {"title": text or null, "is_group": true/false, "members": [ids],
--    "messages": [{"sender": id, "body": text, "kind": text, "created_at": time}]}
create or replace function public.report_chat_context(conv uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  ctx jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.reports r where r.target = 'conversation:' || conv::text) then
    raise exception 'not reported';
  end if;
  select jsonb_build_object(
      'title', c.title,
      'is_group', coalesce(c.is_group, false),
      'members', coalesce((select jsonb_agg(m.user_id order by m.joined_at, m.user_id)
                           from public.conversation_members m where m.conversation_id = c.id), '[]'::jsonb),
      'messages', coalesce((select jsonb_agg(jsonb_build_object('sender', x.sender_id, 'body', x.body, 'kind', x.kind, 'created_at', x.created_at)
                                             order by x.created_at, x.id)
                            from (select mm.id, mm.sender_id, mm.body, mm.kind, mm.created_at from public.messages mm
                                  where mm.conversation_id = c.id
                                  order by mm.created_at desc, mm.id desc limit 30) x), '[]'::jsonb))
    into ctx
    from public.conversations c where c.id = conv;
  return ctx;
end $$;
revoke all on function public.report_chat_context(uuid) from public, anon;
grant execute on function public.report_chat_context(uuid) to authenticated;

-- ============================================================ 6. every group has an admin

-- However a group's admin goes, someone takes over. Leaving and removal see
-- to it themselves; this covers the rest, above all an admin deleting their
-- account, which takes their place in every group with it and runs none of
-- the functions above. Only an admin going can leave a group without one.
create or replace function public.keep_group_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and exists (select 1 from public.conversations c where c.id = old.conversation_id and c.is_group) then
    perform public.ensure_group_admin(old.conversation_id);
  end if;
  return old;
end $$;
drop trigger if exists keep_group_admin on public.conversation_members;
create trigger keep_group_admin after delete on public.conversation_members
  for each row execute function public.keep_group_admin();

-- Groups whose starter has since left or deleted their account: the person
-- who has been in longest becomes admin. Safe to repeat (it only touches a
-- group with nobody as admin).
do $$
declare
  g uuid;
begin
  for g in
    select x.id from public.conversations x
    where x.is_group
      and exists (select 1 from public.conversation_members m where m.conversation_id = x.id)
      and not exists (select 1 from public.conversation_members m where m.conversation_id = x.id and m.role = 'admin')
  loop
    perform public.ensure_group_admin(g);
  end loop;
end $$;

-- ============================================================ 7. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file. Expected
-- results are in the line above each.
--
-- (a) One row per function, each with the inputs shown, and no name listed
--     twice (a second row would mean an accidental duplicate):
-- select p.proname, pg_get_function_identity_arguments(p.oid) as inputs, pg_get_function_result(p.oid) as result
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('create_group', 'add_group_members', 'remove_group_member', 'leave_group', 'rename_group',
--     'set_group_photo', 'set_group_admin', 'set_chat_mute', 'toggle_reaction', 'open_conversation', 'chat_is_blocked',
--     'join_hit', 'open_group', 'add_to_group', 'group_cap', 'group_fits', 'group_label', 'post_group_event',
--     'is_own_media_url', 'report_chat_context', 'keep_group_admin')
--   order by 1;
--
-- (b) The new columns are there (expect 6 rows):
-- select table_name, column_name, data_type from information_schema.columns
--   where table_schema = 'public' and (table_name, column_name) in
--     (('conversations', 'photo_url'), ('conversation_members', 'role'), ('conversation_members', 'joined_at'),
--      ('conversation_members', 'added_by'), ('messages', 'event'), ('user_state', 'push_messages'))
--   order by 1, 2;
--
-- (c) Every group that still has people in it has an admin (expect 0):
-- select count(*) as groups_without_admin from public.conversations c
--   where c.is_group and exists (select 1 from public.conversation_members m where m.conversation_id = c.id)
--   and not exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.role = 'admin');
--
-- (d) How many groups have admins, and how many admins in all (any numbers; a sanity look):
-- select count(distinct conversation_id) as groups_with_admin, count(*) as admins
--   from public.conversation_members where role = 'admin';
--
-- (e) Live updates include messages and conversation_members (expect those 2 rows; this file adds
--     nothing to them, so a third row, conversations, would only mean an earlier draft of it ran, and is harmless):
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime'
--   and schemaname = 'public' and tablename in ('conversations', 'messages', 'conversation_members') order by 1;
--
-- (f) The triggers on messages (expect guard_message_columns, guard_message_edit, guard_system_messages,
--     limit_messages, messages_touch, notify_share, push_for_message, refuse_if_suspended, stamp_new_row):
-- select tgname from pg_trigger where tgrelid = 'public.messages'::regclass and not tgisinternal order by 1;
--
-- (g) The chat settings table only lets you read your own rows (expect one row: "your chat settings", SELECT):
-- select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'conversation_prefs';
--
-- (h) Unsend skips event lines (expect the rule to mention kind <> 'system'):
-- select policyname, qual from pg_policies where schemaname = 'public' and tablename = 'messages' and cmd = 'DELETE';
--
-- (i) join_hit still has its two hit_system lines, and open_conversation skips groups (expect true, true):
-- select (select prosrc like '%courtside.hit_system%on%courtside.hit_system%off%' from pg_proc
--           where proname = 'join_hit' and pronamespace = 'public'::regnamespace) as join_hit_keeps_switch,
--        (select prosrc like '%c.is_group%' from pg_proc
--           where proname = 'open_conversation' and pronamespace = 'public'::regnamespace) as dm_lookup_skips_groups;
--
-- (j) The app cannot call the internal helpers (expect false for each):
-- select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as app_can_call
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('post_group_event', 'group_fits', 'group_label', 'ensure_group_admin', 'is_group_admin', 'group_cap')
--   order by 1;
--
-- (j2) The removals list cannot be read or written by the app (expect false, false, false, false):
-- select has_table_privilege('authenticated', 'public.conversation_removals', 'select') as app_reads,
--        has_table_privilege('authenticated', 'public.conversation_removals', 'insert') as app_writes,
--        has_table_privilege('anon', 'public.conversation_removals', 'select') as visitor_reads,
--        (select count(*) > 0 from pg_policies where schemaname = 'public' and tablename = 'conversation_removals') as has_rules;
--
-- (j3) A group keeps an admin when its admin's account is deleted (expect one row: keep_group_admin):
-- select tgname from pg_trigger where tgrelid = 'public.conversation_members'::regclass and not tgisinternal
--   and tgname = 'keep_group_admin';
--
-- (j4) The group photo rule takes only this project's own media addresses (expect true, true, false, false, false):
-- select public.is_own_media_url('https://auth.courtsidebase.com/storage/v1/object/public/media/00000000-0000-0000-0000-000000000001/a1-b2.jpeg', '00000000-0000-0000-0000-000000000001') as own_domain,
--        public.is_own_media_url('https://cgitvbnvchmofqkhtlml.supabase.co/storage/v1/object/public/media/00000000-0000-0000-0000-000000000001/a1-b2.jpeg', null) as project_address,
--        public.is_own_media_url('https://evil.example/storage/v1/object/public/media/00000000-0000-0000-0000-000000000001/a.png', null) as other_site,
--        public.is_own_media_url('https://auth.courtsidebase.com/storage/v1/object/public/media/00000000-0000-0000-0000-000000000001/a.png?x=1', null) as with_query,
--        public.is_own_media_url('https://auth.courtsidebase.com/storage/v1/object/public/media/00000000-0000-0000-0000-000000000001/a.png', '00000000-0000-0000-0000-000000000002') as someone_elses;
--
-- (k) Groups over the cap of 16, if any (expect 0; older groups are left as they are, only additions are checked):
-- select count(*) as over_cap from (select conversation_id from public.conversation_members m
--   join public.conversations c on c.id = m.conversation_id where c.is_group
--   group by conversation_id having count(*) > 16) t;
--
-- (l) Group chats left with nobody in them by the old leave (they are unreachable; a number to know, nothing to do):
-- select count(*) as empty_groups from public.conversations c
--   where c.is_group and not exists (select 1 from public.conversation_members m where m.conversation_id = c.id);
--
-- (m) Accounts with no birth date yet, who count as teens for every chat rule (risk 2 in the plan):
-- select count(*) as age_unknown from public.profiles where age_group is null;
