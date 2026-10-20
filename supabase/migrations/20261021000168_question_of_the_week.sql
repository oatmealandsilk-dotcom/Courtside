-- CourtSide · migration 20261021000168: a pinned "Question of the week" at
-- the top of Discussions (Oct 20 sweep, item R5: "Pinned 'Question of the
-- week' in Discussions").
--
-- What it is for: Discussions had 0 new threads in the 7 days before Oct 20.
-- Answering a set question is far easier than starting a new one, the same
-- way the weekly clip challenge works for the Feed. An admin picks one thread
-- (the thread page's pin button, "Pin as Question of the week"); it shows at
-- the top of Discussions for everyone, with a small "This week" label. Pinning
-- another one takes the last one off. A pin lasts 7 days, so a "This week"
-- label is never older than a week; after that the thread goes back to being
-- an ordinary thread (still there, just not on top).
--
-- In plain words, this file:
--   1. question_pins: a private list holding the one pinned thread, who pinned
--      it and when. Nobody can read or write it from the app or the website;
--      only the functions below touch it. Deleting the thread deletes its pin.
--   2. pin_question_of_week(thread): admins only. Pins that thread (taking
--      the last pin off), or, given nothing, takes the pin off. A thread an
--      admin took down (migration 108) cannot be pinned, and neither can a
--      thread whose author is not known to be an adult (a teen, or someone
--      with no birthday on file: known_adult, migration 109), so a teen's
--      thread is never put in front of everyone (review fix, Oct 20).
--      question_pinnable(thread), admins only, says whether a thread can be
--      pinned, so the thread page shows the pin button only when it can.
--   3. question_of_week(): for anyone signed in, the pinned thread's id and
--      when it was pinned, or nothing (no pin, the pin is older than 7 days,
--      the thread was taken down, or its author is no longer known to be an
--      adult). Only the id: whether someone may see
--      the thread itself is still the threads table's own rules, as for any
--      thread (a thread they may not see simply does not show).
--   4. guest_threads (migration 164), the Discussions list a visitor with no
--      account reads on the website, now also says which thread is pinned,
--      on its first page (no topic picked, nothing paged back yet), under
--      "pinned", with the thread itself in the same shape as the others. Only
--      when its author passes the same guest rule as every thread a visitor
--      sees (a public account, not suspended, birthday on file saying 18 or
--      over: share_open, migration 68), and with the same reply count,
--      @someone and length rules. Everything else guest_threads does is
--      exactly as migration 164 wrote it.
--
-- No alert is sent by anything here. Nothing already saved changes. Needs
-- migrations 23 (is_admin), 68 (share_open), 108 (removed_at), 109
-- (known_adult) and 164 (guest mode), all live. Stops before changing anything if one is missing,
-- if guest_threads has changed since migration 164 wrote it, or if a name
-- this file uses already exists and is not this file's. Safe to run more
-- than once.
--
-- NOTE for later: if migration 164 is ever run again, it puts back its own
-- guest_threads, without the pin; run this file again after it.
--
-- ------------------------------------------------------------- HOW TO RUN IT
-- Supabase -> SQL Editor -> New query, paste this whole file, press Run.
-- "Success. No rows returned" means it is in. Anything else: nothing was
-- changed; the message says why.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  r record;
begin
  if to_regclass('public.questions') is null or to_regclass('public.answers') is null or to_regclass('public.polls') is null
     or to_regclass('public.profiles') is null
     or to_regprocedure('public.is_admin()') is null or to_regprocedure('public.share_open(uuid)') is null
     or to_regprocedure('public.known_adult(uuid)') is null
     or to_regprocedure('private.guest_answer_ok(public.answers)') is null or to_regprocedure('private.guest_words(text)') is null
     or to_regprocedure('private.guest_people(uuid[])') is null
     or to_regprocedure('public.guest_threads(text, timestamptz, integer)') is null then
    raise exception 'Migration 168 stopped before changing anything: the threads tables and migrations 23 (is_admin), 68 (share_open), 109 (known_adult) and 164 (guest mode) have to be there first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'questions' and column_name = 'removed_at') then
    raise exception 'Migration 168 stopped before changing anything: run migration 108 (take down) first.';
  end if;
  -- guest_threads is either migration 164's (md5 of its body as 164 wrote it) or already this file's.
  for r in select p.prosrc as src from pg_proc p where p.oid = 'public.guest_threads(text, timestamptz, integer)'::regprocedure loop
    if position('qotw_168' in r.src) = 0 and md5(r.src) <> '107fab5ab6dc524ee2665c2e12ff2d11' then
      raise exception 'Migration 168 stopped before changing anything: public.guest_threads has changed since migration 164 wrote it (md5 %). Compare before replacing it.', md5(r.src);
    end if;
  end loop;
  if to_regclass('public.question_pins') is not null and (
       select array_agg(column_name::text order by column_name) from information_schema.columns
        where table_schema = 'public' and table_name = 'question_pins') is distinct from array['pinned_at', 'pinned_by', 'question_id'] then
    raise exception 'Migration 168 stopped before changing anything: public.question_pins already exists and is not this file''s.';
  end if;
  for r in select p.proname, p.prosrc as src from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname in ('pin_question_of_week', 'question_of_week', 'question_pinnable') loop
    if position('qotw_168' in r.src) = 0 then
      raise exception 'Migration 168 stopped before changing anything: public.% already exists and is not this file''s.', r.proname;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------- 1. the private list
create table if not exists public.question_pins (
  question_id uuid primary key references public.questions(id) on delete cascade,
  pinned_by uuid references public.profiles(id) on delete set null,
  pinned_at timestamptz not null default now()
);
alter table public.question_pins enable row level security;
-- Private: no rule lets anyone read or write it from the app or the website.
revoke all on table public.question_pins from public, anon, authenticated;

-- -------------------------------------------------------- 2. admins pin one
-- Returns true when the pin was set (or taken off), false when the thread is
-- not there, was taken down, or its author is not known to be an adult.
create or replace function public.pin_question_of_week(p_question uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  -- qotw_168
  if not public.is_admin() then
    raise exception 'Only admins can pin a thread.' using errcode = '42501';
  end if;
  if p_question is null then
    delete from public.question_pins;
    return true;
  end if;
  -- Only a thread by a known adult (teen rules: a teen's thread is never put in front of everyone).
  if not exists (select 1 from public.questions q where q.id = p_question and q.removed_at is null
                   and public.known_adult(q.author_id)) then
    return false;
  end if;
  -- One at a time: the last one comes off.
  delete from public.question_pins where question_id <> p_question;
  insert into public.question_pins (question_id, pinned_by, pinned_at) values (p_question, auth.uid(), now())
  on conflict (question_id) do update set pinned_by = excluded.pinned_by, pinned_at = excluded.pinned_at;
  return true;
end $$;
revoke all on function public.pin_question_of_week(uuid) from public, anon, authenticated;
grant execute on function public.pin_question_of_week(uuid) to authenticated;

-- Whether an admin may pin this thread (the thread page shows its pin button
-- only then). False for anyone but an admin, so it tells nobody else anything.
create or replace function public.question_pinnable(p_question uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- qotw_168
  select public.is_admin() and exists (select 1 from public.questions q
    where q.id = p_question and q.removed_at is null and public.known_adult(q.author_id))
$$;
revoke all on function public.question_pinnable(uuid) from public, anon, authenticated;
grant execute on function public.question_pinnable(uuid) to authenticated;

-- ------------------------------------------------ 3. which one, signed in
create or replace function public.question_of_week()
returns table (question_id uuid, pinned_at timestamptz)
language sql stable security definer set search_path = public as $$
  -- qotw_168
  select p.question_id, p.pinned_at
  from public.question_pins p join public.questions q on q.id = p.question_id
  where q.removed_at is null and p.pinned_at > now() - interval '7 days'
    and public.known_adult(q.author_id)
  order by p.pinned_at desc
  limit 1
$$;
revoke all on function public.question_of_week() from public, anon, authenticated;
grant execute on function public.question_of_week() to authenticated;

-- ---------------------------------------------- 4. guest_threads, with the pin
-- Migration 164's guest_threads, word for word, plus "pinned" (see 4. above).
-- The pinned thread's replies are counted by the same rule as the rest.
create or replace function public.guest_threads(p_topic text default null, p_before timestamptz default null, p_limit integer default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  -- guest_164 qotw_168
  with recursive page as (
    select q.* from public.questions q
    where q.removed_at is null
      and public.share_open(q.author_id)
      and (p_topic is null or q.topic = p_topic)
      -- The list reaches back 90 days, as the feed's does (one thread opened by its own id may be older).
      and q.created_at > now() - interval '90 days'
      and q.created_at < least(coalesce(p_before, now() + interval '1 minute'), now() + interval '1 minute')
    order by q.created_at desc, q.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 30)
  ),
  -- The Question of the week (168): only on the first page of the whole list, and only one a visitor may see.
  pin as (
    select q.*, qp.pinned_at from public.question_pins qp join public.questions q on q.id = qp.question_id
    where p_topic is null and p_before is null
      and q.removed_at is null and public.share_open(q.author_id)
      and qp.pinned_at > now() - interval '7 days'
    order by qp.pinned_at desc
    limit 1
  ),
  open_answers as (
    select a.id, a.question_id from public.answers a
    where (a.question_id in (select id from page) or a.question_id in (select id from pin)) and a.parent_answer_id is null and private.guest_answer_ok(a)
    union
    select a.id, a.question_id from public.answers a join open_answers o on a.parent_answer_id = o.id
    where private.guest_answer_ok(a)
  )
  select jsonb_build_object(
    'threads', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', q.id, 'author_id', q.author_id, 'title', left(private.guest_words(q.title), 300), 'body', left(private.guest_words(q.body), 4000),
        'topic', q.topic, 'tags', to_jsonb((coalesce(q.tags, '{}'::text[]))[1:10]), 'votes', q.votes,
        'accepted_answer_id', case when q.accepted_answer_id in (select o.id from open_answers o) then q.accepted_answer_id end,
        'edited_at', q.edited_at, 'created_at', q.created_at,
        'answer_ids', coalesce((select jsonb_agg(o.id) from open_answers o where o.question_id = q.id), '[]'::jsonb),
        'poll', (select jsonb_build_object('options', to_jsonb(array(select private.guest_words(o) from unnest(pl.options) with ordinality u(o, i) order by i)), 'counts', to_jsonb(coalesce(pl.counts, '{}'::int[])))
                 from public.polls pl where pl.question_id = q.id)))
      order by q.created_at desc, q.id desc) from page q), '[]'::jsonb),
    'pinned', (select jsonb_build_object('pinned_at', q.pinned_at, 'thread', jsonb_strip_nulls(jsonb_build_object(
        'id', q.id, 'author_id', q.author_id, 'title', left(private.guest_words(q.title), 300), 'body', left(private.guest_words(q.body), 4000),
        'topic', q.topic, 'tags', to_jsonb((coalesce(q.tags, '{}'::text[]))[1:10]), 'votes', q.votes,
        'accepted_answer_id', case when q.accepted_answer_id in (select o.id from open_answers o) then q.accepted_answer_id end,
        'edited_at', q.edited_at, 'created_at', q.created_at,
        'answer_ids', coalesce((select jsonb_agg(o.id) from open_answers o where o.question_id = q.id), '[]'::jsonb),
        'poll', (select jsonb_build_object('options', to_jsonb(array(select private.guest_words(o) from unnest(pl.options) with ordinality u(o, i) order by i)), 'counts', to_jsonb(coalesce(pl.counts, '{}'::int[])))
                 from public.polls pl where pl.question_id = q.id))))
      from pin q),
    'people', private.guest_people(array(select author_id from page union select author_id from pin)))
$$;
-- As migration 164 left it: only a visitor with no account asks for it.
revoke all on function public.guest_threads(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.guest_threads(text, timestamptz, integer) to anon;

-- ------------------------------------------------- 5. it did what it says
do $$
begin
  if has_function_privilege('anon', 'public.pin_question_of_week(uuid)', 'execute')
     or has_function_privilege('anon', 'public.question_of_week()', 'execute')
     or has_function_privilege('anon', 'public.question_pinnable(uuid)', 'execute') then
    raise exception 'migration 168: the pin must not be open to signed-out visitors (they read it through guest_threads)';
  end if;
  if not has_function_privilege('anon', 'public.guest_threads(text, timestamptz, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.guest_threads(text, timestamptz, integer)', 'execute') then
    raise exception 'migration 168: guest_threads must stay for visitors only';
  end if;
  if has_table_privilege('authenticated', 'public.question_pins', 'select') or has_table_privilege('anon', 'public.question_pins', 'select') then
    raise exception 'migration 168: question_pins must stay private';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ------------------------------------------------- 6. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) Which thread is pinned, and since when (none: no rows):
-- select q.title, p.pinned_at from public.question_pins p join public.questions q on q.id = p.question_id;
--
-- (b) What a visitor sees pinned (null: none they may see):
-- select public.guest_threads(null, null, 30)->'pinned'->'thread'->>'title';
