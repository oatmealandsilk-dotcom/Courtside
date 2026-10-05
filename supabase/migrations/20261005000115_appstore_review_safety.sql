-- CourtSide · migration 115: reporting, suspension, blocking and AI coach
-- consent, from the App Review check (Oct 5).
--
-- In plain words, what changes:
--
-- 1. A report stays when the person who sent it deletes their account. It
--    used to be deleted with them, so a harassed player who reported someone
--    and then left wiped the report before anyone looked. Now it is kept,
--    without their name. (The privacy policy says so.)
--
-- 2. More things can be reported: threads, replies, comments, questions to
--    coaches and coaches' replies, and single chat messages. For each, the
--    database itself fills in whose it is (nobody can name the wrong person),
--    as it already did for posts and hits. A chat can be reported only by
--    someone in it, and the person it is about must be in it too. What you
--    reported stays hidden for you on every device, as posts already did.
--
-- 3. When a chat is reported, a copy of its last 30 messages (and the one
--    reported, if older) is kept for the admin, and so is any message in it
--    that is unsent, edited or deleted while the report is open. Its photos
--    stay on the shelf while the report is open, even if the sender unsends
--    them or deletes their account. Only admins can read the copy.
--
-- 4. A suspended account's posts, instants, comments, threads, replies,
--    questions to coaches, coach replies, court notes, tips and coach reviews
--    are hidden from everyone but the person and admins, and come back
--    unchanged when the suspension is lifted. While suspended they cannot
--    edit what they wrote (captions, words, photos, their name, bio, photo or
--    handle) or add court notes, coach reviews or groups. Deleting, archiving
--    and unsending stay allowed.
--
-- 5. Blocking now also hides each person's questions to coaches, coach
--    replies and tips from the other, and a coach you blocked can no longer
--    reply on your question.
--
-- 6. The AI coach's yes: a player's agreement to the AI coach sending their
--    details to Anthropic is kept here, and the ai-coach function refuses to
--    send anything for someone who has not agreed. Run this before the
--    Anthropic key is added.
--
-- Only adds rules and two small tables; nothing existing is deleted. Safe to
-- run more than once. Nothing here depends on migration 64. Needs migrations
-- 21, 23, 36, 54, 61, 66 and 81 (all live).

-- ============================================================ 1. reports outlive the reporter

alter table public.reports alter column reporter_id drop not null;
do $$
declare
  c text;
begin
  for c in
    select con.conname from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
    where con.conrelid = 'public.reports'::regclass and con.contype = 'f' and a.attname = 'reporter_id'
  loop
    execute format('alter table public.reports drop constraint %I', c);
  end loop;
end $$;
alter table public.reports add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles (id) on delete set null;
create index if not exists reports_open_target_idx on public.reports (target) where status = 'open';

-- ============================================================ 2. what a report is about

-- Before (migration 36): only a post's or hit's author was filled in by the
-- server. Now every kind of thing is, and a chat report is checked: the
-- reporter must be in the chat (an admin can read a reported chat, so a
-- report from outside would open any chat to them), and the person named
-- must be in it too, or the name is dropped.
create or replace function public.stamp_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  kind text := split_part(new.target, ':', 1);
  thing text := split_part(new.target, ':', 2);
  tid uuid;
begin
  new.status := 'open';
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.created_at := now();
  new.reason := left(coalesce(new.reason, ''), 300);
  if thing ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then tid := thing::uuid; end if;
  if kind in ('post', 'hit', 'question', 'answer', 'comment', 'coach-question', 'coach-reply') then
    new.target_user_id := case kind
      when 'post' then (select p.author_id from public.posts p where p.id = tid)
      when 'hit' then (select s.author_id from public.stories s where s.id = tid)
      when 'question' then (select q.author_id from public.questions q where q.id = tid)
      when 'answer' then (select a.author_id from public.answers a where a.id = tid)
      when 'comment' then coalesce((select c.author_id from public.comments c where c.id = tid),
                                   (select c.author_id from public.story_comments c where c.id = tid))
      when 'coach-question' then (select q.author_id from public.coach_questions q where q.id = tid)
      when 'coach-reply' then (select r.coach_user_id from public.coach_replies r where r.id = tid)
    end;
  elsif kind = 'conversation' then
    if tid is null or not exists (
      select 1 from public.conversation_members m where m.conversation_id = tid and m.user_id = new.reporter_id) then
      raise exception 'not in this chat';
    end if;
    if new.target_user_id is not null and (new.target_user_id = new.reporter_id or not exists (
      select 1 from public.conversation_members m where m.conversation_id = tid and m.user_id = new.target_user_id)) then
      new.target_user_id := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists stamp_report on public.reports;
create trigger stamp_report before insert on public.reports
  for each row execute function public.stamp_report();

-- What you reported stays hidden for you on every device (migration 81): every kind now.
create or replace function public.my_reported_targets()
returns setof text
language sql stable security definer set search_path = public
as $$
  select distinct target from public.reports
  where reporter_id = auth.uid() and target ~ '^(post|hit|question|answer|comment|coach-question|coach-reply):';
$$;
revoke all on function public.my_reported_targets() from public, anon;
grant execute on function public.my_reported_targets() to authenticated;

-- The admins' alert names the new kinds (as migration 23, plus them).
create or replace function public.notify_admins_of_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  admin uuid;
begin
  for admin in select id from public.profiles where is_admin loop
    perform public.file_notification(admin, new.reporter_id, 'report', new.id::text, 'report',
      case split_part(new.target, ':', 1)
        when 'post' then 'Reported a post' when 'hit' then 'Reported a hit' when 'profile' then 'Reported a profile'
        when 'question' then 'Reported a thread' when 'answer' then 'Reported a reply' when 'comment' then 'Reported a comment'
        when 'coach-question' then 'Reported a coach question' when 'coach-reply' then 'Reported a coach reply'
        when 'conversation' then case when new.reason like 'message:%' then 'Reported a message' else 'Reported a chat' end
        else 'Sent a report' end,
      false);
  end loop;
  return new;
end $$;

-- ============================================================ 3. what a reported chat said

create table if not exists public.report_evidence (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports (id) on delete cascade,
  conversation_id uuid not null,
  message_id uuid,
  sender_id uuid,
  kind text,
  body text,
  photos jsonb,
  sent_at timestamptz,
  -- 'reported': as it was when reported; then 'unsent', 'edited' (the words before), 'removed' (by an admin) or 'deleted' (with an account).
  why text not null check (why in ('reported', 'unsent', 'edited', 'removed', 'deleted')),
  saved_at timestamptz not null default now()
);
create index if not exists report_evidence_report_idx on public.report_evidence (report_id, sent_at);
alter table public.report_evidence enable row level security;
drop policy if exists "admins read report evidence" on public.report_evidence;
create policy "admins read report evidence" on public.report_evidence for select using (public.is_admin());
revoke insert, update, delete, truncate on public.report_evidence from anon, authenticated;

-- Whether a chat has a report nobody has decided yet.
create or replace function public.chat_under_review(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select conv is not null and exists (
    select 1 from public.reports r where r.target = 'conversation:' || conv::text and r.status = 'open');
$$;
revoke all on function public.chat_under_review(uuid) from public, anon;
grant execute on function public.chat_under_review(uuid) to authenticated, service_role;

-- A new chat report: its last 30 messages, and the one reported if it is older.
create or replace function public.keep_reported_chat()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  conv uuid;
  flagged uuid;
begin
  if split_part(new.target, ':', 1) <> 'conversation' then return new; end if;
  conv := split_part(new.target, ':', 2)::uuid;
  if new.reason ~* '^message:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    flagged := split_part(new.reason, ':', 2)::uuid;
  end if;
  insert into public.report_evidence (report_id, conversation_id, message_id, sender_id, kind, body, photos, sent_at, why)
  select new.id, m.conversation_id, m.id, m.sender_id, m.kind, m.body, m.photos, m.created_at, 'reported'
  from public.messages m
  where m.conversation_id = conv
    and (m.id in (select x.id from public.messages x where x.conversation_id = conv order by x.created_at desc, x.id desc limit 30)
         or m.id = flagged);
  return new;
end $$;
drop trigger if exists keep_reported_chat on public.reports;
create trigger keep_reported_chat after insert on public.reports
  for each row execute function public.keep_reported_chat();

-- A message in a chat under review that is unsent, edited or deleted: the old version is kept first.
create or replace function public.keep_message_under_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.kind <> 'system' and public.chat_under_review(old.conversation_id) then
    insert into public.report_evidence (report_id, conversation_id, message_id, sender_id, kind, body, photos, sent_at, why)
    select r.id, old.conversation_id, old.id, old.sender_id, old.kind, old.body, old.photos, old.created_at,
      case when tg_op = 'UPDATE' then 'edited'
           when auth.uid() = old.sender_id then 'unsent'
           when auth.uid() is not null and public.is_admin() then 'removed'
           else 'deleted' end
    from public.reports r
    where r.target = 'conversation:' || old.conversation_id::text and r.status = 'open';
  end if;
  if tg_op = 'UPDATE' then return new; end if;
  return old;
end $$;
drop trigger if exists keep_message_under_review on public.messages;
create trigger keep_message_under_review before delete on public.messages
  for each row execute function public.keep_message_under_review();
drop trigger if exists keep_message_edit_under_review on public.messages;
create trigger keep_message_edit_under_review before update of body on public.messages
  for each row when (old.body is distinct from new.body) execute function public.keep_message_under_review();

-- A sender can take their chat photos off the shelf, except while the chat
-- is under review (as migration 61, plus that): the admin can still see them.
drop policy if exists "senders remove their chat photos" on storage.objects;
create policy "senders remove their chat photos" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-photos' and public.chat_photo_sender(name) = auth.uid()
         and not public.chat_under_review(public.chat_photo_chat(name)));

-- Deleting an account leaves the photos of a chat under review (as migration
-- 61, minus those): the review's copy of the messages points at them.
create or replace function public.chat_photo_names_of(who uuid, max int default 100)
returns text[] language sql stable security definer set search_path = public, storage as $$
  select coalesce(array_agg(x.name), '{}') from (
    select o.name from storage.objects o
    where o.bucket_id = 'chat-photos' and split_part(o.name, '/', 2) = who::text
      and not public.chat_under_review(public.chat_photo_chat(o.name))
    order by o.name
    limit greatest(1, least(coalesce(max, 100), 1000))) x;
$$;
revoke all on function public.chat_photo_names_of(uuid, int) from public, anon, authenticated;
grant execute on function public.chat_photo_names_of(uuid, int) to service_role;

-- ============================================================ 4. suspended accounts

-- Hidden: a narrowing rule beside each table's own reading rule (the rule
-- itself is untouched). The person still sees their own, and admins see all.
do $$
declare
  t record;
begin
  for t in select * from (values
      ('posts', 'author_id'), ('stories', 'author_id'), ('comments', 'author_id'), ('story_comments', 'author_id'),
      ('questions', 'author_id'), ('answers', 'author_id'), ('coach_questions', 'author_id'), ('coach_replies', 'coach_user_id'),
      ('court_notes', 'user_id'), ('tips', 'user_id'), ('coach_reviews', 'author_id')) as x (tbl, col)
  loop
    if to_regclass('public.' || t.tbl) is not null then
      execute format('drop policy if exists "suspended accounts are hidden" on public.%I', t.tbl);
      execute format('create policy "suspended accounts are hidden" on public.%I as restrictive for select
        using (not public.is_suspended(%I) or auth.uid() = %I or public.is_admin())', t.tbl, t.col, t.col);
    end if;
  end loop;
end $$;

-- Frozen: a suspended person cannot change what they wrote. The trigger is
-- told which column says whose the row is, then the columns that are their
-- words and pictures; it refuses only when one of those really changes, on
-- their own row, while they are suspended. View counts, reactions, archiving,
-- untagging and deleting are untouched.
create or replace function public.refuse_suspended_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  i int;
begin
  if me is null or (to_jsonb(old) ->> tg_argv[0]) is distinct from me::text then return new; end if;
  if not exists (select 1 from public.profiles where id = me and suspended_at is not null) then return new; end if;
  for i in 1 .. tg_nargs - 1 loop
    if (to_jsonb(new) -> tg_argv[i]) is distinct from (to_jsonb(old) -> tg_argv[i]) then
      raise exception 'suspended';
    end if;
  end loop;
  return new;
end $$;
do $$
declare
  t record;
begin
  for t in select * from (values
      ('posts', array['author_id', 'body', 'image_url', 'video_url', 'thumbnail_url', 'media_label', 'tags', 'location']),
      ('stories', array['author_id', 'caption', 'image_url', 'video_url', 'thumbnail_url', 'media_label']),
      ('comments', array['author_id', 'body', 'image_url']),
      ('story_comments', array['author_id', 'body']),
      ('questions', array['author_id', 'title', 'body', 'tags']),
      ('answers', array['author_id', 'body', 'media_url', 'media_kind', 'media_thumb']),
      ('coach_questions', array['author_id', 'title', 'body', 'video_url', 'media_label']),
      ('coach_replies', array['coach_user_id', 'body']),
      ('court_notes', array['user_id', 'note', 'photo_url']),
      ('messages', array['sender_id', 'body']),
      ('profiles', array['id', 'name', 'bio', 'avatar_url', 'location', 'handle'])) as x (tbl, cols)
  loop
    if to_regclass('public.' || t.tbl) is not null then
      execute format('drop trigger if exists refuse_suspended_edit on public.%I', t.tbl);
      execute format('create trigger refuse_suspended_edit before update on public.%I for each row execute function public.refuse_suspended_edit(%s)',
        t.tbl, (select string_agg(quote_literal(c), ', ') from unnest(t.cols) c));
    end if;
  end loop;
end $$;

-- Nothing new either, on the tables migration 23 did not cover.
do $$
declare
  t text;
begin
  foreach t in array array['court_notes', 'coach_reviews', 'feed_groups'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists refuse_if_suspended on public.%I', t);
      execute format('create trigger refuse_if_suspended before insert on public.%I for each row execute function public.refuse_if_suspended()', t);
    end if;
  end loop;
end $$;

-- ============================================================ 5. blocking reaches Ask a coach and tips

-- Whose a coach question is, for the rule below: the coach writing a reply
-- may not be able to see a question whose asker blocked them.
create or replace function public.coach_question_author(q uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select author_id from public.coach_questions where id = q;
$$;
revoke all on function public.coach_question_author(uuid) from public, anon;
grant execute on function public.coach_question_author(uuid) to authenticated;

drop policy if exists "blocked people are hidden" on public.coach_questions;
create policy "blocked people are hidden" on public.coach_questions as restrictive for select
  using (not public.blocked_with(author_id));
drop policy if exists "blocked people are hidden" on public.coach_replies;
create policy "blocked people are hidden" on public.coach_replies as restrictive for select
  using (not public.blocked_with(coach_user_id));
drop policy if exists "blocked people are hidden" on public.tips;
create policy "blocked people are hidden" on public.tips as restrictive for select
  using (not public.blocked_with(user_id));
drop policy if exists "no replies across a block" on public.coach_replies;
create policy "no replies across a block" on public.coach_replies as restrictive for insert
  with check (not public.blocked_with(public.coach_question_author(question_id)));

-- ============================================================ 6. the AI coach's yes

create table if not exists public.ai_coach_consent (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  agreed_at timestamptz not null default now()
);
alter table public.ai_coach_consent enable row level security;
drop policy if exists "see your own answer" on public.ai_coach_consent;
create policy "see your own answer" on public.ai_coach_consent for select using (auth.uid() = user_id);
drop policy if exists "agree as yourself" on public.ai_coach_consent;
create policy "agree as yourself" on public.ai_coach_consent for insert with check (auth.uid() = user_id);
drop policy if exists "take it back" on public.ai_coach_consent;
create policy "take it back" on public.ai_coach_consent for delete using (auth.uid() = user_id);
grant select, insert, delete on public.ai_coach_consent to authenticated;
revoke all on public.ai_coach_consent from anon;

-- The time is the database's, not the phone's.
create or replace function public.stamp_ai_coach_consent()
returns trigger language plpgsql as $$
begin
  new.agreed_at := now();
  return new;
end $$;
drop trigger if exists stamp_ai_coach_consent on public.ai_coach_consent;
create trigger stamp_ai_coach_consent before insert on public.ai_coach_consent
  for each row execute function public.stamp_ai_coach_consent();

-- ============================================================ checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) Reports keep their reporter optional (expect: YES, SET NULL):
-- select c.is_nullable, (select confdeltype from pg_constraint where conname = 'reports_reporter_id_fkey') = 'n' as set_null
--   from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'reports' and c.column_name = 'reporter_id';
--
-- (b) The new rules (expect 15 rows):
-- select tablename, policyname from pg_policies where policyname in ('suspended accounts are hidden', 'blocked people are hidden', 'no replies across a block') order by 1, 2;
--
-- (c) The new tables (expect report_evidence and ai_coach_consent, both with row-level security on):
-- select relname, relrowsecurity from pg_class where relname in ('report_evidence', 'ai_coach_consent');
