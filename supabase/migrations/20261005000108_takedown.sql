-- CourtSide · migration 108: taking down what breaks CourtSide's rules
-- (Oct 5, owner: "Build take down tool"; the idea, Oct 1: "if someone posts
-- like someone shooting a gun at someone, we can't have that on our app").
--
-- NOT APPLIED — needs the owner's OK.
--
-- What an admin can do from here on (an admin is an account with is_admin,
-- which is only ever set in Supabase):
--   * take down a post or clip (group posts too), an Instant, a comment on
--     either, a thread, a reply in a thread, or a public "Ask a coach"
--     question or a coach's reply to one, giving one of eight reasons:
--     harassment or bullying, hate, sexual content, violence or weapons,
--     spam or scams, impersonation, minor safety, or something else (with
--     a short note of up to 200 characters that only admins ever see);
--   * put it back ("Restore"), from the item itself or from
--     Settings → Admin → Removed, which lists every take-down;
--   * see who took what down, when and why, in a log only admins can read.
--
-- What happens to the item: it disappears for everyone except the person
-- who posted it and the admins, and the database itself enforces that, so
-- it is gone wherever anything is read: feeds, profiles, search, a court's
-- page, a group's feed, comment and reply lists, live comment updates, and
-- shared-link previews on the website. Comments under a removed post or
-- Instant, replies under a removed comment or thread, and coach replies to
-- a removed question go with it. Nobody can add a new comment or reply to
-- something removed. Nothing is deleted: the row and its photo or video
-- stay where they are, which is what lets Restore put it back exactly as it
-- was. (So a direct link to the photo or video file itself keeps working
-- for anyone who already has that link.)
--
-- What the person who posted it sees: it stays on their own profile and
-- pages, marked "Removed" with the reason (never the note, never which
-- admin). They are told once, in the app and on their phone, from
-- CourtSide: "Your post was removed for breaking CourtSide's rules:
-- Violence or weapons." They can still delete or archive it; editing it
-- never brings it back.
--
-- What changes, by name:
--   posts, stories, comments, story_comments, questions, answers,
--     coach_questions, coach_replies: + removed_at (posts and stories had
--     it since 23) and + removed_reason. Only the steps below can change
--     either: guard_removed (23) now covers all eight tables, on a new row
--     as well as an edit.
--   Their reading rules: "read live posts" (67), "read live stories" (23),
--     "comments are public" and "hit comments are public" (56), "threads
--     are public" and "answers are public" (21), "coach questions are
--     public" and "coach replies are public" (8), "polls are public" (41).
--     Each is the same rule as before, word for word, with one more
--     condition: not removed, unless it is yours or you are an admin. The
--     block rules, private accounts, the teen rules, group membership and
--     what signed-out visitors may see (103) are all untouched.
--   refuse_on_removed (new): no new comment or reply on something removed.
--   moderation_actions (new): the log (admin, what, whose, take down or
--     restore, reason, note, when). Admins read it; nobody writes to it
--     except the steps below.
--   take_down(kind, id, reason, note), restore_content(kind, id) and
--     admin_removed(): what the app calls. All three refuse anyone who is
--     not an admin. A take-down also closes every open report about that
--     item, as "removed".
--   moderate_report (23): "Remove" and "Restore" on the Reports screen go
--     through the same steps (reason "something else"), so a phone with the
--     older app is logged and the author is told too. Suspend, unsuspend
--     and dismiss are exactly as before.
--   share_preview (76): a removed thread is locked like a private one, and
--     removed comments and replies are left out of the counts it shows.
--
-- Who took something down is kept only in the admins' log. The removed row
-- itself says when and why but not who, because its author can read it.
--
-- Earlier notifications about a removed item (say "Sam commented: ...")
-- stay in people's lists; deleting them could not be undone by Restore.
--
-- Needs 23, 40, 41, 52, 56, 67 and 76. Stops without changing anything if
-- share_preview has changed since 76 (or 76 has not run yet). After this
-- has run, running 76 again just stops (its own check sees this file's
-- share_preview), so nothing is undone. Works before or after migration 64
-- (it changes none of the functions 64 checks). Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
-- md5 of share_preview's body: as 76 left it, or as this file leaves it.
do $$
declare
  now_is text;
begin
  if to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.send_push(uuid, text, text, text)') is null
     or to_regprocedure('public.blocked_with(uuid)') is null
     or to_regprocedure('public.can_view(uuid)') is null
     or to_regprocedure('public.in_feed_group(uuid)') is null
     or to_regprocedure('public.author_of_comment(uuid)') is null
     or to_regprocedure('public.author_of_hit_comment(uuid)') is null
     or to_regprocedure('public.share_open_to_me(uuid)') is null
     or to_regprocedure('public.hit_is_open(uuid)') is null
     or to_regclass('public.reports') is null
     or to_regclass('public.polls') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'parent_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'story_comments' and column_name = 'parent_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'image_url')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'answers' and column_name = 'media_url')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'group_id') then
    raise exception 'Migration 108 stopped before changing anything: migrations 23, 40, 41, 52, 56, 67 and 76 have to run first.';
  end if;
  select md5(p.prosrc) into now_is from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'share_preview';
  if now_is is null or now_is not in ('b7fb9a8d65fde56d5b046f95fe5f94f2', '6af1c2ad7c16d4a903a64cccaccf2fb5') then
    raise exception 'Migration 108 stopped before changing anything: share_preview is not the version migration 76 left. Run 76 first, or bring this file up to date with whatever changed it.';
  end if;
end $$;

-- ------------------------------------------------------- 1. removed, and why
alter table public.posts add column if not exists removed_at timestamptz;
alter table public.stories add column if not exists removed_at timestamptz;
alter table public.comments add column if not exists removed_at timestamptz;
alter table public.story_comments add column if not exists removed_at timestamptz;
alter table public.questions add column if not exists removed_at timestamptz;
alter table public.answers add column if not exists removed_at timestamptz;
alter table public.coach_questions add column if not exists removed_at timestamptz;
alter table public.coach_replies add column if not exists removed_at timestamptz;

alter table public.posts add column if not exists removed_reason text;
alter table public.stories add column if not exists removed_reason text;
alter table public.comments add column if not exists removed_reason text;
alter table public.story_comments add column if not exists removed_reason text;
alter table public.questions add column if not exists removed_reason text;
alter table public.answers add column if not exists removed_reason text;
alter table public.coach_questions add column if not exists removed_reason text;
alter table public.coach_replies add column if not exists removed_reason text;

-- One of the eight reasons (or none: not removed, or removed before this
-- file, by the Reports screen's old Remove), and a quick way to list them.
do $$
declare
  t text;
begin
  foreach t in array array['posts', 'stories', 'comments', 'story_comments', 'questions', 'answers', 'coach_questions', 'coach_replies'] loop
    begin
      execute format('alter table public.%I add constraint %I check (removed_reason is null or removed_reason in (%L, %L, %L, %L, %L, %L, %L, %L))',
        t, t || '_removed_reason_check', 'harassment', 'hate', 'sexual', 'violence', 'spam', 'impersonation', 'minor-safety', 'other');
    exception when duplicate_object then null;
    end;
    execute format('create index if not exists %I on public.%I (removed_at desc) where removed_at is not null', t || '_removed_idx', t);
  end loop;
end $$;

-- The words a reason is shown in. "Something else" has none: the author is
-- told only that it broke CourtSide's rules.
create or replace function public.takedown_reason_label(code text)
returns text language sql immutable set search_path = public as $$
  select case code
    when 'harassment' then 'Harassment or bullying'
    when 'hate' then 'Hate'
    when 'sexual' then 'Sexual content'
    when 'violence' then 'Violence or weapons'
    when 'spam' then 'Spam or scams'
    when 'impersonation' then 'Impersonation'
    when 'minor-safety' then 'Minor safety'
    else null end;
$$;
revoke all on function public.takedown_reason_label(text) from public, anon, authenticated;

-- ------------------------------------------------------------ 2. the log
create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles (id) on delete set null,
  target_kind text not null check (target_kind in ('post', 'hit', 'comment', 'hit-comment', 'question', 'answer', 'coach-question', 'coach-reply')),
  target_id uuid not null,
  author_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('take_down', 'restore')),
  reason text check (reason is null or reason in ('harassment', 'hate', 'sexual', 'violence', 'spam', 'impersonation', 'minor-safety', 'other')),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  constraint moderation_actions_reason_needed check (action = 'restore' or reason is not null)
);
create index if not exists moderation_actions_target_idx on public.moderation_actions (target_kind, target_id, created_at desc);
alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from public, anon, authenticated;
grant select on public.moderation_actions to authenticated;
drop policy if exists "admins read the moderation log" on public.moderation_actions;
create policy "admins read the moderation log" on public.moderation_actions for select using (public.is_admin());

-- ------------------------------------------------- 3. only a take-down moves it
-- As in 23: an edit never changes removed_at (or now removed_reason) unless
-- a take-down or restore is under way. New here: all eight tables, and a
-- new row from the app always starts not removed.
create or replace function public.guard_removed()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('courtside.moderating', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      if auth.uid() is not null then
        new.removed_at := null;
        new.removed_reason := null;
      end if;
    else
      new.removed_at := old.removed_at;
      new.removed_reason := old.removed_reason;
    end if;
  end if;
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['posts', 'stories', 'comments', 'story_comments', 'questions', 'answers', 'coach_questions', 'coach_replies'] loop
    execute format('drop trigger if exists guard_removed on public.%I', t);
    execute format('create trigger guard_removed before insert or update on public.%I for each row execute function public.guard_removed()', t);
  end loop;
end $$;

-- No new comment or reply on something removed (its author included: they
-- can still see it, but nobody else could see what they add).
create or replace function public.refuse_on_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'comments' then
    if exists (select 1 from public.posts where id = new.post_id and removed_at is not null)
       or (new.parent_id is not null and exists (select 1 from public.comments where id = new.parent_id and removed_at is not null)) then
      raise exception 'removed';
    end if;
  elsif tg_table_name = 'story_comments' then
    if exists (select 1 from public.stories where id = new.story_id and removed_at is not null)
       or (new.parent_id is not null and exists (select 1 from public.story_comments where id = new.parent_id and removed_at is not null)) then
      raise exception 'removed';
    end if;
  elsif tg_table_name = 'answers' then
    if exists (select 1 from public.questions where id = new.question_id and removed_at is not null)
       or (new.parent_answer_id is not null and exists (select 1 from public.answers where id = new.parent_answer_id and removed_at is not null)) then
      raise exception 'removed';
    end if;
  elsif tg_table_name = 'coach_replies' then
    if exists (select 1 from public.coach_questions where id = new.question_id and removed_at is not null) then
      raise exception 'removed';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.refuse_on_removed() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['comments', 'story_comments', 'answers', 'coach_replies'] loop
    execute format('drop trigger if exists refuse_on_removed on public.%I', t);
    execute format('create trigger refuse_on_removed before insert on public.%I for each row execute function public.refuse_on_removed()', t);
  end loop;
end $$;

-- ------------------------------------------------------ 4. who may read it
-- "Is this one hidden from me?", for the rules on the rows under it: removed,
-- and neither mine nor am I an admin. They read past the rules (security
-- definer), as author_of_comment does, so a rule never has to read through
-- the hiding it decides. Named in reading rules, so signed-out readers must
-- be able to call them too (see 67).
create or replace function public.comment_hidden(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.comments x where x.id = c and x.removed_at is not null and x.author_id is distinct from auth.uid())
     and not public.is_admin();
$$;
create or replace function public.hit_comment_hidden(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.story_comments x where x.id = c and x.removed_at is not null and x.author_id is distinct from auth.uid())
     and not public.is_admin();
$$;
create or replace function public.question_hidden(q uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.questions x where x.id = q and x.removed_at is not null and x.author_id is distinct from auth.uid())
     and not public.is_admin();
$$;
create or replace function public.coach_question_hidden(q uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coach_questions x where x.id = q and x.removed_at is not null and x.author_id is distinct from auth.uid())
     and not public.is_admin();
$$;
revoke all on function public.comment_hidden(uuid), public.hit_comment_hidden(uuid), public.question_hidden(uuid), public.coach_question_hidden(uuid) from public;
grant execute on function public.comment_hidden(uuid), public.hit_comment_hidden(uuid), public.question_hidden(uuid), public.coach_question_hidden(uuid) to anon, authenticated;

-- Posts: migration 67's rule word for word; only its last line gains "or yours".
-- (103's extra rule for signed-out visitors sits on top, untouched.)
drop policy if exists "read live posts" on public.posts;
create policy "read live posts" on public.posts for select
  using ((not archived or auth.uid() = author_id)
    and (case when group_id is null
           then (public.can_view(author_id) or auth.uid() = any(tagged_user_ids)
                 or (session->'with') @> jsonb_build_array(jsonb_build_object('id', auth.uid())))
           else (auth.uid() = author_id or public.in_feed_group(group_id) or public.is_admin())
         end)
    and not public.blocked_with(author_id)
    and (removed_at is null or auth.uid() = author_id or public.is_admin()));

-- Instants: migration 23's rule; only its last line gains "or yours".
drop policy if exists "read live stories" on public.stories;
create policy "read live stories" on public.stories for select
  using (((not archived and expires_at > now()) or auth.uid() = author_id) and public.can_view(author_id) and not public.blocked_with(author_id)
    and (removed_at is null or auth.uid() = author_id or public.is_admin()));

-- Comments: migration 56's rules, plus the removed line, and a reply under a
-- removed comment goes with it (the app already leaves out a reply whose
-- comment it does not have).
drop policy if exists "comments are public" on public.comments;
create policy "comments are public" on public.comments for select
  using (not public.blocked_with(author_id)
    and (parent_id is null or not public.blocked_with(public.author_of_comment(parent_id)))
    and exists (select 1 from public.posts p where p.id = comments.post_id)
    and (removed_at is null or auth.uid() = author_id or public.is_admin())
    and (parent_id is null or not public.comment_hidden(parent_id)));
drop policy if exists "hit comments are public" on public.story_comments;
create policy "hit comments are public" on public.story_comments for select
  using (not public.blocked_with(author_id)
    and (parent_id is null or not public.blocked_with(public.author_of_hit_comment(parent_id)))
    and exists (select 1 from public.stories s where s.id = story_comments.story_id)
    and (removed_at is null or auth.uid() = author_id or public.is_admin())
    and (parent_id is null or not public.hit_comment_hidden(parent_id)));

-- Threads and their replies: migration 21's rules, plus the removed line;
-- a removed thread takes its replies with it. A reply under a removed reply
-- stays, moved up a level, as when a reply is deleted (87).
drop policy if exists "threads are public" on public.questions;
create policy "threads are public" on public.questions for select
  using (not public.blocked_with(author_id)
    and (removed_at is null or auth.uid() = author_id or public.is_admin()));
drop policy if exists "answers are public" on public.answers;
create policy "answers are public" on public.answers for select
  using (not public.blocked_with(author_id)
    and (removed_at is null or auth.uid() = author_id or public.is_admin())
    and not public.question_hidden(question_id));

-- A removed thread's poll goes with it.
drop policy if exists "polls are public" on public.polls;
create policy "polls are public" on public.polls for select
  using (not public.question_hidden(question_id));

-- "Ask a coach": migration 8's rules were open to all; now, the removed line.
drop policy if exists "coach questions are public" on public.coach_questions;
create policy "coach questions are public" on public.coach_questions for select
  using (removed_at is null or auth.uid() = author_id or public.is_admin());
drop policy if exists "coach replies are public" on public.coach_replies;
create policy "coach replies are public" on public.coach_replies for select
  using ((removed_at is null or auth.uid() = coach_user_id or public.is_admin())
    and not public.coach_question_hidden(question_id));

-- ------------------------------------------------- 5. taking down and putting back
-- The one place either happens (take_down, restore_content and the Reports
-- screen all come here). Not callable from the app on its own: the callers
-- check for an admin first. Returns 'done', 'already' (taken down before),
-- 'not_removed' (nothing to put back) or 'not_found'.
create or replace function public.moderation_apply(p_kind text, p_id uuid, p_remove boolean, p_reason text, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_found boolean := false;
  v_author uuid;
  v_was timestamptz;
  v_noun text;
  -- What opens to show it: a comment opens its post, a reply its thread.
  v_open_kind text;
  v_open_id uuid;
  v_label text;
  v_words text;
begin
  if p_kind = 'post' then
    select author_id, removed_at, case when kind = 'clip' then 'clip' else 'post' end into v_author, v_was, v_noun from public.posts where id = p_id;
    v_found := found; v_open_kind := 'post'; v_open_id := p_id;
  elsif p_kind = 'hit' then
    select author_id, removed_at into v_author, v_was from public.stories where id = p_id;
    v_found := found; v_noun := 'instant'; v_open_kind := 'hit'; v_open_id := p_id;
  elsif p_kind = 'comment' then
    select author_id, removed_at, post_id into v_author, v_was, v_open_id from public.comments where id = p_id;
    v_found := found; v_noun := 'comment'; v_open_kind := 'post';
  elsif p_kind = 'hit-comment' then
    select author_id, removed_at, story_id into v_author, v_was, v_open_id from public.story_comments where id = p_id;
    v_found := found; v_noun := 'comment'; v_open_kind := 'hit';
  elsif p_kind = 'question' then
    select author_id, removed_at into v_author, v_was from public.questions where id = p_id;
    v_found := found; v_noun := 'thread'; v_open_kind := 'question'; v_open_id := p_id;
  elsif p_kind = 'answer' then
    select author_id, removed_at, question_id into v_author, v_was, v_open_id from public.answers where id = p_id;
    v_found := found; v_noun := 'reply'; v_open_kind := 'question';
  elsif p_kind = 'coach-question' then
    select author_id, removed_at into v_author, v_was from public.coach_questions where id = p_id;
    v_found := found; v_noun := 'question'; v_open_kind := 'coach-question'; v_open_id := p_id;
  elsif p_kind = 'coach-reply' then
    select coach_user_id, removed_at, question_id into v_author, v_was, v_open_id from public.coach_replies where id = p_id;
    v_found := found; v_noun := 'reply'; v_open_kind := 'coach-question';
  else
    raise exception 'unknown kind';
  end if;
  if not v_found then return 'not_found'; end if;
  if p_remove and v_was is not null then return 'already'; end if;
  if not p_remove and v_was is null then return 'not_removed'; end if;

  -- The row itself: when and why, never who (its author can read it).
  perform set_config('courtside.moderating', 'on', true);
  if p_kind = 'post' then
    update public.posts set removed_at = case when p_remove then now() end, removed_reason = case when p_remove then p_reason end where id = p_id;
  elsif p_kind = 'hit' then
    update public.stories set removed_at = case when p_remove then now() end, removed_reason = case when p_remove then p_reason end where id = p_id;
  elsif p_kind = 'comment' then
    update public.comments set removed_at = case when p_remove then now() end, removed_reason = case when p_remove then p_reason end where id = p_id;
  elsif p_kind = 'hit-comment' then
    update public.story_comments set removed_at = case when p_remove then now() end, removed_reason = case when p_remove then p_reason end where id = p_id;
  elsif p_kind = 'question' then
    update public.questions set removed_at = case when p_remove then now() end, removed_reason = case when p_remove then p_reason end where id = p_id;
  elsif p_kind = 'answer' then
    update public.answers set removed_at = case when p_remove then now() end, removed_reason = case when p_remove then p_reason end where id = p_id;
  elsif p_kind = 'coach-question' then
    update public.coach_questions set removed_at = case when p_remove then now() end, removed_reason = case when p_remove then p_reason end where id = p_id;
  else
    update public.coach_replies set removed_at = case when p_remove then now() end, removed_reason = case when p_remove then p_reason end where id = p_id;
  end if;
  perform set_config('courtside.moderating', 'off', true);

  -- The log: who, what, whose, why.
  insert into public.moderation_actions (admin_id, target_kind, target_id, author_id, action, reason, note)
    values (auth.uid(), p_kind, p_id, v_author,
            case when p_remove then 'take_down' else 'restore' end,
            case when p_remove then p_reason end,
            case when p_remove then p_note end);

  -- Reports about it: a take-down settles the open ones; a restore opens
  -- the ones it had settled again (as the Reports screen's Restore did).
  if p_remove then
    update public.reports set status = 'removed', reviewed_at = now(), reviewed_by = auth.uid()
      where target = p_kind || ':' || p_id::text and status = 'open';
  else
    update public.reports set status = 'open', reviewed_at = now(), reviewed_by = auth.uid()
      where target = p_kind || ':' || p_id::text and status = 'removed';
  end if;

  -- The author is told, from CourtSide (the notification is "from" them, as
  -- a milestone is, so it never names an admin and the general phone-alert
  -- trigger leaves it alone; the alert is sent here instead). Written
  -- directly, not through file_notification, which would drop it if the
  -- author had blocked the admin.
  if p_remove and v_author is not null and v_author is distinct from auth.uid()
     and exists (select 1 from public.profiles where id = v_author) then
    v_label := public.takedown_reason_label(p_reason);
    v_words := 'Your ' || v_noun || ' was removed for breaking CourtSide''s rules' || coalesce(': ' || v_label, '') || '.';
    insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
      values (v_author, v_author, 'removed', v_open_id::text, v_open_kind, v_words);
    perform public.send_push(v_author, 'CourtSide', v_words,
      case v_open_kind when 'post' then '/post/' when 'hit' then '/hits/' when 'question' then '/question/' else '/coach-question/' end || v_open_id::text);
  end if;
  return 'done';
end $$;
revoke all on function public.moderation_apply(text, uuid, boolean, text, text) from public, anon, authenticated;

-- What the app calls. Kinds: post, hit (an Instant), comment, hit-comment,
-- question (a thread), answer (a thread reply), coach-question, coach-reply.
-- Returns 'done', or 'already' when it was down already.
create or replace function public.take_down(p_kind text, p_id uuid, p_reason text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_note text := nullif(left(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), 200), '');
  v_result text;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_reason is null or p_reason not in ('harassment', 'hate', 'sexual', 'violence', 'spam', 'impersonation', 'minor-safety', 'other') then
    raise exception 'bad reason';
  end if;
  v_result := public.moderation_apply(p_kind, p_id, true, p_reason, v_note);
  if v_result = 'not_found' then raise exception 'not found'; end if;
  return v_result;
end $$;
revoke all on function public.take_down(text, uuid, text, text) from public, anon;
grant execute on function public.take_down(text, uuid, text, text) to authenticated;

-- Puts it back exactly as it was. Returns 'done', or 'not_removed'.
create or replace function public.restore_content(p_kind text, p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_result text;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  v_result := public.moderation_apply(p_kind, p_id, false, null, null);
  if v_result = 'not_found' then raise exception 'not found'; end if;
  return v_result;
end $$;
revoke all on function public.restore_content(text, uuid) from public, anon;
grant execute on function public.restore_content(text, uuid) to authenticated;

-- Settings → Admin → Removed: everything taken down, newest first, with
-- who posted it, a few words and a picture of it, the reason and note, and
-- who took it down (from the log; nobody for one removed before this file).
create or replace function public.admin_removed()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.removed_at desc)
    from (
      select r.kind, r.id, r.parent_id, r.author_id, r.preview, r.picture, r.reason, r.removed_at, m.admin_id as removed_by, m.note
      from (
        select 'post'::text as kind, p.id, null::uuid as parent_id, p.author_id, left(coalesce(p.body, ''), 160) as preview,
               coalesce(p.thumbnail_url, p.image_url) as picture, p.removed_reason as reason, p.removed_at
          from public.posts p where p.removed_at is not null
        union all
        select 'hit', s.id, null, s.author_id, left(coalesce(s.caption, ''), 160), coalesce(s.thumbnail_url, s.image_url), s.removed_reason, s.removed_at
          from public.stories s where s.removed_at is not null
        union all
        select 'comment', c.id, c.post_id, c.author_id, left(c.body, 160), c.image_url, c.removed_reason, c.removed_at
          from public.comments c where c.removed_at is not null
        union all
        select 'hit-comment', c.id, c.story_id, c.author_id, left(c.body, 160), null, c.removed_reason, c.removed_at
          from public.story_comments c where c.removed_at is not null
        union all
        select 'question', q.id, null, q.author_id, left(q.title, 160), null, q.removed_reason, q.removed_at
          from public.questions q where q.removed_at is not null
        union all
        select 'answer', a.id, a.question_id, a.author_id, left(a.body, 160),
               case when a.media_kind = 'photo' then a.media_url else a.media_thumb end, a.removed_reason, a.removed_at
          from public.answers a where a.removed_at is not null
        union all
        select 'coach-question', q.id, null, q.author_id, left(q.title, 160), null, q.removed_reason, q.removed_at
          from public.coach_questions q where q.removed_at is not null
        union all
        select 'coach-reply', cr.id, cr.question_id, cr.coach_user_id, left(cr.body, 160), null, cr.removed_reason, cr.removed_at
          from public.coach_replies cr where cr.removed_at is not null
      ) r
      left join lateral (
        select ma.admin_id, ma.note from public.moderation_actions ma
        where ma.target_kind = r.kind and ma.target_id = r.id and ma.action = 'take_down'
        order by ma.created_at desc limit 1
      ) m on true
      order by r.removed_at desc
      limit 300
    ) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.admin_removed() from public, anon;
grant execute on function public.admin_removed() to authenticated;

-- The Reports screen's decisions (migration 23). Remove and restore now go
-- through moderation_apply: logged, reports settled, the author told.
-- Suspend, unsuspend and dismiss are as they were.
create or replace function public.moderate_report(report uuid, decision text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.reports%rowtype;
  kind text;
  target uuid;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into r from public.reports where id = report;
  if not found then raise exception 'no such report'; end if;
  kind := split_part(r.target, ':', 1);
  if split_part(r.target, ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target := split_part(r.target, ':', 2)::uuid;
  end if;
  if decision in ('remove', 'restore') then
    if kind in ('post', 'hit') and target is not null then
      perform public.moderation_apply(kind, target, decision = 'remove', case when decision = 'remove' then 'other' end, null);
    end if;
  elsif decision in ('suspend', 'unsuspend') then
    perform set_config('courtside.moderating', 'on', true);
    update public.profiles set suspended_at = case when decision = 'suspend' then now() else null end where id = r.target_user_id;
    perform set_config('courtside.moderating', 'off', true);
  elsif decision <> 'dismiss' then
    raise exception 'unknown decision';
  end if;
  update public.reports set
    status = case decision when 'remove' then 'removed' when 'suspend' then 'suspended' when 'dismiss' then 'dismissed' else 'open' end,
    reviewed_at = now(), reviewed_by = auth.uid()
  where id = report;
end $$;
grant execute on function public.moderate_report(uuid, text) to authenticated;

-- ------------------------------------------------------------ 6. shared links
-- Migration 76's share_preview, with two changes: a removed thread is
-- locked (as a private one is), and the comment and reply counts leave out
-- removed ones. A removed post was already locked.
create or replace function public.share_preview(p_kind text, p_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  is_uuid boolean := coalesce(p_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  locked jsonb := jsonb_build_object('kind', p_kind, 'open', false);
  p public.posts;
  h public.hit_requests;
  q public.questions;
  pr public.profiles;
  joined int;
begin
  if p_kind = 'post' then
    if not is_uuid then return locked; end if;
    select * into p from public.posts where id = p_id::uuid;
    if p.id is null or p.archived or p.removed_at is not null or public.share_in_group(p) or not public.share_open_to_me(p.author_id) then return locked; end if;
    return jsonb_build_object('kind', 'post', 'open', true,
      'author', public.share_person(p.author_id),
      'post', jsonb_strip_nulls(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'body', left(p.body, 500), 'createdAt', p.created_at,
        'imageUrl', p.image_url, 'videoUrl', p.video_url, 'thumbnailUrl', p.thumbnail_url, 'orientation', p.orientation,
        'likes', (select count(*) from public.post_likes l where l.post_id = p.id),
        'comments', (select count(*) from public.comments c where c.post_id = p.id and c.removed_at is null),
        'courtName', p.court_name, 'courtId', p.court_id, 'location', nullif(btrim(coalesce(p.location, '')), ''),
        -- Only the session's shape, never its numbers from a tracker or who else played.
        'session', case when jsonb_typeof(p.session) = 'object' then jsonb_strip_nulls(jsonb_build_object(
          'minutes', case when jsonb_typeof(p.session->'minutes') = 'number' then p.session->'minutes' end,
          'focus', left(p.session->>'focus', 40),
          'kind', case when p.session->>'kind' in ('practice', 'match', 'drills', 'fitness') then p.session->>'kind' end)) end)));
  end if;

  if p_kind = 'profile' then
    if not is_uuid then return locked; end if;
    select * into pr from public.profiles where id = p_id::uuid;
    if pr.id is null or not public.share_open_to_me(pr.id) then return locked; end if;
    return jsonb_build_object('kind', 'profile', 'open', true,
      'author', public.share_person(pr.id),
      'profile', jsonb_strip_nulls(jsonb_build_object(
        'bio', left(pr.bio, 200),
        'followers', pr.followers_count,
        'posts', (select count(*) from public.posts x where x.author_id = pr.id and not x.archived and x.removed_at is null and not public.share_in_group(x)),
        'skillSystem', case when pr.profile->>'skillSystem' in ('NTRP', 'UTR', 'ITF') then pr.profile->>'skillSystem' end,
        'rating', case when jsonb_typeof(pr.profile->'rating') = 'number' then pr.profile->'rating' end,
        'openHits', (select count(*) from public.hit_requests y where y.author_id = pr.id and not y.cancelled and y.starts_at > now() and public.hit_is_open(y.id)),
        'recent', coalesce((select jsonb_agg(public.share_tile(x) order by x.created_at desc) from (
          select * from public.posts x where x.author_id = pr.id and not x.archived and x.removed_at is null
            and (x.image_url is not null or x.thumbnail_url is not null) and not public.share_in_group(x)
          order by x.created_at desc limit 6) x), '[]'::jsonb))));
  end if;

  if p_kind = 'hit-request' then
    if not is_uuid then return locked; end if;
    select * into h from public.hit_requests where id = p_id::uuid;
    if h.id is null or not public.share_open_to_me(h.author_id) then return locked; end if;
    if not public.hit_is_open(h.id) and not public.hit_reaches(auth.uid(), h.id) then return locked; end if;
    select count(*) into joined from public.hit_joins j where j.hit_id = h.id;
    return jsonb_build_object('kind', 'hit-request', 'open', true,
      'gone', h.cancelled or h.starts_at < now() - interval '1 hour',
      'author', public.share_person(h.author_id),
      'hit', jsonb_strip_nulls(jsonb_build_object(
        'id', h.id, 'startsAt', h.starts_at, 'format', h.format, 'spots', h.spots,
        'spotsLeft', greatest(h.spots - joined, 0), 'levelMin', h.level_min, 'levelMax', h.level_max,
        'note', left(h.note, 280),
        'place', jsonb_strip_nulls(jsonb_build_object(
          'id', case when (h.place->>'id') ~ '^(node|way|relation)[0-9]{1,15}$' then h.place->>'id' end,
          'name', left(h.place->>'name', 120),
          -- About a street away, the way a court is found; never to the metre.
          'lat', case when jsonb_typeof(h.place->'lat') = 'number' then round((h.place->>'lat')::numeric, 3) end,
          'lng', case when jsonb_typeof(h.place->'lng') = 'number' then round((h.place->>'lng')::numeric, 3) end)))));
  end if;

  if p_kind = 'question' then
    if not is_uuid then return locked; end if;
    select * into q from public.questions where id = p_id::uuid;
    if q.id is null or q.removed_at is not null or not public.share_open_to_me(q.author_id) then return locked; end if;
    return jsonb_build_object('kind', 'question', 'open', true,
      'author', public.share_person(q.author_id),
      'question', jsonb_build_object(
        'id', q.id, 'title', left(q.title, 200), 'body', left(q.body, 400), 'createdAt', q.created_at,
        'answers', (select count(*) from public.answers a where a.question_id = q.id and a.removed_at is null)));
  end if;

  if p_kind = 'court' then
    -- A court is a public place: its page always opens. What it counts and
    -- shows is only from people a stranger may see.
    if coalesce(p_id, '') !~ '^(node|way|relation)[0-9]{1,15}$' then return locked; end if;
    return jsonb_build_object('kind', 'court', 'open', true,
      'court', jsonb_strip_nulls(jsonb_build_object(
        'name', (select x.court_name from public.posts x where x.court_id = p_id and x.court_name is not null and not public.share_in_group(x) order by x.created_at desc limit 1),
        'openHits', (select count(*) from public.hit_requests y where y.place->>'id' = p_id and not y.cancelled and y.starts_at > now() and public.share_open_to_me(y.author_id) and public.hit_is_open(y.id)),
        'posts', (select count(*) from public.posts x where x.court_id = p_id and not x.archived and x.removed_at is null and not public.share_in_group(x) and public.share_open_to_me(x.author_id)),
        'players', (select count(distinct x.author_id) from public.posts x where x.court_id = p_id and not x.archived and x.removed_at is null and not public.share_in_group(x) and public.share_open_to_me(x.author_id)),
        'recent', coalesce((select jsonb_agg(public.share_tile(x) order by x.created_at desc) from (
          select * from public.posts x where x.court_id = p_id and not x.archived and x.removed_at is null
            and (x.image_url is not null or x.thumbnail_url is not null) and not public.share_in_group(x) and public.share_open_to_me(x.author_id)
          order by x.created_at desc limit 6) x), '[]'::jsonb))));
  end if;

  if p_kind = 'referrer' then
    -- The handle on a link (?ref=): only named back when it is someone a
    -- stranger may see, so a made-up link cannot claim to come from anyone.
    select * into pr from public.profiles where handle = lower(btrim(coalesce(p_id, '')));
    if pr.id is null or not public.share_open_to_me(pr.id) then return locked; end if;
    return jsonb_build_object('kind', 'referrer', 'open', true, 'author', public.share_person(pr.id));
  end if;

  return locked;
end $$;
revoke all on function public.share_preview(text, text) from public;
grant execute on function public.share_preview(text, text) to anon, authenticated;

commit;

-- ------------------------------------------------------------ 7. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The new columns, log and steps (expect 16, true, 3, 4):
-- select (select count(*) from information_schema.columns where table_schema = 'public' and column_name in ('removed_at', 'removed_reason')
--           and table_name in ('posts', 'stories', 'comments', 'story_comments', 'questions', 'answers', 'coach_questions', 'coach_replies')) as cols,
--        (select relrowsecurity from pg_class where oid = 'public.moderation_actions'::regclass) as log_rls,
--        (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('take_down', 'restore_content', 'admin_removed')) as steps,
--        (select count(*) from pg_trigger where tgname = 'refuse_on_removed' and not tgisinternal) as refusals;
--
-- (b) Who may call what (expect true, true, true, false, false, false):
-- select has_function_privilege('authenticated', 'public.take_down(text, uuid, text, text)', 'execute'),
--        has_function_privilege('authenticated', 'public.restore_content(text, uuid)', 'execute'),
--        has_function_privilege('authenticated', 'public.admin_removed()', 'execute'),
--        has_function_privilege('anon', 'public.take_down(text, uuid, text, text)', 'execute'),
--        has_function_privilege('authenticated', 'public.moderation_apply(text, uuid, boolean, text, text)', 'execute'),
--        has_function_privilege('authenticated', 'public.takedown_reason_label(text)', 'execute');
--
-- (c) Every reading rule still names the old conditions and the new one (expect 9 rows, each "true"):
-- select tablename, policyname, qual like '%removed_at%' as hides_removed from pg_policies
--  where schemaname = 'public' and policyname in ('read live posts', 'read live stories', 'comments are public', 'hit comments are public',
--        'threads are public', 'answers are public', 'polls are public', 'coach questions are public', 'coach replies are public')
--  order by tablename;
-- (polls are public reads "question_hidden" rather than removed_at, so it shows false; that one is right.)
--
-- (d) Nothing new is removed: only what the Reports screen's old Remove took down before (expect those counts, the rest 0):
-- select (select count(*) from public.posts where removed_at is not null) as posts,
--        (select count(*) from public.stories where removed_at is not null) as instants,
--        (select count(*) from public.comments where removed_at is not null) as comments,
--        (select count(*) from public.questions where removed_at is not null) as threads,
--        (select count(*) from public.moderation_actions) as logged;
