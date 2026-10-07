-- CourtSide · migration 20261006000146: two alerts get their own switch
-- (App Store review audit, Oct 6; Apple's guideline 4.5.4 wants a way to turn
-- alerts off inside the app). Before, the only way to stop either was to turn
-- off every CourtSide alert in the iPhone's Settings.
--
--   1. user_state.push_joined: the "Players joining near you" switch in
--      Settings → Notifications. Off, "Sam just joined CourtSide near you"
--      (notify_joined_nearby, adults only) still lands in Notifications but
--      sends no phone alert. push_for_notification (migration 86's, with one
--      line added) checks it.
--   2. user_state.push_streak: the "Streak reminders" switch. The 7pm "Keep
--      your streak" reminder is set on the phone itself (no server); the
--      server only keeps the choice, so it follows you to another phone.
--
-- Both start on, as every other alert switch does. The app works without this
-- file: it shows the "Players joining near you" switch only once the column
-- is there, and keeps the streak switch's choice on the phone until then.
--
-- Safe to run more than once. Stops before changing anything if
-- push_for_notification has changed since migration 86.

begin;

do $$
declare
  now_is text;
begin
  if to_regclass('public.user_state') is null or to_regclass('public.notifications') is null then
    raise exception 'Migration 146 stopped before changing anything: the user_state and notifications tables have to exist first.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name in ('push_joined', 'push_streak') and data_type <> 'boolean') then
    raise exception 'Migration 146 stopped before changing anything: user_state already has a push_joined or push_streak column that is not a yes/no.';
  end if;
  select md5(p.prosrc) into now_is from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'push_for_notification';
  -- Migration 86's version, or this file's own (run again).
  if now_is is distinct from '25a89f82aac8a048ab4104b40c7ee5cd' and now_is is distinct from 'dd45c6721116fa907f9e4839a77f6d53' then
    raise exception 'Migration 146 stopped before changing anything: push_for_notification changed since migration 86 (Oct 4). This file must be brought up to date with that change first.';
  end if;
end $$;

alter table public.user_state add column if not exists push_joined boolean not null default true;
alter table public.user_state add column if not exists push_streak boolean not null default true;

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

-- Check (optional): both columns are there, and the function has the new line.
-- select column_name from information_schema.columns where table_name = 'user_state' and column_name in ('push_joined', 'push_streak');
-- select md5(prosrc) = 'dd45c6721116fa907f9e4839a77f6d53' from pg_proc where proname = 'push_for_notification';
