-- CourtSide · migration 20261008000153: the word filter reaches the Gear bag,
-- and a reply in someone else's thread is worded as one on the phone (the
-- pre-submit sweep, Oct 8).
--
-- NOT APPLIED — the lead applies it. Run it in the Supabase SQL editor as one
-- piece. It is all-or-nothing: if the check below fails it stops, and nothing
-- at all changes. Safe to run more than once.
--
-- In plain words, what changes:
--
--   1. The Gear bag (Profile → Tennis profile → Gear bag: racket, strings,
--      tension, shoes) shows on a public Tennis profile, but the word filter
--      never looked at it: it is kept inside the profile's settings (the
--      profiles.profile column), and the filter only ran when the handle,
--      name, bio or town changed. Now saving the Gear bag with a severe word
--      (a slur, a threat) is refused like a bio is ('blocked_words'), and the
--      app says so with the note it already shows for a bio. Nothing already
--      saved is touched; a bag is only checked when it changes.
--   2. The phone alert for a reply in a thread said "Sam replied to your
--      thread" to everyone it went to, including people who only replied in
--      it and do not own it. Now they read "Sam replied to your reply", the
--      way the Notifications page already says it.
--
-- What changes, by name:
--   words_block_profile (migration 117's, word for word, one block added at
--     the end): also refuses a changed profile->'gear' with a severe word.
--   the words_block trigger on profiles: also fires on the profile column.
--   push_for_notification (migration 151's, word for word, one line changed):
--     'answer' says "replied to your reply" unless the thread is yours.
--
-- Stops without changing anything if either function has changed since the
-- versions this file was written against (117 and 151, as live on Oct 8).

begin;

do $$
declare
  words_is text;
  push_is text;
begin
  if to_regprocedure('public.words_found(text, text)') is null or to_regprocedure('public.words_in_name(text)') is null
     or to_regprocedure('public.send_push(uuid, text, text, text)') is null or to_regclass('public.questions') is null then
    raise exception 'Migration 153 stopped before changing anything: it needs words_found and words_in_name (117), send_push and the questions table.';
  end if;
  select md5(p.prosrc) into words_is from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'words_block_profile';
  -- Migration 117's version, or this file's own (run again).
  if words_is is distinct from 'f5362a438d23564c85289e7c43cc0262' and words_is is distinct from '93c79545677dbfd9285fc899075b2711' then
    raise exception 'Migration 153 stopped before changing anything: words_block_profile changed since migration 117. This file must be brought up to date with that change first.';
  end if;
  select md5(p.prosrc) into push_is from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'push_for_notification';
  -- Migration 151's version, or this file's own (run again).
  if push_is is distinct from '587617c254416c8314856f636e33bc3c' and push_is is distinct from 'ed202ec0226addae82c3534a680b7e6b' then
    raise exception 'Migration 153 stopped before changing anything: push_for_notification changed since migration 151. This file must be brought up to date with that change first.';
  end if;
end $$;

-- ------------------------------------------------------------ 1. the Gear bag
CREATE OR REPLACE FUNCTION public.words_block_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fresh text;
begin
  if auth.uid() is null then
    if tg_op <> 'INSERT' then return new; end if;
    if public.words_in_name(new.handle) then
      loop
        fresh := 'player' || lpad((floor(random() * 1000000))::int::text, 6, '0');
        exit when not exists (select 1 from public.profiles where handle = fresh);
      end loop;
      new.handle := fresh;
    end if;
    if public.words_in_name(new.name) then new.name := 'Player'; end if;
    if public.words_found(new.bio, 'severe') then new.bio := ''; end if;
    if public.words_found(new.location, 'severe') then new.location := ''; end if;
    return new;
  end if;
  if (tg_op = 'INSERT' or new.handle is distinct from old.handle) and public.words_in_name(new.handle) then
    raise exception 'blocked_words' using hint = 'This includes words that break CourtSide''s rules.';
  end if;
  if (tg_op = 'INSERT' or new.name is distinct from old.name) and public.words_in_name(new.name) then
    raise exception 'blocked_words' using hint = 'This includes words that break CourtSide''s rules.';
  end if;
  if (tg_op = 'INSERT' or new.bio is distinct from old.bio) and public.words_found(new.bio, 'severe') then
    raise exception 'blocked_words' using hint = 'This includes words that break CourtSide''s rules.';
  end if;
  if (tg_op = 'INSERT' or new.location is distinct from old.location) and public.words_found(new.location, 'severe') then
    raise exception 'blocked_words' using hint = 'This includes words that break CourtSide''s rules.';
  end if;
  -- The Gear bag (migration 153): shown on the public Tennis profile, kept in the profile column.
  if (tg_op = 'INSERT' or new.profile -> 'gear' is distinct from old.profile -> 'gear')
     and jsonb_typeof(new.profile -> 'gear') = 'object'
     and (public.words_found(new.profile -> 'gear' ->> 'racket', 'severe')
       or public.words_found(new.profile -> 'gear' ->> 'strings', 'severe')
       or public.words_found(new.profile -> 'gear' ->> 'tension', 'severe')
       or public.words_found(new.profile -> 'gear' ->> 'shoes', 'severe')) then
    raise exception 'blocked_words' using hint = 'This includes words that break CourtSide''s rules.';
  end if;
  return new;
end $function$;
revoke all on function public.words_block_profile() from public, anon, authenticated;
drop trigger if exists words_block on public.profiles;
create trigger words_block before insert or update of handle, name, bio, location, profile on public.profiles
  for each row execute function public.words_block_profile();

-- ------------------------------------------------------------ 2. the phone alert
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
  -- A hit you were in, called off; someone in yours who can't make it (migration 151).
  if new.kind in ('hit-called-off', 'hit-left') then
    select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
    link := '/hit-request/' || new.target_id;
    if new.kind = 'hit-called-off' and new.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select h.conversation_id into hit_chat from public.hit_requests h where h.id = new.target_id::uuid;
      if hit_chat is not null and exists (select 1 from public.conversation_members m where m.conversation_id = hit_chat and m.user_id = new.user_id) then
        link := '/messages/' || hit_chat;
      end if;
    end if;
    -- chr(8217) is the curly apostrophe, written so it survives any copy and paste.
    perform public.send_push(new.user_id, 'CourtSide',
      coalesce(who, 'Someone') || case when new.kind = 'hit-called-off' then ' called off the hit' else ' can' || chr(8217) || 't make it' end
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
    -- A reply in someone else's thread answers your reply there, not your thread (migration 153, as the Notifications page says it).
    when 'answer' then case when exists (select 1 from public.questions q where q.id::text = new.target_id and q.author_id = new.user_id) then 'replied to your thread' else 'replied to your reply' end
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
-- (a) the trigger also fires on the profile column:
--   select pg_get_triggerdef(oid) like '%location, profile ON%' from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'words_block';
-- (b) both functions are this file's:
--   select md5(prosrc) = '93c79545677dbfd9285fc899075b2711' from pg_proc where proname = 'words_block_profile';
--   select md5(prosrc) = 'ed202ec0226addae82c3534a680b7e6b' from pg_proc where proname = 'push_for_notification';
