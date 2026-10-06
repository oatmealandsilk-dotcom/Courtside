-- CourtSide · migration 128: the tips board's Delete and Report (account sweep, Oct 5).
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece, AFTER migration 126. It is all-or-nothing: if a check below
-- fails, it stops and nothing at all changes. Safe to run more than once.
--
-- Why: every signed-in player can read every tip on the board (migration
-- 11), but a tip had no Report and its author could not take it down. The
-- app now puts "Delete" on your own tips and "Report" on everyone else's,
-- the way a coach's reply already has Report.
--
-- What it does:
--   * You can delete your own tip, and only your own. Nobody else's, and
--     nothing for signed-out visitors (they cannot read tips at all).
--   * A tip you reported stays out of sight for you on every device, the
--     way a reported post, thread, open hit or comment already does:
--     my_reported_targets now also hands back 'tip:' reports. Only your own
--     reports, as before.
--   * The database fills in whose tip a report is about (so nobody can name
--     the wrong person), and the admins' alert says "Reported a tip".
--
-- Written on top of migration 126 (Oct 5), which rewrote the same three
-- report functions for open hits: each one here is 126's version plus
-- 'tip', so both kinds stay. Checked below by md5 of each body: as 126
-- leaves it, or as this file leaves it. If 126 hasn't run, this stops.
--
-- Needs migrations 11, 115, 124 and 126.

begin;

-- ------------------------------------------------------------------ 0. checks
do $$
declare
  -- As migration 126 leaves them, or as this file does.
  expected constant text[][] := array[
    ['stamp_report',            'bca29d59ed094d2f5aee799083fbf1b6', 'efa3083a8b393ea55763813acaeb266e'],
    ['my_reported_targets',     'f068be6c2df849a90cfa1a014b42892d', '8ef2a1e23d75ec2c5d5900f14eb9cc49'],
    ['notify_admins_of_report', '1bf03d1da6ea8de91012c582a4ddd780', '2357a2448734f582be2db57067a1f5d2']
  ];
  i int;
  wrong text[] := '{}';
begin
  if to_regclass('public.tips') is null or to_regclass('public.reports') is null then
    raise exception 'Migration 128 stopped before changing anything: migrations 7, 8 and 11 have to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]) <> 1
       or exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]
                  and md5(p.prosrc) not in (expected[i][2], expected[i][3])) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 128 stopped before changing anything: % is not as this file expects (run 126 first; or it changed after Oct 5, and this file must be brought up to date with that change first).', array_to_string(wrong, ', ');
  end if;
end $$;

-- ------------------------------------------------------- 1. delete your own tip
drop policy if exists "delete your own tip" on public.tips;
create policy "delete your own tip" on public.tips for delete to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------- 2. a tip can be reported
-- As 126, with 'tip': its author is filled in by the database.
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
  if kind in ('post', 'hit', 'hit-request', 'question', 'answer', 'comment', 'coach-question', 'coach-reply', 'tip') then
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
      when 'tip' then (select t.user_id from public.tips t where t.id = tid)
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


-- A reported tip stays hidden for you on every device (as 126, plus tips).
create or replace function public.my_reported_targets()
returns setof text
language sql stable security definer set search_path = public
as $$
  select distinct target from public.reports
  where reporter_id = auth.uid() and target ~ '^(post|hit|hit-request|question|answer|comment|coach-question|coach-reply|tip):';
$$;
revoke all on function public.my_reported_targets() from public, anon;
grant execute on function public.my_reported_targets() to authenticated;

-- The admins' alert names it (as 126, plus tips).
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
        when 'coach-question' then 'Reported a coach question' when 'coach-reply' then 'Reported a coach reply' when 'tip' then 'Reported a tip'
        when 'conversation' then case when new.reason like 'message:%' then 'Reported a message' else 'Reported a chat' end
        else 'Sent a report' end,
      false);
  end loop;
  return new;
end $$;


-- The reports table's own functions stay its own (as 126 left them).
revoke all on function public.stamp_report() from public, anon, authenticated;
revoke all on function public.notify_admins_of_report() from public, anon, authenticated;

-- ------------------------------------------------------------- 3. made as written
do $$
begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
             and ((p.proname = 'stamp_report' and md5(p.prosrc) <> 'efa3083a8b393ea55763813acaeb266e')
               or (p.proname = 'my_reported_targets' and md5(p.prosrc) <> '8ef2a1e23d75ec2c5d5900f14eb9cc49')
               or (p.proname = 'notify_admins_of_report' and md5(p.prosrc) <> '2357a2448734f582be2db57067a1f5d2')))
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tips'
                    and policyname = 'delete your own tip' and cmd = 'DELETE') then
    raise exception 'Migration 128 stopped: it did not come out as written. Nothing was changed.';
  end if;
end $$;

commit;

-- Checks afterwards (each should say what is in brackets):
-- select policyname, cmd, roles from pg_policies where tablename = 'tips' and cmd = 'DELETE';  -- (delete your own tip · DELETE · {authenticated})
-- select proname, md5(prosrc) from pg_proc where proname in ('stamp_report', 'my_reported_targets', 'notify_admins_of_report');
--   (stamp_report efa3083a8b393ea55763813acaeb266e · my_reported_targets 8ef2a1e23d75ec2c5d5900f14eb9cc49
--    notify_admins_of_report 2357a2448734f582be2db57067a1f5d2)
