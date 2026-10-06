-- CourtSide · migration 126: Community fixes from the Oct 5 sweep.
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if a check below fails, it stops and
-- nothing at all changes. Safe to run more than once.
--
-- Order: any time after 124 (live since Oct 5). The app from the same change
-- works before and after it (see "Before this runs" below).
--
-- What it does, in plain words:
--
-- 1. A thread's topic must be one the app knows (gear, technique, strategy,
--    injury, fitness, rules, mental). Until now any signed-in account could
--    save its own thread with any topic at all through the database's public
--    door, and every phone that then opened Community crashed on it. The six
--    threads live on Oct 5 are all fitness, gear or technique, so nothing
--    already there is touched. (The app now also reads a topic it doesn't
--    know as Technique, so an old phone's copy can't crash either.)
--
-- 2. An open hit (someone looking for a game on Find Players, with a note of
--    up to 280 characters in their own words) can be reported, like a post,
--    a thread or a reply. The database fills in whose hit it is (nobody can
--    name the wrong person), keeps it hidden for whoever reported it on every
--    device, and the admins' alert says "Reported an open hit". The report's
--    target is 'hit-request:<id>'; 'hit:<id>' stays an Instant (story).
--
--    Everything else about reports stays as 124 left it: one open report per
--    person per thing, at most 20 an hour from one person, and the admins
--    hear about the first open report on a thing.
--
-- 3. The two functions that run inside the reports table (stamp_report and
--    notify_admins_of_report) can no longer be called by name from outside,
--    signed in or out. They still run on every report exactly as before: the
--    database never asks for that permission when it runs them for a report.
--
-- 4. An admin can read a reported open hit (report_hit_context): its note,
--    place and poster, for that one hit and only once someone has reported
--    it, the way a reported chat already works. Before, the Reports page
--    showed "This is gone" for a teen's hit, an invite-only hit or one from
--    someone the admin blocked, since open hits' read rules have no admin
--    exception (and shouldn't: the admin accounts would then see teens' hits
--    on their own Find Players and map).
--
-- Before this runs: the app's Report on an open hit already works (the report
-- is kept, with the poster's id as the app sends it, and the hit leaves the
-- reporter's screens at once), but on the next app open the hit comes back
-- for them, since the server doesn't hand open-hit reports back yet. Threads
-- with an unknown topic read as Technique in the new app either way.
--
-- Needs 124 (live on Oct 5). Written against the live database on Oct 5,
-- after 124: stamp_report and notify_admins_of_report exactly as 124 left
-- them, my_reported_targets as 115 did, checked below by md5 of each body.
-- Adds one function (report_hit_context), no table or column.
--
-- Tried on the live database on Oct 5, after 124, inside a transaction that
-- was then undone (nothing was saved), run twice. As a signed-in player: a
-- report of a real open hit, naming the wrong person on purpose, came out
-- naming the hit's poster; a post report still named the post's author; the
-- open-hit report came back from my_reported_targets; both admins got
-- "Reported an open hit". A thread with the topic 'x' was refused (23514),
-- one with 'gear' saved, and changing it to 'x' was refused. Calling
-- stamp_report by name was refused (42501), and so were my_reported_targets
-- and notify_admins_of_report signed out (42501).
--   RESULT hit_report_names_poster=t post_report_names_author=true
--   mine_has_hit=true admin_alerts=2/2 bad_topic_insert=23514
--   good_topic_insert=saved bad_topic_update=23514 auth_stamp_call=42501
--   anon_mine=42501 anon_notify_call=42501 topic_rule_validated=true
--   md5 my_reported_targets=f068be6c2df849a90cfa1a014b42892d
--   notify_admins_of_report=1bf03d1da6ea8de91012c582a4ddd780
--   stamp_report=bca29d59ed094d2f5aee799083fbf1b6

begin;

-- ------------------------------------------------------------------ 0. checks
do $$
declare
  -- Rewritten here: as live on Oct 5 (124's, and 115's for my_reported_targets), or as this file leaves them.
  expected constant text[][] := array[
    ['stamp_report',            '52b9e650b2d0fdc0c6f2be6e93c8e6a9', 'bca29d59ed094d2f5aee799083fbf1b6'],
    ['my_reported_targets',     'ba9fd7d997bd2197458c9f6a7a36136f', 'f068be6c2df849a90cfa1a014b42892d'],
    ['notify_admins_of_report', '5194ffe25c7f8de9c807c6dfe501ce2b', '1bf03d1da6ea8de91012c582a4ddd780']
  ];
  i int;
  wrong text[] := '{}';
  bad text;
begin
  if to_regclass('public.reports') is null or to_regclass('public.hit_requests') is null or to_regclass('public.questions') is null then
    raise exception 'Migration 126 stopped before changing anything: reports, hit_requests or questions is missing. Ask Claude to look.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]) <> 1
       or exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]
                  and md5(p.prosrc) not in (expected[i][2], expected[i][3])) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 126 stopped before changing anything: % is not as this file expects (run 124 first; or it changed after Oct 5, and this file must be brought up to date with that change first).', array_to_string(wrong, ', ');
  end if;
  -- The two report functions still run on the reports table, as 115 set them up.
  if not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                 where t.tgrelid = 'public.reports'::regclass and t.tgname = 'stamp_report' and p.proname = 'stamp_report')
     or not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                 where t.tgrelid = 'public.reports'::regclass and t.tgname = 'notify_admins_of_report' and p.proname = 'notify_admins_of_report') then
    raise exception 'Migration 126 stopped before changing anything: the reports table''s triggers are not as on Oct 5. Ask Claude to look.';
  end if;
  -- Every thread already has a topic the app knows (the rule in 1 would refuse to go on otherwise).
  select string_agg(distinct coalesce(topic, '(none)'), ', ') into bad from public.questions
    where topic is null or topic not in ('gear', 'technique', 'strategy', 'injury', 'fitness', 'rules', 'mental');
  if bad is not null then
    raise exception 'Migration 126 stopped before changing anything: some threads have the topic %. Ask Claude to look.', bad;
  end if;
  -- The admins' reported-hit reader is new: its name is free, or this file's own.
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'report_hit_context'
             and md5(p.prosrc) <> 'fecc7a429ccb72cdfa5c71839b0d8d1f') then
    raise exception 'Migration 126 stopped before changing anything: there is already another report_hit_context. Ask Claude to look.';
  end if;
  -- The rule's name is free, or this file's own.
  if exists (select 1 from pg_constraint where conrelid = 'public.questions'::regclass and conname = 'questions_topic_check'
             and pg_get_constraintdef(oid) <> 'CHECK ((topic = ANY (ARRAY[''gear''::text, ''technique''::text, ''strategy''::text, ''injury''::text, ''fitness''::text, ''rules''::text, ''mental''::text])))') then
    raise exception 'Migration 126 stopped before changing anything: questions already has another rule called questions_topic_check. Ask Claude to look.';
  end if;
end $$;

-- ------------------------------------------------- 1. a topic the app knows
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.questions'::regclass and conname = 'questions_topic_check') then
    alter table public.questions add constraint questions_topic_check
      check (topic in ('gear', 'technique', 'strategy', 'injury', 'fitness', 'rules', 'mental'));
  end if;
end $$;

-- --------------------------------------------- 2. an open hit can be reported
-- As 124, with 'hit-request' (an open hit): its poster is filled in by the database.
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
  -- (124) The limits.
  if new.reporter_id is not null and not public.is_admin() then
    perform pg_advisory_xact_lock(hashtextextended('stamp_report:' || new.reporter_id::text, 124));
    if exists (select 1 from public.reports r
               where r.reporter_id = new.reporter_id and r.target = new.target and r.status = 'open'
                 and (kind <> 'conversation' or r.reason is not distinct from new.reason)) then
      return null;
    end if;
    if (select count(*) from public.reports r
        where r.reporter_id = new.reporter_id and r.created_at > now() - interval '1 hour') >= 20 then
      return null;
    end if;
  end if;
  if thing ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then tid := thing::uuid; end if;
  if kind in ('post', 'hit', 'hit-request', 'question', 'answer', 'comment', 'coach-question', 'coach-reply') then
    new.target_user_id := case kind
      when 'post' then (select p.author_id from public.posts p where p.id = tid)
      when 'hit' then (select s.author_id from public.stories s where s.id = tid)
      when 'hit-request' then (select h.author_id from public.hit_requests h where h.id = tid)
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

-- What you reported stays hidden for you on every device: open hits too.
create or replace function public.my_reported_targets()
returns setof text
language sql stable security definer set search_path = public
as $$
  select distinct target from public.reports
  where reporter_id = auth.uid() and target ~ '^(post|hit|hit-request|question|answer|comment|coach-question|coach-reply):';
$$;
revoke all on function public.my_reported_targets() from public, anon;
grant execute on function public.my_reported_targets() to authenticated;

-- The admins' alert names it (as 124, plus open hits).
create or replace function public.notify_admins_of_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  admin uuid;
begin
  -- (124) Only the first open report on it.
  if exists (select 1 from public.reports r where r.target = new.target and r.status = 'open' and r.id <> new.id) then
    return new;
  end if;
  for admin in select id from public.profiles where is_admin loop
    perform public.file_notification(admin, new.reporter_id, 'report', new.id::text, 'report',
      case split_part(new.target, ':', 1)
        when 'post' then 'Reported a post' when 'hit' then 'Reported a hit' when 'hit-request' then 'Reported an open hit' when 'profile' then 'Reported a profile'
        when 'question' then 'Reported a thread' when 'answer' then 'Reported a reply' when 'comment' then 'Reported a comment'
        when 'coach-question' then 'Reported a coach question' when 'coach-reply' then 'Reported a coach reply'
        when 'conversation' then case when new.reason like 'message:%' then 'Reported a message' else 'Reported a chat' end
        else 'Sent a report' end,
      false);
  end loop;
  return new;
end $$;

-- ---------------------------- 2b. the admins can read a reported open hit
-- An open hit's own read rules have no exception for admins: a teen's hit,
-- an invite-only one or one from someone the admin blocked showed only "This
-- is gone" on the Reports page, so the admin couldn't read what was
-- reported. As for a reported chat (report_chat_context), the database hands
-- an admin just this one hit's note, place and poster, and only once someone
-- has reported it. Admins get no wider read on open hits: those would then
-- show on the admin accounts' own Find Players and map.
create or replace function public.report_hit_context(hit uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $
declare
  ctx jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.reports r where r.target = 'hit-request:' || hit::text) then
    raise exception 'not reported';
  end if;
  select jsonb_build_object(
      'note', left(h.note, 280),
      'place', left(h.place->>'name', 120),
      'author', h.author_id,
      'starts_at', h.starts_at,
      'cancelled', h.cancelled)
    into ctx
    from public.hit_requests h where h.id = hit;
  return ctx;
end $;
revoke all on function public.report_hit_context(uuid) from public, anon;
grant execute on function public.report_hit_context(uuid) to authenticated;

-- ------------------------------- 3. the reports table's own functions stay its own
revoke all on function public.stamp_report() from public, anon, authenticated;
revoke all on function public.notify_admins_of_report() from public, anon, authenticated;

-- ------------------------------------------------------------- 4. made as written
do $$
begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
             and ((p.proname = 'stamp_report' and md5(p.prosrc) <> 'bca29d59ed094d2f5aee799083fbf1b6')
               or (p.proname = 'my_reported_targets' and md5(p.prosrc) <> 'f068be6c2df849a90cfa1a014b42892d')
               or (p.proname = 'notify_admins_of_report' and md5(p.prosrc) <> '1bf03d1da6ea8de91012c582a4ddd780')
               or (p.proname = 'report_hit_context' and md5(p.prosrc) <> 'fecc7a429ccb72cdfa5c71839b0d8d1f')))
     or not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'report_hit_context')
     or has_function_privilege('anon', 'public.report_hit_context(uuid)', 'execute')
     or not exists (select 1 from pg_constraint where conrelid = 'public.questions'::regclass
                    and conname = 'questions_topic_check' and convalidated) then
    raise exception 'Migration 126 stopped: it did not come out as written. Nothing was changed.';
  end if;
end $$;

commit;
