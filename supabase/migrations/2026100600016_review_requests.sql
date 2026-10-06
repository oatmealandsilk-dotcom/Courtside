-- CourtSide · migration 2026100600016: asking CourtSide to look again at
-- something taken down (Oct 5, 11:19pm, owner, looking at his own removed
-- post: "why was this removed. what rules. should we have smth that explain
-- the guidelines if someones post is removed").
--
-- NOT APPLIED — needs the owner's OK.
--
-- The app's side: every removed thing its author sees now says why ("Why?
-- See the rules", the new Community Guidelines page) and has "Ask for a
-- review", once per take-down. This file is the server's side of that ask.
--
-- What changes, by name:
--   review_requests (new): one row each time the author of something taken
--     down asks for a review: whose, what (the same eight kinds as
--     take_down), their note (up to 300 characters, optional, only admins
--     read it), which take-down it is about (the item's removed_at then),
--     and where it stands: open, kept (an admin looked again and it stays
--     down) or restored. The author reads their own rows and admins read
--     all of them; which admin closed one is kept (closed_by) but never
--     readable from the app, the same rule as migration 108 keeps for who
--     took something down. Nobody writes the table from the app: only the
--     steps below do.
--   request_review(kind, id, note): what the app calls. Refuses anyone
--     signed out, anyone who is not its author, something that is not
--     removed, and a second ask about the same take-down (one open request
--     per item at most, enforced by an index too). Admins are told: a row
--     in their Notifications ("@sam wants their post looked at again.") and
--     a phone alert that opens Settings → Admin → Removed.
--   keep_removed(kind, id): admins only. Closes the open request as kept and
--     tells the author, in the app and on their phone: "We looked again and
--     your post stays removed: Violence or weapons."
--   review_on_restore (a trigger on the admins' log, moderation_actions):
--     a Restore from anywhere (the Removed page, the item itself, the
--     Reports screen) closes an open request about it as restored and tells
--     the author "Your post was restored." A Restore with no request open
--     tells nobody, as before.
--   review_target(kind, id): server only. Who posted something, when it
--     came down and why, what opens it and what it is called, for the steps
--     above.
--
-- The notices are written the way migration 108 writes its take-down notice:
-- "from" the person they are to, so the general phone-alert trigger leaves
-- them alone and never names an admin, and the alert is sent right here.
-- Two new notification kinds: 'review' (the author's outcome) and
-- 'review-request' (to admins). Older apps show them as a plain line.
--
-- Needs 108 (take_down, restore_content, moderation_actions, removed_reason).
-- Stops without changing anything if 108 has not run. Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
begin
  if to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.send_push(uuid, text, text, text)') is null
     or to_regprocedure('public.takedown_reason_label(text)') is null
     or to_regprocedure('public.restore_content(text, uuid)') is null
     or to_regprocedure('public.take_down(text, uuid, text, text)') is null
     or to_regclass('public.moderation_actions') is null
     or to_regclass('public.notifications') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'coach_replies' and column_name = 'removed_reason')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'story_comments' and column_name = 'removed_reason') then
    raise exception 'Migration 2026100600016 stopped before changing anything: migration 108 (taking things down) has to run first.';
  end if;
end $$;

-- ------------------------------------------------------------ 1. the table
create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  target_kind text not null,
  target_id uuid not null,
  note text,
  -- The take-down this ask is about: the item's removed_at when it was asked.
  -- Taken down again after a restore, it can be asked about again.
  removed_at timestamptz not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  -- The admin who kept or restored it. Never readable from the app (see the grants below).
  closed_by uuid references public.profiles (id) on delete set null
);

-- The rules as named checks, so a second run replaces them instead of adding copies.
alter table public.review_requests drop constraint if exists review_requests_kind_check;
alter table public.review_requests add constraint review_requests_kind_check
  check (target_kind in ('post', 'hit', 'comment', 'hit-comment', 'question', 'answer', 'coach-question', 'coach-reply'));
alter table public.review_requests drop constraint if exists review_requests_status_check;
alter table public.review_requests add constraint review_requests_status_check
  check (status in ('open', 'kept', 'restored'));
alter table public.review_requests drop constraint if exists review_requests_note_check;
alter table public.review_requests add constraint review_requests_note_check
  check (note is null or char_length(note) <= 300);
alter table public.review_requests drop constraint if exists review_requests_closed_check;
alter table public.review_requests add constraint review_requests_closed_check
  check ((status = 'open') = (closed_at is null));

-- At most one open ask per item, whoever races.
create unique index if not exists review_requests_one_open on public.review_requests (target_kind, target_id) where status = 'open';
create index if not exists review_requests_target_idx on public.review_requests (target_kind, target_id, created_at desc);
create index if not exists review_requests_author_idx on public.review_requests (author_id, created_at desc);

alter table public.review_requests enable row level security;
-- Read only, signed in only, and never closed_by. Revoking the whole table
-- also clears the column grants, so a second run starts clean.
revoke all on table public.review_requests from public, anon, authenticated;
grant select (id, author_id, target_kind, target_id, note, removed_at, status, created_at, closed_at) on public.review_requests to authenticated;
drop policy if exists "your own review requests; admins read all" on public.review_requests;
create policy "your own review requests; admins read all" on public.review_requests
  for select to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- ------------------------------------------------- 2. what an item is, server only
-- Who posted it, when it came down and why (null when it is not down), what
-- opens it (a comment opens its post, a reply its thread) and what its author
-- calls it ("clip", "instant", "thread"...), the same words migration 108's
-- notice uses. Nothing found: every field empty.
create or replace function public.review_target(p_kind text, p_id uuid,
  out o_author uuid, out o_removed_at timestamptz, out o_reason text, out o_open_kind text, out o_open_id uuid, out o_noun text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'post' then
    select x.author_id, x.removed_at, x.removed_reason, 'post', x.id, case when x.kind = 'clip' then 'clip' else 'post' end
      into o_author, o_removed_at, o_reason, o_open_kind, o_open_id, o_noun from public.posts x where x.id = p_id;
  elsif p_kind = 'hit' then
    select x.author_id, x.removed_at, x.removed_reason, 'hit', x.id, 'instant'
      into o_author, o_removed_at, o_reason, o_open_kind, o_open_id, o_noun from public.stories x where x.id = p_id;
  elsif p_kind = 'comment' then
    select x.author_id, x.removed_at, x.removed_reason, 'post', x.post_id, 'comment'
      into o_author, o_removed_at, o_reason, o_open_kind, o_open_id, o_noun from public.comments x where x.id = p_id;
  elsif p_kind = 'hit-comment' then
    select x.author_id, x.removed_at, x.removed_reason, 'hit', x.story_id, 'comment'
      into o_author, o_removed_at, o_reason, o_open_kind, o_open_id, o_noun from public.story_comments x where x.id = p_id;
  elsif p_kind = 'question' then
    select x.author_id, x.removed_at, x.removed_reason, 'question', x.id, 'thread'
      into o_author, o_removed_at, o_reason, o_open_kind, o_open_id, o_noun from public.questions x where x.id = p_id;
  elsif p_kind = 'answer' then
    select x.author_id, x.removed_at, x.removed_reason, 'question', x.question_id, 'reply'
      into o_author, o_removed_at, o_reason, o_open_kind, o_open_id, o_noun from public.answers x where x.id = p_id;
  elsif p_kind = 'coach-question' then
    select x.author_id, x.removed_at, x.removed_reason, 'coach-question', x.id, 'question'
      into o_author, o_removed_at, o_reason, o_open_kind, o_open_id, o_noun from public.coach_questions x where x.id = p_id;
  elsif p_kind = 'coach-reply' then
    select x.coach_user_id, x.removed_at, x.removed_reason, 'coach-question', x.question_id, 'reply'
      into o_author, o_removed_at, o_reason, o_open_kind, o_open_id, o_noun from public.coach_replies x where x.id = p_id;
  end if;
end $$;
revoke all on function public.review_target(text, uuid) from public, anon, authenticated;

-- The app's address of what opens an item, for a phone alert's tap.
create or replace function public.review_href(p_open_kind text, p_open_id uuid)
returns text language sql immutable set search_path = public as $$
  select case p_open_kind when 'post' then '/post/' when 'hit' then '/hits/' when 'question' then '/question/' else '/coach-question/' end || p_open_id::text;
$$;
revoke all on function public.review_href(text, uuid) from public, anon, authenticated;

-- The author's notice about how a review went, in their list and on their
-- phone. "From" them, as the take-down notice is (migration 108).
create or replace function public.review_tell_author(p_author uuid, p_kind text, p_id uuid, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare
  t record;
  v_words text;
begin
  if p_author is null or not exists (select 1 from public.profiles where id = p_author) then return; end if;
  select * into t from public.review_target(p_kind, p_id);
  -- Deleted meanwhile: nothing left to open, nothing to say.
  if t.o_open_id is null then return; end if;
  if p_outcome = 'restored' then
    v_words := 'Your ' || t.o_noun || ' was restored.';
  else
    v_words := 'We looked again and your ' || t.o_noun || ' stays removed' || coalesce(': ' || public.takedown_reason_label(t.o_reason), '') || '.';
  end if;
  insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
    values (p_author, p_author, 'review', t.o_open_id::text, t.o_open_kind, v_words);
  perform public.send_push(p_author, 'CourtSide', v_words, public.review_href(t.o_open_kind, t.o_open_id));
end $$;
revoke all on function public.review_tell_author(uuid, text, uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------- 3. asking for a review
-- Returns 'done'. Refuses with 'not signed in', 'bad kind', 'not found',
-- 'not yours', 'not removed' or 'already asked'.
create or replace function public.request_review(p_kind text, p_id uuid, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t record;
  v_note text := nullif(left(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), 300), '');
  v_who text;
  v_words text;
  a uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_kind is null or p_kind not in ('post', 'hit', 'comment', 'hit-comment', 'question', 'answer', 'coach-question', 'coach-reply') then
    raise exception 'bad kind';
  end if;
  select * into t from public.review_target(p_kind, p_id);
  if t.o_open_id is null then raise exception 'not found'; end if;
  if t.o_author is distinct from me then raise exception 'not yours'; end if;
  if t.o_removed_at is null then raise exception 'not removed'; end if;
  -- Once per take-down: an ask still open, or any ask about this same take-down.
  if exists (select 1 from public.review_requests r
             where r.target_kind = p_kind and r.target_id = p_id
               and (r.status = 'open' or r.removed_at = t.o_removed_at)) then
    raise exception 'already asked';
  end if;
  begin
    insert into public.review_requests (author_id, target_kind, target_id, note, removed_at)
      values (me, p_kind, p_id, v_note, t.o_removed_at);
  exception when unique_violation then
    raise exception 'already asked';
  end;

  -- The admins are told. "From" each admin themselves, so the general
  -- phone-alert trigger leaves it alone (it would say "did something on
  -- CourtSide"); the alert goes out here instead, and opens the Removed page.
  select coalesce('@' || nullif(handle, ''), nullif(name, ''), 'Someone') into v_who from public.profiles where id = me;
  v_words := coalesce(v_who, 'Someone') || ' wants their ' || t.o_noun || ' looked at again.';
  for a in select p.id from public.profiles p where p.is_admin and p.id <> me loop
    insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
      values (a, a, 'review-request', t.o_open_id::text, t.o_open_kind, v_words);
    perform public.send_push(a, 'Review asked', v_words, '/admin-removed');
  end loop;
  return 'done';
end $$;
revoke all on function public.request_review(text, uuid, text) from public, anon;
grant execute on function public.request_review(text, uuid, text) to authenticated;

-- ------------------------------------------------------- 4. answering one
-- An admin looked again and it stays down. Returns 'done', or 'no_request'
-- when nothing about it is open.
create or replace function public.keep_removed(p_kind text, p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  r public.review_requests;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.review_requests set status = 'kept', closed_at = now(), closed_by = auth.uid()
    where target_kind = p_kind and target_id = p_id and status = 'open'
    returning * into r;
  if r.id is null then return 'no_request'; end if;
  perform public.review_tell_author(r.author_id, r.target_kind, r.target_id, 'kept');
  return 'done';
end $$;
revoke all on function public.keep_removed(text, uuid) from public, anon;
grant execute on function public.keep_removed(text, uuid) to authenticated;

-- Put back, from anywhere (every Restore is logged in moderation_actions,
-- migration 108): an open ask about it is closed as restored, and its author
-- told. A Restore nobody asked for tells nobody, as before.
create or replace function public.review_on_restore()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.review_requests;
begin
  if new.action is distinct from 'restore' then return new; end if;
  for r in
    update public.review_requests set status = 'restored', closed_at = now(), closed_by = new.admin_id
      where target_kind = new.target_kind and target_id = new.target_id and status = 'open'
      returning *
  loop
    perform public.review_tell_author(r.author_id, r.target_kind, r.target_id, 'restored');
  end loop;
  return new;
end $$;
revoke all on function public.review_on_restore() from public, anon, authenticated;

drop trigger if exists review_on_restore on public.moderation_actions;
create trigger review_on_restore after insert on public.moderation_actions
  for each row when (new.action = 'restore') execute function public.review_on_restore();

commit;

-- ------------------------------------------------------------ 5. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The table, its rule and the steps (expect true, 1, 3, 1):
-- select (select relrowsecurity from pg_class where oid = 'public.review_requests'::regclass) as rls,
--        (select count(*) from pg_policies where schemaname = 'public' and tablename = 'review_requests') as policies,
--        (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('request_review', 'keep_removed', 'review_on_restore')) as steps,
--        (select count(*) from pg_trigger where tgname = 'review_on_restore' and not tgisinternal) as triggers;
--
-- (b) Who may call what (expect true, true, false, false, false, false):
-- select has_function_privilege('authenticated', 'public.request_review(text, uuid, text)', 'execute'),
--        has_function_privilege('authenticated', 'public.keep_removed(text, uuid)', 'execute'),
--        has_function_privilege('anon', 'public.request_review(text, uuid, text)', 'execute'),
--        has_function_privilege('authenticated', 'public.review_target(text, uuid)', 'execute'),
--        has_column_privilege('authenticated', 'public.review_requests', 'closed_by', 'select'),
--        has_table_privilege('authenticated', 'public.review_requests', 'insert');
--
-- (c) Asks so far, by where they stand:
-- select status, count(*) from public.review_requests group by status;
