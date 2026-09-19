-- Notifications are written by the database, never by a phone.
--
-- Until now each phone filed its own notifications ("tell William that Sam
-- liked his clip"), and the database only checked that the note was signed
-- with the sender's own name. Anyone could skip the app and send any words
-- to anyone. From here on:
--   * phones cannot write notifications at all;
--   * the database files one itself, at the moment the real thing is saved:
--     a like, a comment, a reply, a follow, a tag, a share;
--   * the words come from what was actually saved, never from the sender;
--   * the same like, follow or tag does not notify twice;
--   * someone you blocked never reaches your notifications;
--   * one account can cause at most 30 notifications a minute.
-- Push alerts keep working unchanged: they fire from each filed notification.
--
-- Needs migrations 02 (follow requests), 06 (messages), 08 (notifications,
-- threads, coaching) and 14 (push alerts). Safe to run more than once.

-- ------------------------------------------------------------ phones may not write
drop policy if exists "notify as the one who acted" on public.notifications;

create index if not exists notifications_actor_idx on public.notifications (actor_id, created_at desc);
create index if not exists notifications_same_idx on public.notifications (user_id, actor_id, kind, target_id);

-- ------------------------------------------------------------ the one way in
-- Files one notification, or quietly does nothing when it should not exist:
-- to yourself, to someone who blocked you, a repeat, or past the rate limit.
-- `again_after` null means "once ever"; an interval allows a repeat after it.
create or replace function public.file_notification(
  recipient uuid, actor uuid, what text, target text, target_type text, words text,
  once boolean default true, again_after interval default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  flat text;
begin
  if recipient is null or actor is null or recipient = actor or target is null then return; end if;
  if not exists (select 1 from public.profiles where id = recipient) then return; end if;
  if exists (select 1 from public.user_state where user_id = recipient and actor::text = any(blocked_ids)) then return; end if;
  flat := nullif(btrim(regexp_replace(coalesce(words, ''), '\s+', ' ', 'g')), '');
  if flat is not null and char_length(flat) > 80 then flat := left(flat, 79) || '…'; end if;
  if once and exists (
    select 1 from public.notifications
    where user_id = recipient and actor_id = actor and kind = what and target_id = target
      and target_kind = target_type and preview is not distinct from flat
      and (again_after is null or created_at > now() - again_after)
  ) then return; end if;
  if (select count(*) from public.notifications where actor_id = actor and created_at > now() - interval '1 minute') >= 30 then return; end if;
  insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
    values (recipient, actor, what, target, target_type, flat);
end $$;
revoke all on function public.file_notification(uuid, uuid, text, text, text, text, boolean, interval) from public, anon, authenticated;

-- Everyone written as @handle in some words is told once: never the writer,
-- never the one person who is already being told about it.
create or replace function public.file_mentions(words text, actor uuid, target text, target_type text, already_told uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  wanted text;
  who uuid;
begin
  for wanted in
    select distinct lower(r.parts[1]) from regexp_matches(coalesce(words, ''), '@([A-Za-z0-9_]{2,24})', 'g') as r(parts)
  loop
    select id into who from public.profiles where handle = wanted;
    if who is not null and who <> actor and who is distinct from already_told then
      perform public.file_notification(who, actor, 'tag', target, target_type, words);
    end if;
  end loop;
end $$;
revoke all on function public.file_mentions(text, uuid, text, text, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ likes
create or replace function public.notify_post_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  words text;
begin
  select author_id, body into owner, words from public.posts where id = new.post_id;
  perform public.file_notification(owner, new.user_id, 'like', new.post_id::text, 'post', words);
  return new;
end $$;
drop trigger if exists notify_post_like on public.post_likes;
create trigger notify_post_like after insert on public.post_likes for each row execute function public.notify_post_like();

create or replace function public.notify_hit_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  words text;
begin
  select author_id, coalesce(nullif(btrim(caption), ''), 'your hit') into owner, words from public.stories where id = new.story_id;
  perform public.file_notification(owner, new.user_id, 'like', new.story_id::text, 'hit', words);
  return new;
end $$;
drop trigger if exists notify_hit_like on public.story_likes;
create trigger notify_hit_like after insert on public.story_likes for each row execute function public.notify_hit_like();

-- A like on a comment tells the comment's writer, and opens the post it is on.
create or replace function public.notify_comment_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  words text;
  on_post uuid;
begin
  select author_id, body, post_id into owner, words, on_post from public.comments where id = new.comment_id;
  perform public.file_notification(owner, new.user_id, 'like', on_post::text, 'post', words);
  return new;
end $$;
drop trigger if exists notify_comment_like on public.comment_likes;
create trigger notify_comment_like after insert on public.comment_likes for each row execute function public.notify_comment_like();

create or replace function public.notify_hit_comment_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  words text;
  on_hit uuid;
begin
  select author_id, body, story_id into owner, words, on_hit from public.story_comments where id = new.comment_id;
  perform public.file_notification(owner, new.user_id, 'like', on_hit::text, 'hit', words);
  return new;
end $$;
drop trigger if exists notify_hit_comment_like on public.story_comment_likes;
create trigger notify_hit_comment_like after insert on public.story_comment_likes for each row execute function public.notify_hit_comment_like();

-- ------------------------------------------------------------ comments
-- Every real comment tells the post's owner (with its own words), and
-- anyone @mentioned in it.
create or replace function public.notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  select author_id into owner from public.posts where id = new.post_id;
  perform public.file_notification(owner, new.author_id, 'comment', new.post_id::text, 'post', new.body, false);
  perform public.file_mentions(new.body, new.author_id, new.post_id::text, 'post', owner);
  return new;
end $$;
drop trigger if exists notify_comment on public.comments;
create trigger notify_comment after insert on public.comments for each row execute function public.notify_comment();

create or replace function public.notify_hit_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  select author_id into owner from public.stories where id = new.story_id;
  perform public.file_notification(owner, new.author_id, 'comment', new.story_id::text, 'hit', new.body, false);
  return new;
end $$;
drop trigger if exists notify_hit_comment on public.story_comments;
create trigger notify_hit_comment after insert on public.story_comments for each row execute function public.notify_hit_comment();

-- ------------------------------------------------------------ threads and coaching
-- A reply tells the thread's author; a reply under someone else's reply
-- tells that person too; and anyone @mentioned is told.
create or replace function public.notify_answer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  asker uuid;
  replied_to uuid;
begin
  select author_id into asker from public.questions where id = new.question_id;
  perform public.file_notification(asker, new.author_id, 'answer', new.question_id::text, 'question', new.body, false);
  if new.parent_answer_id is not null then
    select author_id into replied_to from public.answers where id = new.parent_answer_id;
    if replied_to is distinct from asker then
      perform public.file_notification(replied_to, new.author_id, 'answer', new.question_id::text, 'question', new.body, false);
    end if;
  end if;
  perform public.file_mentions(new.body, new.author_id, new.question_id::text, 'question', asker);
  return new;
end $$;
drop trigger if exists notify_answer on public.answers;
create trigger notify_answer after insert on public.answers for each row execute function public.notify_answer();

create or replace function public.notify_coach_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  asker uuid;
begin
  select author_id into asker from public.coach_questions where id = new.question_id;
  perform public.file_notification(asker, new.coach_user_id, 'coach-reply', new.question_id::text, 'coach-question', new.body, false);
  return new;
end $$;
drop trigger if exists notify_coach_reply on public.coach_replies;
create trigger notify_coach_reply after insert on public.coach_replies for each row execute function public.notify_coach_reply();

-- "Found your reply helpful": whoever was just added to the reply's helpful list.
create or replace function public.notify_helpful()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  marker uuid;
begin
  for marker in select unnest(new.helpful_by) except select unnest(old.helpful_by) loop
    perform public.file_notification(new.coach_user_id, marker, 'helpful', new.question_id::text, 'coach-question', new.body);
  end loop;
  return new;
end $$;
drop trigger if exists notify_helpful on public.coach_replies;
create trigger notify_helpful after update of helpful_by on public.coach_replies for each row execute function public.notify_helpful();

-- ------------------------------------------------------------ tags
-- Tagged players and @mentions in a caption are told when the post goes up,
-- and anyone added later when it is edited.
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
    perform public.file_notification(tagged, new.author_id, 'tag', new.id::text, 'post', words);
  end loop;
  if body_changed then
    perform public.file_mentions(new.body, new.author_id, new.id::text, 'post', null);
  end if;
  return new;
end $$;
drop trigger if exists notify_post_tags on public.posts;
create trigger notify_post_tags after insert or update of tagged_user_ids, body on public.posts for each row execute function public.notify_post_tags();

-- ------------------------------------------------------------ shares
-- A post or thread sent in a chat tells its author (once an hour per sender).
create or replace function public.notify_share()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  words text;
begin
  if new.kind not in ('post', 'question') or new.shared_id is null
     or new.shared_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;
  if new.kind = 'post' then
    select author_id, body into owner, words from public.posts where id = new.shared_id::uuid;
    perform public.file_notification(owner, new.sender_id, 'share', new.shared_id, 'post', words, true, interval '1 hour');
  else
    select author_id, title into owner, words from public.questions where id = new.shared_id::uuid;
    perform public.file_notification(owner, new.sender_id, 'share', new.shared_id, 'question', words, true, interval '1 hour');
  end if;
  return new;
end $$;
drop trigger if exists notify_share on public.messages;
create trigger notify_share after insert on public.messages for each row execute function public.notify_share();

-- ------------------------------------------------------------ follows
-- An ordinary follow tells the person followed (again only after a week, so
-- unfollowing and following back cannot be used to buzz someone). A follow
-- made by accepting a request tells the one who asked, and the "asked to
-- follow you" row of the one who accepted becomes a read "started following".
create or replace function public.notify_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not distinct from new.following_id then
    update public.notifications set kind = 'follow', read = true
      where user_id = new.following_id and actor_id = new.follower_id and kind = 'follow-request';
    perform public.file_notification(new.follower_id, new.following_id, 'follow-accepted', new.following_id::text, 'post', null, true, interval '7 days');
  else
    perform public.file_notification(new.following_id, new.follower_id, 'follow', new.follower_id::text, 'post', null, true, interval '7 days');
  end if;
  return new;
end $$;
drop trigger if exists notify_follow on public.follows;
create trigger notify_follow after insert on public.follows for each row execute function public.notify_follow();

create or replace function public.notify_follow_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.file_notification(new.target_id, new.requester_id, 'follow-request', new.requester_id::text, 'post', null);
  return new;
end $$;
drop trigger if exists notify_follow_request on public.follow_requests;
create trigger notify_follow_request after insert on public.follow_requests for each row execute function public.notify_follow_request();

-- A request withdrawn or turned down takes its "asked to follow you" row with it
-- (an accepted one has already become "started following" above).
create or replace function public.clear_follow_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications
    where user_id = old.target_id and actor_id = old.requester_id and kind = 'follow-request';
  return old;
end $$;
drop trigger if exists clear_follow_request on public.follow_requests;
create trigger clear_follow_request after delete on public.follow_requests for each row execute function public.clear_follow_request();
