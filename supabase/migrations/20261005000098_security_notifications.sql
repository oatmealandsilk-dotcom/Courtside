-- CourtSide · migration 98: notifications can only be marked read, teens are
-- not pinged by strangers' tags, and "just joined near you" goes out once
-- (security review, Oct 5).
--
-- 1. Your notifications: only "read" can change.
--    The problem: the rule "mark your own read" let you change ANY field of
--    the notifications in your own list: who it was from, when, what kind.
--    The 30-a-minute limit on notifications counts by who they are from, so
--    someone could relabel 30 of their own notifications as "from" another
--    player, dated ten years ahead, and from then on every like, comment,
--    follow or tag by that player was silently dropped for everyone. The same
--    trick fooled the "only once" checks that look for an earlier
--    notification (map alerts for a new player, following your inviter).
--    Now the app (which only ever marks notifications read) may change only
--    "read"; the limit counts only notifications that are not in the future.
--
-- 2. Tags and @mentions of a teen by a stranger no longer reach the teen.
--    The problem: anyone could put a teen's id in a post's tags, or write
--    @theirhandle in a post, comment or reply, and the teen got a push with
--    the stranger's name and 80 characters of whatever they wrote, private
--    teens included. Chats, session tags and hits already apply the teen
--    rule (someone not known to be an adult hears only from people they
--    follow); tags now do too. A teen still hears every tag and mention from
--    people they follow, and adults hear from anyone, as before.
--
-- 3. "Just joined CourtSide near you" is sent once per player, ever.
--    The problem: clearing your town and typing it in again sent the alert
--    again, to up to 50 adults in that town, each time, with whatever text
--    was in the town box, and suspension did not stop it. Now the first
--    announcement is the only one (kept in a list only the server writes),
--    and a suspended account announces nothing. Players already announced
--    are on that list from the start.
--
-- Safe to run more than once. Works before or after migration 64.

-- -------------------------------------------------------- 1. only "read" changes
revoke update on public.notifications from anon, authenticated;
grant update (read) on public.notifications to authenticated;

-- ------------------------------------------------------- 1 and 2. file_notification
-- As before (migration 18), plus: the per-minute count ignores anything dated
-- in the future, and a tag of someone not known to be an adult needs them to
-- follow the tagger.
create or replace function public.file_notification(recipient uuid, actor uuid, what text, target text, target_type text, words text, once boolean default true, again_after interval default null::interval)
returns void language plpgsql security definer set search_path = public as $$
declare
  flat text;
begin
  if recipient is null or actor is null or recipient = actor or target is null then return; end if;
  if not exists (select 1 from public.profiles where id = recipient) then return; end if;
  if exists (select 1 from public.user_state where user_id = recipient and actor::text = any(blocked_ids)) then return; end if;
  -- The teen rule, as for chats and session tags (session_tag_refusal_for).
  if what = 'tag' and not public.known_adult(recipient)
     and not exists (select 1 from public.follows where follower_id = recipient and following_id = actor) then
    return;
  end if;
  flat := nullif(btrim(regexp_replace(coalesce(words, ''), '\s+', ' ', 'g')), '');
  -- chr(8230) is the ellipsis character, written so it survives any copy and paste.
  if flat is not null and char_length(flat) > 80 then flat := left(flat, 79) || chr(8230); end if;
  if once and exists (
    select 1 from public.notifications
    where user_id = recipient and actor_id = actor and kind = what and target_id = target
      and target_kind = target_type and preview is not distinct from flat
      and (again_after is null or created_at > now() - again_after)
  ) then return; end if;
  if (select count(*) from public.notifications
      where actor_id = actor and created_at > now() - interval '1 minute' and created_at <= now()) >= 30 then return; end if;
  insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
    values (recipient, actor, what, target, target_type, flat);
end $$;

-- --------------------------------------------------------- 3. joined, once
create table if not exists public.joined_announcements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  announced_at timestamptz not null default now(),
  -- The statement that announced: its own 50 rows all go through, a later one none.
  tx bigint not null default txid_current()
);
alter table public.joined_announcements enable row level security;
revoke all on public.joined_announcements from public, anon, authenticated;

-- Everyone already announced counts as announced.
insert into public.joined_announcements (user_id, announced_at, tx)
select n.actor_id, min(n.created_at), 0
from public.notifications n join public.profiles p on p.id = n.actor_id
where n.kind = 'joined'
group by n.actor_id
on conflict (user_id) do nothing;

-- Sits in front of every "joined" notification, whichever version of
-- notify_joined_nearby is live (migration 60's, or 64's after that runs).
create or replace function public.joined_once()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  first_tx bigint;
begin
  if public.is_suspended(new.actor_id) then return null; end if;
  insert into public.joined_announcements (user_id) values (new.actor_id) on conflict (user_id) do nothing;
  select tx into first_tx from public.joined_announcements where user_id = new.actor_id;
  if first_tx is distinct from txid_current() then return null; end if;
  return new;
end $$;

drop trigger if exists joined_once on public.notifications;
create trigger joined_once before insert on public.notifications
  for each row when (new.kind = 'joined') execute function public.joined_once();

-- Checks after running:
-- (a) the app may change only "read" (expect one row: read):
--   select column_name from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'notifications' and grantee = 'authenticated' and privilege_type = 'UPDATE';
-- (b) players already announced (expect the number of different senders of 'joined' notifications):
--   select count(*) from public.joined_announcements;
