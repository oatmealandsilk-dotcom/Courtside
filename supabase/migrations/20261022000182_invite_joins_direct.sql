-- CourtSide · migration 20261022000182: an invite from anyone in a group
-- lets you straight in (Oct 22, owner: "If you invite someone to join
-- group, you don't have to except them after").
--
-- Run after migration 181 (group invites).
--
-- What it does, in plain words:
--   * Before (181): in an ask-to-join group, Join on an invite from a member
--     who isn't an admin filed the usual request to the admins ("Sent to
--     the admins"). Now Join on any open invite from someone in the group
--     gets you straight in, in open and ask-to-join groups alike.
--   * One exception stays: someone an admin took out of the group. An
--     invite from a member who isn't an admin still only files a request to
--     the admins (so a member can't undo an admin's removal); an admin's
--     invite lets them back in and clears the removal, as before.
--   * Everything else is as 181 left it: an invite is open only while its
--     inviter is still in the group, no block stands between them (or with
--     an admin), a teen still follows the inviter, and it is under 30 days
--     old; nobody is ever in more than 3 groups (Join says so, and the
--     invite waits); at most 10 open requests. A suspended account's Join
--     is refused ('suspended') in any group: in 181 only the request's
--     own check stopped it, and that request is no longer filed.
--
-- What changes, by name: answer_feed_group_invite(g, accept) only. Its
-- name, inputs and answers ('joined', 'requested', 'already', 'declined')
-- are the same, so the app needs no change to keep working.
--
-- Stops before changing anything if migration 181 is not there, or if
-- answer_feed_group_invite has been changed since 181 wrote it. Safe to
-- run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  missing text[] := '{}';
  f text;
  r record;
begin
  foreach f in array array['feed_groups', 'feed_group_members', 'feed_group_requests', 'feed_group_removals', 'feed_group_invites', 'notifications'] loop
    if to_regclass('public.' || f) is null then missing := missing || ('table ' || f); end if;
  end loop;
  foreach f in array array[
    'public.answer_feed_group_invite(uuid, boolean)',
    'public.feed_group_invite_open(uuid, uuid, uuid, timestamptz, timestamptz)',
    'public.is_feed_group_admin(uuid, uuid)',
    'public.lock_feed_groups_of(uuid)',
    'public.feed_group_count(uuid)',
    'public.feed_group_cap()',
    'public.is_suspended(uuid)'] loop
    if to_regprocedure(f) is null then missing := missing || f; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'Migration 182 stopped before changing anything: % not found. Run migration 181 first.', array_to_string(missing, ', ');
  end if;
  -- answer_feed_group_invite is either 181's (md5 of its body as 181 wrote it) or already this file's.
  for r in select p.prosrc as src from pg_proc p where p.oid = 'public.answer_feed_group_invite(uuid, boolean)'::regprocedure loop
    if position('invite_joins_182' in r.src) = 0 and md5(r.src) <> '72946645ea21354e0011cc06028e5376' then
      raise exception 'Migration 182 stopped before changing anything: public.answer_feed_group_invite has changed since migration 181 wrote it (md5 %). Compare before replacing it.', md5(r.src);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------ 1. answering
-- Join (accept true) or Not now (false). Answers 'joined', 'requested'
-- (sent to the admins: only someone an admin took out, invited by a member
-- who isn't an admin), 'already' or 'declined'. Raises 'not_found' for an
-- invite that is not open, 'suspended' for a suspended account's Join,
-- 'group_limit' when you are in 3 groups (the invite waits), 'slow_down'
-- past 10 open requests.
create or replace function public.answer_feed_group_invite(g uuid, accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.feed_group_invites;
  marker constant text := 'invite_joins_182';
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

  -- A suspended account joins nothing. (In 181 the request's own trigger
  -- refused it for ask-to-join groups; that request is gone, so say it here.)
  if public.is_suspended(me) then raise exception 'suspended'; end if;

  perform public.lock_feed_groups_of(me);
  if exists (select 1 from public.feed_group_members where group_id = g and user_id = me) then
    delete from public.feed_group_invites where group_id = g and user_id = me;
    update public.notifications set read = true where user_id = me and kind = 'group-invite' and target_id = g::text and not read;
    return 'already';
  end if;
  if public.feed_group_count(me) >= public.feed_group_cap() then raise exception 'group_limit'; end if;

  -- An admin took you out: a member's invite can't undo that, so it is the
  -- usual request to the admins (as join_feed_group). Ask to join no longer
  -- matters here: anyone in the group can let you in by inviting you.
  if exists (select 1 from public.feed_group_removals where group_id = g and user_id = me)
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

-- ------------------------------------------------------------------ 2. afterwards
do $$
begin
  if to_regprocedure('public.answer_feed_group_invite(uuid, boolean)') is null
     or position('invite_joins_182' in (select prosrc from pg_proc where oid = 'public.answer_feed_group_invite(uuid, boolean)'::regprocedure)) = 0
     or position('ask_to_join' in (select prosrc from pg_proc where oid = 'public.answer_feed_group_invite(uuid, boolean)'::regprocedure)) > 0
     or not has_function_privilege('authenticated', 'public.answer_feed_group_invite(uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public.answer_feed_group_invite(uuid, boolean)', 'execute') then
    raise exception 'Migration 182 did not finish: answer_feed_group_invite is not as this file makes it.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ 3. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
--
-- (a) The new Join is in place, and only signed-in people can call it
--     (expect true, true, false):
-- select position('invite_joins_182' in prosrc) > 0,
--        has_function_privilege('authenticated', 'public.answer_feed_group_invite(uuid, boolean)', 'execute'),
--        has_function_privilege('anon', 'public.answer_feed_group_invite(uuid, boolean)', 'execute')
-- from pg_proc where oid = 'public.answer_feed_group_invite(uuid, boolean)'::regprocedure;
