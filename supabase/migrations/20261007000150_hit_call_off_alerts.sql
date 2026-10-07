-- CourtSide · migration 20261007000150: calling off a hit tells everyone in
-- it, and "Can't make it" (the find-a-hit audit, Oct 7, items 1 and 2).
--
--   1. Calling off a hit (the poster's Call off, which sets cancelled) now
--      tells everyone who had joined: a note in their Notifications, "Sam
--      called off the hit / today at 8:00 AM · Alder Park", with a phone
--      alert that opens the hit's chat, and a line in that chat, "Sam called
--      off this hit". Done by the database (tell_hit_called_off, a trigger on
--      the hit), so no app build, old or new, can call a hit off quietly.
--      Before, nobody heard, and people drove to an empty court.
--   2. leave_hit (migration 43, which only gave the spot back and was not
--      used by any app build) becomes "Can't make it": it gives the spot
--      back, takes you out of the hit's chat the way leaving the chat already
--      does (leave_group, migration 54: everyone there sees "Priya left"),
--      and tells the poster: "Priya can't make it / today at 8:00 AM · 1 spot
--      open again", with a phone alert that opens the hit. Not for a hit
--      already called off or already started.
--   3. push_for_notification (migration 146's, one block added) words the
--      phone alerts for the two new kinds of note, 'hit-called-off' and
--      'hit-left'. Without it they would read "Sam did something on
--      CourtSide".
--
-- The app works before this file runs: Can't make it then gives the spot
-- back and leaves the chat itself (two asks), with no note to the poster, and
-- calling off tells nobody, as today.
--
-- Safe to run more than once. Stops before changing anything if
-- push_for_notification or leave_hit has changed since the versions this
-- file was written against (146 and 43).

begin;

do $$
declare
  push_is text;
  leave_is text;
begin
  if to_regclass('public.hit_requests') is null or to_regclass('public.hit_joins') is null
     or to_regclass('public.notifications') is null or to_regclass('public.messages') is null
     or to_regclass('public.conversation_members') is null then
    raise exception 'Migration 150 stopped before changing anything: the hit, chat and notification tables have to exist first.';
  end if;
  if to_regprocedure('public.file_notification(uuid, uuid, text, text, text, text, boolean, interval)') is null
     or to_regprocedure('public.hit_when(timestamptz, jsonb)') is null
     or to_regprocedure('public.leave_group(uuid)') is null
     or to_regprocedure('public.send_push(uuid, text, text, text)') is null then
    raise exception 'Migration 150 stopped before changing anything: it needs file_notification (124), hit_when (53), leave_group (54) and send_push.';
  end if;
  select md5(p.prosrc) into push_is from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'push_for_notification';
  -- Migration 146's version, or this file's own (run again).
  if push_is is distinct from 'dd45c6721116fa907f9e4839a77f6d53' and push_is is distinct from 'd0277dc99cebf192e3bfd0659ee15e80' then
    raise exception 'Migration 150 stopped before changing anything: push_for_notification changed since migration 146 (Oct 6). This file must be brought up to date with that change first.';
  end if;
  select md5(p.prosrc) into leave_is from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'leave_hit';
  -- Migration 43's version, or this file's own (run again).
  if leave_is is distinct from 'c16ad3b4b683546fd1c2b207474799f7' and leave_is is distinct from 'ef91aa58081de0b753f90540d1a98c37' then
    raise exception 'Migration 150 stopped before changing anything: leave_hit changed since migration 43. This file must be brought up to date with that change first.';
  end if;
end $$;

-- ------------------------------------------------------------ 1. calling off
-- After the poster calls a hit off: a note to everyone in it, and a line in
-- its chat. Only for a hit not yet played (calling off an old one, an hour
-- past its start, tells nobody). Neither can stop the hit being called off:
-- a note or a line that cannot be written is left out (file_notification
-- already leaves out anyone who blocked the poster). The line is the
-- poster's, like every event line (post_group_event, migration 54), written
-- the same switch-on, write, switch-off way; its `event` says which hit, so
-- the app can open this chat from the note.
create or replace function public.tell_hit_called_off()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  words text;
  who uuid;
  first_name text;
begin
  if new.starts_at < now() - interval '1 hour' then return new; end if;
  words := public.hit_when(new.starts_at, new.place) || ' · ' || coalesce(new.place->>'name', 'a court');
  for who in select j.user_id from public.hit_joins j where j.hit_id = new.id and j.user_id <> new.author_id loop
    begin
      perform public.file_notification(who, new.author_id, 'hit-called-off', new.id::text, 'hit-request', words, true);
    exception when others then
      null;
    end;
  end loop;
  if new.conversation_id is not null then
    begin
      first_name := coalesce((select coalesce(nullif(split_part(btrim(p.name), ' ', 1), ''), p.handle) from public.profiles p where p.id = new.author_id), 'Someone');
      perform set_config('courtside.group_event', 'on', true);
      insert into public.messages (conversation_id, sender_id, body, kind, event)
        values (new.conversation_id, new.author_id, left(first_name || ' called off this hit', 4000), 'system',
                jsonb_build_object('type', 'called-off', 'hit', new.id::text));
      perform set_config('courtside.group_event', 'off', true);
    exception when others then
      perform set_config('courtside.group_event', 'off', true);
    end;
  end if;
  return new;
end $$;
revoke all on function public.tell_hit_called_off() from public, anon, authenticated;

drop trigger if exists tell_hit_called_off on public.hit_requests;
create trigger tell_hit_called_off after update of cancelled on public.hit_requests
  for each row when (new.cancelled and not old.cancelled)
  execute function public.tell_hit_called_off();

-- ------------------------------------------------------------ 2. Can't make it
-- Same name and input as migration 43 (the app already knows it). Not in the
-- hit, or the hit is gone: nothing to do (a second tap, a retry). The chat
-- goes first, through leave_group itself, so "Priya left" and everything else
-- leaving does happen exactly as it does from the chat (it gives the spot
-- back too); then the spot, for a hit with no chat; then the poster's note,
-- while the hit is still on and ahead. The hit is not locked here: leave_group
-- locks the chat and then the hit (through the join count, migration 95), and
-- taking them in that same order keeps two people leaving at once from
-- waiting on each other.
create or replace function public.leave_hit(hit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  h public.hit_requests;
  open_now int;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into h from public.hit_requests where id = hit;
  if not found then return; end if;
  if not exists (select 1 from public.hit_joins where hit_id = hit and user_id = me) then return; end if;
  if h.conversation_id is not null
     and exists (select 1 from public.conversation_members where conversation_id = h.conversation_id and user_id = me) then
    perform public.leave_group(h.conversation_id);
  end if;
  delete from public.hit_joins where hit_id = hit and user_id = me;
  if not h.cancelled and h.starts_at > now() then
    select greatest(0, h.spots - count(*))::int into open_now from public.hit_joins where hit_id = hit;
    -- Once in a quarter of an hour for the same words: in and out again and again is one note, not a stream.
    perform public.file_notification(h.author_id, me, 'hit-left', hit::text, 'hit-request',
      public.hit_when(h.starts_at, h.place) || ' · ' || open_now || case when open_now = 1 then ' spot' else ' spots' end || ' open again',
      true, interval '15 minutes');
  end if;
end $$;
revoke all on function public.leave_hit(uuid) from public, anon;
grant execute on function public.leave_hit(uuid) to authenticated;

-- ------------------------------------------------------------ 3. the phone alerts
-- Migration 146's push_for_notification with one block added, after "posted",
-- for the two new notes: "Sam called off the hit today at 8:00 AM · Alder
-- Park" (opening the hit's chat when it has one), and "Priya can't make it
-- today at 8:00 AM · 1 spot open again" (opening the hit). The words are the
-- note's own, so a teen's note that file_notification left without words
-- (124) sends none either.
CREATE OR REPLACE FUNCTION public.push_for_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  who text;
  what text;
  link text;
  likes_on boolean := true;
  coach_on boolean := true;
  hit_chat uuid;
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
    select coalesce(push_likes, true) into likes_on from public.user_state where user_id = new.user_id;
    if likes_on is not false then
      perform public.send_push(new.user_id, 'Your post is taking off', 'It just passed ' || coalesce(new.preview, 'a milestone') || '.', '/post/' || new.target_id);
    end if;
    return new;
  end if;
  if new.kind = 'posted' or new.user_id = new.actor_id then return new; end if;
  -- A hit you were in, called off; someone in yours who can't make it (migration 150).
  if new.kind in ('hit-called-off', 'hit-left') then
    select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
    link := '/hit-request/' || new.target_id;
    if new.kind = 'hit-called-off' and new.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select h.conversation_id into hit_chat from public.hit_requests h where h.id = new.target_id::uuid;
      if hit_chat is not null then link := '/messages/' || hit_chat; end if;
    end if;
    perform public.send_push(new.user_id, 'CourtSide',
      coalesce(who, 'Someone') || case when new.kind = 'hit-called-off' then ' called off the hit' else ' can’t make it' end
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
  if new.kind in ('coach-reply', 'coach-answer') and coach_on is false then return new; end if;
  -- "Sam just joined CourtSide near you" has its own switch (migration 146). The row
  -- still lands in Notifications; only the phone alert is left out.
  if new.kind = 'joined' and exists (select 1 from public.user_state where user_id = new.user_id and push_joined is false) then return new; end if;
  select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
  what := case new.kind
    when 'like' then 'liked your ' || case new.target_kind when 'hit' then 'instant' when 'question' then 'thread' else 'post' end
    when 'comment' then 'commented on your ' || case new.target_kind when 'hit' then 'instant' else 'post' end
    when 'comment-reply' then 'replied to your comment'
    when 'answer' then 'replied to your thread'
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
    when 'joined' then 'just joined CourtSide near you'
    when 'hit-join' then 'is in for your hit'
    else 'did something on CourtSide' end;
  link := case
    when new.kind in ('follow', 'follow-request', 'follow-accepted', 'joined') then '/user/' || new.actor_id
    when new.target_kind = 'coaching-request' then '/coach-request/' || new.target_id
    when new.target_kind = 'post' then '/post/' || new.target_id
    when new.target_kind = 'hit' then '/hits/' || new.target_id
    when new.target_kind = 'question' then '/question/' || new.target_id
    when new.target_kind = 'hit-request' then '/hit-request/' || new.target_id
    else '/notifications' end;
  -- Two lines like other apps (migration 86): the app name on top, what happened underneath.
  perform public.send_push(new.user_id, 'CourtSide',
    coalesce(who, 'Someone') || ' ' || what || coalesce(': ' || nullif(btrim(new.preview), ''), ''), link);
  return new;
end $function$;

commit;

-- Checks (optional), each expecting one row or true:
-- (a) the trigger is on:
--   select tgname from pg_trigger where tgrelid = 'public.hit_requests'::regclass and tgname = 'tell_hit_called_off';
-- (b) both functions are this file's:
--   select md5(prosrc) = 'd0277dc99cebf192e3bfd0659ee15e80' from pg_proc where proname = 'push_for_notification';
--   select md5(prosrc) = 'ef91aa58081de0b753f90540d1a98c37' from pg_proc where proname = 'leave_hit';
