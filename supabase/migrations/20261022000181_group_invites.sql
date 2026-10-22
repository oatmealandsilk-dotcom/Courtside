-- CourtSide · migration 20261022000181: invite people to a group, and they
-- are told (Oct 22, owner: "You should be able to invite to a group too,
-- also ppl should get notification for that").
--
-- NOT YET RUN on the live database. Run it only after the app update that
-- knows about invites is out (an older app shows the notification as
-- "<name> updated", with a tap that goes nowhere useful).
--
-- What it does, in plain words:
--   * Anyone in a group can invite people to it (up to 20 at a time). Each
--     one invited gets a notification, "Mira invited you to Silver Lake
--     sunrise", with Join / Not now in the app, and a phone alert if their
--     phone allows them. Tapping either opens the group.
--   * Join gets you straight in when the one who invited you could let you
--     in themselves: an admin's invite, in any group; anyone's invite, in an
--     open group. In an ask-to-join group (or one an admin took you out of)
--     a member's invite files the usual request to the admins instead
--     ("Sent to the admins"). Nobody is ever in more than 3 groups: Join
--     says so, and the invite waits while you leave one.
--   * Not now clears it. Nobody is told, and the inviter still sees
--     "Invited" (so a no is never noticed). Joining tells nobody either.
--   * Who can't be invited, left out without a word to the inviter (never
--     saying why, and never anything about anyone's age):
--       - a teen, or anyone with no birthday on file, unless they follow
--         the inviter (the rule for adding someone to a group chat);
--       - anyone blocked either way with the inviter or with an admin of
--         the group, or who blocked the inviter in the app;
--       - a suspended account; someone already in the group; yourself.
--     Someone who muted the inviter is still invited (the inviter sees
--     "Invited", so the mute is not revealed) but sees nothing: no
--     notification, no phone alert, and it stays out of their invites list.
--   * Against spam: one invite per group and person; a waiting one is never
--     sent again; after "Not now" the same group can invite them again only
--     after 30 days; at most 30 new invites a day per inviter (a call that
--     would go past it invites nobody, and says so). A suspended account
--     can't invite.
--   * An invite lapses (leaves the list, and Join says it isn't open) when
--     the inviter is no longer in the group, a block appears between them,
--     a teen stops following the inviter, or 30 days pass unanswered.
--     Deleting a group or an account removes its invites.
--
-- What changes, by name:
--   feed_group_invites (new table): one row per (group, person invited).
--     The app can't read or change it directly: reads go through
--     my_feed_group_invites(), every change through the functions below.
--   invite_to_feed_group(g, people), answer_feed_group_invite(g, accept),
--     my_feed_group_invites(): what the app calls. Nothing existing is
--     replaced: my_feed_groups, join_feed_group and the rest stay as they are.
--   The phone-alert trigger on notifications (push_for_notification, as
--     migration 76 made it) skips 'group-invite', which sends its own alert
--     only when the notification was really filed. The trigger's function
--     itself is not touched.
--
-- Needs migrations 67, 73 and 149 (groups), 76 (the trigger), 98/124
-- (file_notification), 106 (send_push), 109 (known_adult) and 124
-- (refuse_if_suspended, is_suspended). Stops before changing anything if
-- one is missing or the trigger is not as 76 left it. Safe to run more
-- than once.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  missing text[] := '{}';
  f text;
  def text;
  kinds text[];
  want76 constant text[] := array['map-friend-hit', 'map-new-hit', 'map-new-player', 'court-activity', 'hit-invite'];
begin
  foreach f in array array['feed_groups', 'feed_group_members', 'feed_group_requests', 'feed_group_removals', 'notifications', 'push_tokens', 'user_state', 'follows', 'profiles'] loop
    if to_regclass('public.' || f) is null then missing := missing || ('table ' || f); end if;
  end loop;
  foreach f in array array[
    'public.file_notification(uuid, uuid, text, text, text, text, boolean, interval)',
    'public.send_push(uuid, text, text, text)',
    'public.known_adult(uuid)',
    'public.is_blocked_between(uuid, uuid)',
    'public.is_feed_group_admin(uuid, uuid)',
    'public.lock_feed_groups_of(uuid)',
    'public.feed_group_count(uuid)',
    'public.feed_group_cap()',
    'public.refuse_if_suspended()',
    'public.is_suspended(uuid)',
    'public.push_for_notification()'] loop
    if to_regprocedure(f) is null then missing := missing || f; end if;
  end loop;
  if to_regclass('public.feed_groups') is not null and not exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'feed_groups' and column_name = 'look_color') then
    missing := missing || 'feed_groups.look_color (migration 73)'::text;
  end if;
  if cardinality(missing) > 0 then
    raise exception 'Migration 181 stopped before changing anything: % not found. Run migrations 67, 73, 76, 98, 106, 109, 124 and 149 first.', array_to_string(missing, ', ');
  end if;
  -- The phone-alert trigger: as 76 made it, or as this file leaves it (a re-run).
  select pg_get_triggerdef(t.oid) into def from pg_trigger t
    where t.tgrelid = 'public.notifications'::regclass and t.tgname = 'push_for_notification' and not t.tgisinternal;
  select coalesce(array_agg(m[1] order by m[1]), '{}') into kinds
    from regexp_matches(coalesce(def, ''), '''([^'']+)''::text', 'g') as m;
  if def is null or def not like '%push_for_notification()%'
     or not (kinds @> want76 and kinds <@ (want76 || 'group-invite'::text)) then
    raise exception 'Migration 181 stopped before changing anything: the notifications trigger push_for_notification is not as migration 76 left it (%). This file must be brought up to date with that change first.', coalesce(def, 'missing');
  end if;
end $$;

-- ------------------------------------------------------------------ 1. the table
create table if not exists public.feed_group_invites (
  group_id    uuid not null references public.feed_groups (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  invited_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- "Not now": kept (silently) so the same group can't ask again for 30 days.
  declined_at timestamptz,
  primary key (group_id, user_id),
  constraint feed_group_invites_not_self check (user_id <> invited_by)
);
create index if not exists feed_group_invites_inviter_idx on public.feed_group_invites (invited_by, created_at desc);
create index if not exists feed_group_invites_user_idx on public.feed_group_invites (user_id);

alter table public.feed_group_invites enable row level security;
-- No direct reads or writes: the app reads through my_feed_group_invites()
-- (so an inviter never sees a "Not now", or that an invite turned into a
-- join request) and changes rows only through the functions below.
revoke all on public.feed_group_invites from anon, authenticated;
drop policy if exists "your invites" on public.feed_group_invites;

-- A suspended account sends no invites (as for join requests, migration 124).
drop trigger if exists refuse_if_suspended on public.feed_group_invites;
create trigger refuse_if_suspended before insert on public.feed_group_invites
  for each row execute function public.refuse_if_suspended();

-- ------------------------------------------------------------------ 2. still open?
-- Whether an invite still stands: not answered, under 30 days old, its
-- inviter still in the group and not suspended, no block between the two
-- (or with an admin of the group, or in the app's own block list), and,
-- for someone not known to be an adult, still following the inviter.
create or replace function public.feed_group_invite_open(g uuid, who uuid, inviter uuid, made timestamptz, declined timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select declined is null
    and made > now() - interval '30 days'
    and exists (select 1 from public.feed_group_members m where m.group_id = g and m.user_id = inviter)
    and not public.is_suspended(inviter)
    and not public.is_blocked_between(who, inviter)
    and not exists (select 1 from public.feed_group_members a
                    where a.group_id = g and a.role = 'admin' and public.is_blocked_between(who, a.user_id))
    and not exists (select 1 from public.user_state s where s.user_id = who and inviter::text = any (coalesce(s.blocked_ids, '{}')))
    and (public.known_adult(who) or exists (select 1 from public.follows f where f.follower_id = who and f.following_id = inviter));
$$;
revoke all on function public.feed_group_invite_open(uuid, uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------------ 3. inviting
-- Invites these people (the first 20) to a group you are in. Answers with
-- who was invited this time; anyone left out (see the top) is simply not
-- in it, never with a reason.
create or replace function public.invite_to_feed_group(g uuid, people uuid[])
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  grp public.feed_groups;
  who uuid;
  added uuid[] := '{}';
  allowed int;
  me_name text;
begin
  if me is null then raise exception 'not signed in'; end if;
  if public.is_suspended(me) then raise exception 'suspended'; end if;
  select * into grp from public.feed_groups where id = g;
  if grp.id is null then raise exception 'not_found'; end if;
  if not exists (select 1 from public.feed_group_members where group_id = g and user_id = me) then
    raise exception 'not_member';
  end if;
  -- One inviter's invites, one call at a time, so the day's count holds.
  perform pg_advisory_xact_lock(hashtextextended('feed_group_invites:' || me::text, 181));
  allowed := 30 - (select count(*) from public.feed_group_invites where invited_by = me and created_at > now() - interval '1 day');
  if allowed <= 0 then raise exception 'invite_limit'; end if;
  select coalesce(nullif(btrim(name), ''), handle, 'Someone') into me_name from public.profiles where id = me;

  for who in
    select x from (select x, min(o) as o from unnest((coalesce(people, '{}'))[1:20]) with ordinality as u(x, o) where x is not null group by x) d order by o
  loop
    continue when who = me;
    continue when not exists (select 1 from public.profiles p where p.id = who and p.suspended_at is null);
    continue when exists (select 1 from public.feed_group_members where group_id = g and user_id = who);
    continue when public.is_blocked_between(me, who);
    continue when exists (select 1 from public.feed_group_members a
                          where a.group_id = g and a.role = 'admin' and public.is_blocked_between(who, a.user_id));
    continue when exists (select 1 from public.user_state s where s.user_id = who and me::text = any (coalesce(s.blocked_ids, '{}')));
    -- The teen rule: someone not known to be an adult only from people they follow.
    continue when not public.known_adult(who)
      and not exists (select 1 from public.follows f where f.follower_id = who and f.following_id = me);
    -- New, or in place of one that lapsed or was turned down over 30 days ago.
    -- A waiting one, or a "Not now" under 30 days old, stays as it is.
    insert into public.feed_group_invites as i (group_id, user_id, invited_by)
      values (g, who, me)
      on conflict (group_id, user_id) do update
        set invited_by = excluded.invited_by, created_at = now(), declined_at = null
        where (i.declined_at is not null and i.declined_at <= now() - interval '30 days')
           or (i.declined_at is null and not public.feed_group_invite_open(i.group_id, i.user_id, i.invited_by, i.created_at, i.declined_at));
    continue when not found;
    -- Past the day's 30: nobody in this call is invited (it all rolls back),
    -- so the app's "Invited" never covers someone who wasn't.
    if cardinality(added) >= allowed then raise exception 'invite_limit'; end if;
    added := added || who;
    -- Muted you: invited, but not told.
    continue when exists (select 1 from public.user_state s where s.user_id = who and me::text = any (coalesce(s.muted_ids, '{}')));
    perform public.file_notification(who, me, 'group-invite', g::text, 'group', grp.name, true, interval '29 days');
    -- The phone alert only when the notification was really filed (file_notification can decline).
    if exists (select 1 from public.notifications n
               where n.user_id = who and n.actor_id = me and n.kind = 'group-invite' and n.target_id = g::text and n.created_at = now()) then
      begin
        perform public.send_push(who, 'CourtSide', coalesce(me_name, 'Someone') || ' invited you to ' || grp.name, '/g/' || g);
      exception when others then
        null;
      end;
    end if;
  end loop;
  return added;
end $$;
revoke all on function public.invite_to_feed_group(uuid, uuid[]) from public, anon;
grant execute on function public.invite_to_feed_group(uuid, uuid[]) to authenticated;

-- ------------------------------------------------------------------ 4. answering
-- Join (accept true) or Not now (false). Answers 'joined', 'requested'
-- (sent to the admins), 'already' or 'declined'. Raises 'not_found' for an
-- invite that is not open, 'group_limit' when you are in 3 groups (the
-- invite waits), 'slow_down' past 10 open requests.
create or replace function public.answer_feed_group_invite(g uuid, accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.feed_group_invites;
  grp public.feed_groups;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into inv from public.feed_group_invites where group_id = g and user_id = me;
  if inv.group_id is null
     or not public.feed_group_invite_open(inv.group_id, inv.user_id, inv.invited_by, inv.created_at, inv.declined_at) then
    raise exception 'not_found';
  end if;

  if not coalesce(accept, false) then
    update public.feed_group_invites set declined_at = now() where group_id = g and user_id = me;
    update public.notifications set read = true where user_id = me and kind = 'group-invite' and target_id = g::text and not read;
    return 'declined';
  end if;

  perform public.lock_feed_groups_of(me);
  if exists (select 1 from public.feed_group_members where group_id = g and user_id = me) then
    delete from public.feed_group_invites where group_id = g and user_id = me;
    update public.notifications set read = true where user_id = me and kind = 'group-invite' and target_id = g::text and not read;
    return 'already';
  end if;
  if public.feed_group_count(me) >= public.feed_group_cap() then raise exception 'group_limit'; end if;
  select * into grp from public.feed_groups where id = g;

  -- The inviter's say is not enough here: the usual request to the admins (as join_feed_group).
  if (grp.ask_to_join or exists (select 1 from public.feed_group_removals where group_id = g and user_id = me))
     and not public.is_feed_group_admin(g, inv.invited_by) then
    if not exists (select 1 from public.feed_group_requests where group_id = g and user_id = me)
       and (select count(*) from public.feed_group_requests where user_id = me) >= 10 then
      raise exception 'slow_down';
    end if;
    insert into public.feed_group_requests (group_id, user_id) values (g, me) on conflict do nothing;
    delete from public.feed_group_invites where group_id = g and user_id = me;
    update public.notifications set read = true where user_id = me and kind = 'group-invite' and target_id = g::text and not read;
    return 'requested';
  end if;

  insert into public.feed_group_members (group_id, user_id) values (g, me) on conflict do nothing;
  delete from public.feed_group_invites where group_id = g and user_id = me;
  delete from public.feed_group_requests where group_id = g and user_id = me;
  delete from public.feed_group_removals where group_id = g and user_id = me;
  update public.notifications set read = true where user_id = me and kind = 'group-invite' and target_id = g::text and not read;
  return 'joined';
end $$;
revoke all on function public.answer_feed_group_invite(uuid, boolean) from public, anon;
grant execute on function public.answer_feed_group_invite(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------ 5. reading
-- Your open invites, newest first, with each group's face (never who is in
-- it); and, by group, the people you invited who haven't joined (waiting,
-- or turned you down in the last 30 days: both read "Invited", so a no is
-- never noticed). 'live' tells the app invites are here.
create or replace function public.my_feed_group_invites()
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id)
  select jsonb_build_object(
    'live', true,
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'groupId', g.id, 'name', g.name, 'description', g.description, 'ask', g.ask_to_join,
        'color', g.look_color, 'emoji', g.look_emoji, 'photo', g.photo_url,
        'members', (select count(*) from public.feed_group_members m where m.group_id = g.id),
        'invitedBy', i.invited_by,
        'inviterName', (select coalesce(nullif(btrim(p.name), ''), p.handle) from public.profiles p where p.id = i.invited_by),
        'createdAt', i.created_at
      ) order by i.created_at desc)
      from public.feed_group_invites i join public.feed_groups g on g.id = i.group_id
      where i.user_id = me.id
        and public.feed_group_invite_open(i.group_id, i.user_id, i.invited_by, i.created_at, i.declined_at)
        and not exists (select 1 from public.user_state s where s.user_id = me.id and i.invited_by::text = any (coalesce(s.muted_ids, '{}')))
        and not exists (select 1 from public.feed_group_members m where m.group_id = i.group_id and m.user_id = me.id)), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_object_agg(s.group_id, s.ids)
      from (
        select i.group_id, jsonb_agg(i.user_id order by i.created_at) as ids
        from public.feed_group_invites i
        where i.invited_by = me.id
          and ((i.declined_at is null and i.created_at > now() - interval '30 days') or i.declined_at > now() - interval '30 days')
          and exists (select 1 from public.feed_group_members m where m.group_id = i.group_id and m.user_id = me.id)
          and not exists (select 1 from public.feed_group_members m where m.group_id = i.group_id and m.user_id = i.user_id)
          and not public.is_blocked_between(me.id, i.user_id)
        group by i.group_id) s), '{}'::jsonb))
  from me where me.id is not null;
$$;
revoke all on function public.my_feed_group_invites() from public, anon;
grant execute on function public.my_feed_group_invites() to authenticated;

-- ------------------------------------------------------------------ 6. phone alerts
-- "Mira invited you to …" sends its own phone alert (above), so the general one skips it.
-- Migration 76's trigger, with 'group-invite' added to the list.
drop trigger if exists push_for_notification on public.notifications;
create trigger push_for_notification after insert on public.notifications
  for each row when (new.kind not in ('map-friend-hit', 'map-new-hit', 'map-new-player', 'court-activity', 'hit-invite', 'group-invite'))
  execute function public.push_for_notification();

-- ------------------------------------------------------------------ 7. afterwards
do $$
begin
  if to_regclass('public.feed_group_invites') is null
     or to_regprocedure('public.invite_to_feed_group(uuid, uuid[])') is null
     or to_regprocedure('public.answer_feed_group_invite(uuid, boolean)') is null
     or to_regprocedure('public.my_feed_group_invites()') is null
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'public.notifications'::regclass and t.tgname = 'push_for_notification'
                    and pg_get_triggerdef(t.oid) like '%group-invite%') then
    raise exception 'Migration 181 did not finish: something it makes is missing.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ 8. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The table, with row security on (expect true, 0 or more):
-- select relrowsecurity, (select count(*) from feed_group_invites) from pg_class where relname = 'feed_group_invites';
--
-- (b) Who may call what (expect true, true, true, false, false, false, false):
-- select has_function_privilege('authenticated', 'public.invite_to_feed_group(uuid, uuid[])', 'execute'),
--        has_function_privilege('authenticated', 'public.answer_feed_group_invite(uuid, boolean)', 'execute'),
--        has_function_privilege('authenticated', 'public.my_feed_group_invites()', 'execute'),
--        has_function_privilege('anon', 'public.invite_to_feed_group(uuid, uuid[])', 'execute'),
--        has_function_privilege('authenticated', 'public.feed_group_invite_open(uuid, uuid, uuid, timestamptz, timestamptz)', 'execute'),
--        has_table_privilege('authenticated', 'public.feed_group_invites', 'insert'),
--        has_table_privilege('authenticated', 'public.feed_group_invites', 'select');
--
-- (c) The phone-alert trigger skips group invites (expect one line containing 'group-invite'):
-- select pg_get_triggerdef(oid) from pg_trigger where tgname = 'push_for_notification';
--
-- (d) Invites sent today, and how many were answered (expect small numbers):
-- select count(*) filter (where created_at > now() - interval '1 day') as today,
--        count(*) filter (where declined_at is not null) as not_now
-- from feed_group_invites;
