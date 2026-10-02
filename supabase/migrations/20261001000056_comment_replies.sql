-- 56: replies to comments, the way Instagram has them.
--
-- Until now every comment on a post or an Instant stood on its own. From here:
--   * a comment can answer another one. It is stored with the comment it
--     belongs under (parent_id, always a top-level comment: Instagram keeps
--     one level, so a reply to a reply joins the same thread) and the one
--     actually answered (reply_to_id, so the right person is told);
--   * the database checks the reply: its parent must be on the same post or
--     Instant, and someone blocked with the person they are answering (or
--     with whoever started the thread) cannot reply there;
--   * deleting a comment takes its replies with it, as on Instagram: a reply
--     that says "@sam fair point" means nothing once Sam's comment is gone;
--   * the person answered is told "replied to your comment", in the app and
--     on their phone. The post's owner is still told about the comment (unless
--     they are the one answered), and an @mention never tells the same
--     person twice;
--   * comments arrive live, so a reply shows up in an open comment sheet
--     without pulling to refresh.
-- Replies are ordinary rows of the same two tables, under the same rules
-- (hidden between blocked people, only on posts and Instants you can see,
-- written only as yourself). Two of those rules are tightened:
--   * a thread started by someone you are blocked with is hidden whole, its
--     replies too (before, other people's replies under it still came back,
--     so the comment count showed more than the list);
--   * comments can only be added to a post or Instant you can open now: not
--     an archived, removed or expired one.
-- Likes on replies use the same like tables and notifications as any comment.
--
-- Needs 18 (notifications), 21 (blocking), 36 (security fixes), 53 (push
-- for notifications). Safe to run more than once.

-- ============================================================ 1. where a reply belongs
alter table public.comments add column if not exists parent_id uuid references public.comments (id) on delete cascade;
alter table public.comments add column if not exists reply_to_id uuid references public.comments (id) on delete set null;
alter table public.story_comments add column if not exists parent_id uuid references public.story_comments (id) on delete cascade;
alter table public.story_comments add column if not exists reply_to_id uuid references public.story_comments (id) on delete set null;

-- A thread's replies in order, and fast cascades when a comment goes.
create index if not exists comments_parent_idx on public.comments (parent_id, created_at) where parent_id is not null;
create index if not exists story_comments_parent_idx on public.story_comments (parent_id, created_at) where parent_id is not null;
create index if not exists comments_reply_to_idx on public.comments (reply_to_id) where reply_to_id is not null;
create index if not exists story_comments_reply_to_idx on public.story_comments (reply_to_id) where reply_to_id is not null;

-- ============================================================ 1b. who can read and add comments
-- Reading: as before (not written by someone you are blocked with, on a post
-- or Instant you can see), and not in a thread started by someone you are
-- blocked with, so a hidden comment never leaves its replies behind.
drop policy if exists "comments are public" on public.comments;
create policy "comments are public" on public.comments for select
  using (not public.blocked_with(author_id)
    and (parent_id is null or not public.blocked_with(public.author_of_comment(parent_id)))
    and exists (select 1 from public.posts p where p.id = comments.post_id));
drop policy if exists "hit comments are public" on public.story_comments;
create policy "hit comments are public" on public.story_comments for select
  using (not public.blocked_with(author_id)
    and (parent_id is null or not public.blocked_with(public.author_of_hit_comment(parent_id)))
    and exists (select 1 from public.stories s where s.id = story_comments.story_id));

-- Adding: as before (as yourself, where you may see the owner, not blocked
-- with them), and only on a post or Instant you can open right now, so nobody
-- is told about a reply on something they can no longer open.
drop policy if exists "comment as yourself" on public.comments;
create policy "comment as yourself" on public.comments for insert
  with check (auth.uid() = author_id
    and public.can_view(public.author_of_post(post_id))
    and not public.blocked_with(public.author_of_post(post_id))
    and exists (select 1 from public.posts p where p.id = comments.post_id));
drop policy if exists "comment on hits as yourself" on public.story_comments;
create policy "comment on hits as yourself" on public.story_comments for insert
  with check (auth.uid() = author_id
    and public.can_view(public.author_of_hit(story_id))
    and not public.blocked_with(public.author_of_hit(story_id))
    and exists (select 1 from public.stories s where s.id = story_comments.story_id));

-- ============================================================ 2. checking a reply as it is saved
-- Runs before the row is saved, and before the access rules look at it, so
-- the rules see the corrected row. Reads the parent directly (security
-- definer): a rule cannot rely on reading through the same hiding it decides.
--   * no parent: a top-level comment, nothing to check;
--   * the parent must exist and be on the same post, or the save is refused;
--   * a reply to a reply is moved under that reply's own parent (one level);
--   * reply_to_id must be in the same thread; otherwise it is the comment
--     that was replied to;
--   * blocked either way with the one answered, or with the thread's starter: refused.
-- A row not written as yourself is left alone here: the access rule refuses
-- it anyway, and checking blocks first would tell a stranger who has blocked whom.
create or replace function public.normalize_comment_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  given_parent uuid := new.parent_id;
  parent_post uuid;
  parent_parent uuid;
  top_author uuid;
  answered uuid;
  answered_thread uuid;
  answered_author uuid;
begin
  if given_parent is null then
    new.reply_to_id := null;
    return new;
  end if;
  -- Not written as yourself: left for the access rule to refuse, so the
  -- answer never says whether two other people are blocked.
  if auth.uid() is not null and new.author_id is distinct from auth.uid() then
    return new;
  end if;
  select post_id, parent_id into parent_post, parent_parent from public.comments where id = given_parent;
  if not found or parent_post is distinct from new.post_id then
    raise exception 'reply_parent_missing' using errcode = '23503', detail = 'The comment being replied to is not on this post.';
  end if;
  new.parent_id := coalesce(parent_parent, given_parent);
  answered := coalesce(new.reply_to_id, given_parent);
  select coalesce(parent_id, id), author_id into answered_thread, answered_author from public.comments where id = answered;
  if answered_thread is distinct from new.parent_id then
    answered := given_parent;
    select author_id into answered_author from public.comments where id = answered;
  end if;
  new.reply_to_id := answered;
  select author_id into top_author from public.comments where id = new.parent_id;
  if public.is_blocked_between(new.author_id, top_author) or public.is_blocked_between(new.author_id, answered_author) then
    raise exception 'reply_blocked' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists normalize_comment_reply on public.comments;
create trigger normalize_comment_reply before insert on public.comments
  for each row execute function public.normalize_comment_reply();

create or replace function public.normalize_hit_comment_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  given_parent uuid := new.parent_id;
  parent_hit uuid;
  parent_parent uuid;
  top_author uuid;
  answered uuid;
  answered_thread uuid;
  answered_author uuid;
begin
  if given_parent is null then
    new.reply_to_id := null;
    return new;
  end if;
  -- Not written as yourself: left for the access rule to refuse, so the
  -- answer never says whether two other people are blocked.
  if auth.uid() is not null and new.author_id is distinct from auth.uid() then
    return new;
  end if;
  select story_id, parent_id into parent_hit, parent_parent from public.story_comments where id = given_parent;
  if not found or parent_hit is distinct from new.story_id then
    raise exception 'reply_parent_missing' using errcode = '23503', detail = 'The comment being replied to is not on this instant.';
  end if;
  new.parent_id := coalesce(parent_parent, given_parent);
  answered := coalesce(new.reply_to_id, given_parent);
  select coalesce(parent_id, id), author_id into answered_thread, answered_author from public.story_comments where id = answered;
  if answered_thread is distinct from new.parent_id then
    answered := given_parent;
    select author_id into answered_author from public.story_comments where id = answered;
  end if;
  new.reply_to_id := answered;
  select author_id into top_author from public.story_comments where id = new.parent_id;
  if public.is_blocked_between(new.author_id, top_author) or public.is_blocked_between(new.author_id, answered_author) then
    raise exception 'reply_blocked' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists normalize_hit_comment_reply on public.story_comments;
create trigger normalize_hit_comment_reply before insert on public.story_comments
  for each row execute function public.normalize_hit_comment_reply();

revoke all on function public.normalize_comment_reply() from public, anon, authenticated;
revoke all on function public.normalize_hit_comment_reply() from public, anon, authenticated;

-- ============================================================ 3. who is told
-- Everyone written as @handle in some words is told once, except the writer
-- and anyone in `skip` (already told about this comment another way).
-- A new name rather than a second file_mentions, so the existing callers
-- (threads, captions) are untouched and no function name exists twice.
create or replace function public.file_mentions_except(words text, actor uuid, target text, target_type text, skip uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  wanted text;
  who uuid;
begin
  for wanted in
    select distinct lower(r.parts[1]) from regexp_matches(coalesce(words, ''), '@([A-Za-z0-9_]{2,24})', 'g') as r(parts)
  loop
    who := null;
    select id into who from public.profiles where handle = wanted;
    -- coalesce: `skip` can hold a null (a plain comment answers nobody), and
    -- "x = any(array[owner, null])" is null, not false, for everyone else.
    if who is not null and who <> actor and not coalesce(who = any(skip), false) then
      perform public.file_notification(who, actor, 'tag', target, target_type, words);
    end if;
  end loop;
end $$;
revoke all on function public.file_mentions_except(text, uuid, text, text, uuid[]) from public, anon, authenticated;

-- A comment tells the post's owner and anyone @mentioned, as before. A reply
-- also tells the one answered ("replied to your comment"); when that is the
-- owner, they get the reply line only, and the "@handle" that starts a reply
-- never tags them on top of it.
create or replace function public.notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  replied_to uuid;
begin
  select author_id into owner from public.posts where id = new.post_id;
  if new.parent_id is not null then
    select author_id into replied_to from public.comments where id = coalesce(new.reply_to_id, new.parent_id);
    perform public.file_notification(replied_to, new.author_id, 'comment-reply', new.post_id::text, 'post', new.body, false);
  end if;
  if owner is distinct from replied_to then
    perform public.file_notification(owner, new.author_id, 'comment', new.post_id::text, 'post', new.body, false);
  end if;
  perform public.file_mentions_except(new.body, new.author_id, new.post_id::text, 'post', array[owner, replied_to]);
  return new;
end $$;
drop trigger if exists notify_comment on public.comments;
create trigger notify_comment after insert on public.comments for each row execute function public.notify_comment();

-- The same on an Instant (which, as before, does not tag @mentions).
create or replace function public.notify_hit_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  replied_to uuid;
begin
  select author_id into owner from public.stories where id = new.story_id;
  if new.parent_id is not null then
    select author_id into replied_to from public.story_comments where id = coalesce(new.reply_to_id, new.parent_id);
    perform public.file_notification(replied_to, new.author_id, 'comment-reply', new.story_id::text, 'hit', new.body, false);
  end if;
  if owner is distinct from replied_to then
    perform public.file_notification(owner, new.author_id, 'comment', new.story_id::text, 'hit', new.body, false);
  end if;
  return new;
end $$;
drop trigger if exists notify_hit_comment on public.story_comments;
create trigger notify_hit_comment after insert on public.story_comments for each row execute function public.notify_hit_comment();

-- ============================================================ 4. phone alerts know the new kind
-- Migration 53's version, with one line added: 'comment-reply'. The alert
-- opens the post or Instant, as a comment's does.
create or replace function public.push_for_notification()
returns trigger language plpgsql security definer set search_path = public as $$
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
  if new.kind = 'report' then
    perform public.send_push(new.user_id, 'New report', coalesce(new.preview, 'Someone sent a report'), '/admin-reports');
    return new;
  end if;
  select coalesce(push_likes, true), coalesce(push_coach, true) into likes_on, coach_on from public.user_state where user_id = new.user_id;
  if new.kind in ('like', 'upvote', 'upvote-reply') and likes_on is false then return new; end if;
  if new.kind in ('coach-reply', 'coach-answer') and coach_on is false then return new; end if;
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
  perform public.send_push(new.user_id, coalesce(who, 'Someone') || ' ' || what, new.preview, link);
  return new;
end $$;

-- ============================================================ 5. comments arrive live
-- The open comment sheet listens for new comments on its post or Instant.
-- Each one still passes the reading rules above before it is delivered.
do $$ begin
  begin alter publication supabase_realtime add table public.comments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.story_comments; exception when duplicate_object then null; end;
end $$;

-- ============================================================ 6. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The four new columns (expect 4 rows):
-- select table_name, column_name from information_schema.columns
--   where table_schema = 'public' and table_name in ('comments', 'story_comments')
--   and column_name in ('parent_id', 'reply_to_id') order by 1, 2;
--
-- (b) The reply checks are on both tables (expect normalize_comment_reply, normalize_hit_comment_reply):
-- select tgname from pg_trigger where tgname in ('normalize_comment_reply', 'normalize_hit_comment_reply') order by 1;
--
-- (c) Live updates include both comment tables (expect comments, story_comments):
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime'
--   and schemaname = 'public' and tablename in ('comments', 'story_comments') order by 1;
--
-- (d) Phone alerts know replies (expect true):
-- select prosrc like '%comment-reply%' from pg_proc where proname = 'push_for_notification' and pronamespace = 'public'::regnamespace;
--
-- (e) No function name exists twice (expect no rows):
-- select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace group by 1 having count(*) > 1;
--
-- (f) The reading rules hide a blocked person's whole thread (expect comments, story_comments):
-- select tablename from pg_policies where schemaname = 'public'
--   and policyname in ('comments are public', 'hit comments are public') and qual like '%parent_id%' order by 1;
