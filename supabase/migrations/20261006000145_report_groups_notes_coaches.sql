-- CourtSide · migration 145: a group, a coach's page, a coach review and a
-- court note can be reported; court notes leave out anyone suspended or
-- blocked (App Store review, guideline 1.2, Oct 6).
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece, AFTER migration 128. It is all-or-nothing: if a check below
-- fails, it stops and nothing at all changes. Safe to run more than once.
--
-- Why: the app (Oct 6) puts Report on a group's page and on its row in Find
-- groups, on a coach's page and on each coach review, and on a court's
-- newest note. Each goes into the same reports table as every other report,
-- as "group:<id>", "coach:<id>", "coach-review:<id>" and
-- "court-note:<court>:<key>" (the key is a fingerprint of the note's words;
-- the note's words go in the report's reason). The app files them the same
-- way whether or not this has run; this file makes the database name the
-- right person on each and say what it is in the admins' alert.
--
-- What it does:
--   * stamp_report fills in whose it is, so nobody can name the wrong
--     person and the admin can suspend them from the report's card: an
--     account reported from its profile (now "profile:<id>", so each
--     profile report is its own and none is dropped as a repeat), a
--     group's creator (or, if they have gone, its longest-standing admin;
--     someone outside a group can't see who runs it), a coach page's coach,
--     a coach review's writer, and a court note's writer (found by the
--     note's words on that court; the reporter is never told who it is,
--     only admins can read reports).
--   * The admins' alert says "Reported a group", "Reported a coach page",
--     "Reported a coach review" or "Reported a court note".
--   * A coach review, court note or group you reported stays out of sight
--     for you on every device: my_reported_targets also hands those back.
--     Only your own reports, as before.
--   * court_facts (what players say about a court, never naming anyone)
--     leaves out notes written by anyone suspended, and by anyone you have
--     blocked or who has blocked you. The counts (lights, nets, busy times)
--     are unchanged.
--
-- court_facts is changed only when it is as migration 109 (or 64) left it.
-- If 109 hasn't run yet, that part is skipped with a notice and court_facts
-- is left exactly as it is, so 109's own checks still pass: run 109, then
-- this file again. Everything else in this file runs either way.
--
-- Written on top of migration 128 (Oct 5): stamp_report,
-- my_reported_targets and notify_admins_of_report are 128's versions plus
-- the new kinds, so every kind before stays. Checked below by md5 of each
-- body: as 128 leaves it, or as this file leaves it. If 128 hasn't run,
-- this stops.
--
-- Needs migrations 35 (coaches), 60 (court notes), 66 (is_suspended),
-- 67 (groups), 115, 124, 126 and 128.

begin;

-- ------------------------------------------------------------------ 0. checks
do $$
declare
  -- As migration 128 leaves them, or as this file does.
  expected constant text[][] := array[
    ['stamp_report',            'efa3083a8b393ea55763813acaeb266e', 'a242082b75189a967c163ca8ec5ee0aa'],
    ['my_reported_targets',     '8ef2a1e23d75ec2c5d5900f14eb9cc49', '5f70e8b56150e99b1262b53f2c73e885'],
    ['notify_admins_of_report', '2357a2448734f582be2db57067a1f5d2', '3cc7c3fdff002f8fae27e48c11fb26bc']
  ];
  i int;
  wrong text[] := '{}';
begin
  if to_regclass('public.reports') is null or to_regclass('public.feed_groups') is null
     or to_regclass('public.feed_group_members') is null or to_regclass('public.coaches') is null
     or to_regclass('public.coach_reviews') is null or to_regclass('public.court_reviews') is null
     or to_regprocedure('public.is_suspended(uuid)') is null or to_regprocedure('public.is_blocked_between(uuid, uuid)') is null then
    raise exception 'Migration 145 stopped before changing anything: migrations 21, 35, 60, 66 and 67 have to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]) <> 1
       or exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]
                  and md5(p.prosrc) not in (expected[i][2], expected[i][3])) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 145 stopped before changing anything: % is not as this file expects (run 128 first; or it changed after Oct 5, and this file must be brought up to date with that change first).', array_to_string(wrong, ', ');
  end if;
end $$;

-- ----------------------------------------- 1. whose a reported thing is
-- As 128, plus a group, a coach's page, a coach review and a court note.
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
  -- (145) An account ("profile:<id>", since Oct 6): that account. An older app's plain
  -- "profile" names nobody in the target, and keeps the person it sent.
  elsif kind = 'profile' then
    new.target_user_id := coalesce((select p.id from public.profiles p where p.id = tid), new.target_user_id);
  -- (145) A group: whoever started it, or (if they have gone) its longest-standing admin.
  elsif kind = 'group' then
    new.target_user_id := coalesce(
      (select g.created_by from public.feed_groups g where g.id = tid),
      (select m.user_id from public.feed_group_members m where m.group_id = tid and m.role = 'admin' order by m.joined_at, m.user_id limit 1));
  -- (145) A coach's page, and a review of a coach.
  elsif kind = 'coach' then
    new.target_user_id := (select c.user_id from public.coaches c where c.id = tid);
  elsif kind = 'coach-review' then
    new.target_user_id := (select r.author_id from public.coach_reviews r where r.id = tid);
  -- (145) A court note is never named: its words (the reason) on that court find who wrote it.
  elsif kind = 'court-note' then
    new.target_user_id := (select v.user_id from public.court_reviews v
                           where v.court_id = thing and v.notes = new.reason order by v.updated_at desc limit 1);
  end if;
  return new;
end $$;


-- A reported coach review, court note or group stays hidden for you on every device (as 128, plus those).
create or replace function public.my_reported_targets()
returns setof text
language sql stable security definer set search_path = public
as $$
  select distinct target from public.reports
  where reporter_id = auth.uid() and target ~ '^(post|hit|hit-request|question|answer|comment|coach-question|coach-reply|tip|coach-review|court-note|group):';
$$;
revoke all on function public.my_reported_targets() from public, anon;
grant execute on function public.my_reported_targets() to authenticated;

-- The admins' alert names it (as 128, plus the new kinds).
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
        when 'group' then 'Reported a group' when 'coach' then 'Reported a coach page' when 'coach-review' then 'Reported a coach review'
        when 'court-note' then 'Reported a court note'
        when 'conversation' then case when new.reason like 'message:%' then 'Reported a message' else 'Reported a chat' end
        else 'Sent a report' end,
      false);
  end loop;
  return new;
end $$;

-- The reports table's own functions stay its own (as 128 left them).
revoke all on function public.stamp_report() from public, anon, authenticated;
revoke all on function public.notify_admins_of_report() from public, anon, authenticated;

-- ------------------------------------------------------------- 2. court notes
-- As 109 (and 64), plus: no note by anyone suspended, or by anyone blocked
-- either way with whoever is asking (signed out, nobody is). Only when
-- court_facts is as 109 left it (or as this file does); otherwise a notice.
do $outer$
declare
  now_md5 text := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.court_facts(text[])'));
begin
  if now_md5 is null or now_md5 not in ('ecb4b7d9a2f7aa64700494026786b79c', '6f65a8f2316b37de544b8e435bc39e72') then
    raise notice 'Migration 145: court notes were left as they are (court_facts is not as migration 109 leaves it). Run 109, then this file again.';
    return;
  end if;
  execute $fn$
create or replace function public.court_facts(ids text[])
returns table (court_id text, players int, lights_yes int, lights_no int, nets_good int, nets_bad int,
  surface_good int, surface_cracked int, surface_wet int, busy jsonb, busy_answers int, busy_never int, notes jsonb,
  access text, access_by text, fee boolean, indoor boolean, book_url text, updated_at timestamptz)
language sql stable security definer set search_path = public as $body$
  with wanted as (select distinct x as id from unnest(ids[1:50]) as x where x is not null),
  said as (
    select v.* from public.court_reviews v
    where v.court_id in (select id from wanted) and v.updated_at > now() - interval '18 months'
      and (v.lights is not null or v.nets is not null or v.surface is not null or v.busy is not null or v.access is not null or v.notes is not null)
  )
  select c.id,
    coalesce(t.players, 0), coalesce(t.lights_yes, 0), coalesce(t.lights_no, 0), coalesce(t.nets_good, 0), coalesce(t.nets_bad, 0),
    coalesce(t.surface_good, 0), coalesce(t.surface_cracked, 0), coalesce(t.surface_wet, 0),
    coalesce(b.busy, '{}'::jsonb), coalesce(t.busy_answers, 0), coalesce(t.busy_never, 0), coalesce(n.notes, '[]'::jsonb),
    c.access, c.access_by, c.fee, c.indoor, c.book_url, t.last
  from public.courts c
  left join lateral (
    select count(*)::int as players,
      count(*) filter (where s.lights)::int as lights_yes, count(*) filter (where not s.lights)::int as lights_no,
      count(*) filter (where s.nets = 'good')::int as nets_good, count(*) filter (where s.nets = 'bad')::int as nets_bad,
      count(*) filter (where s.surface = 'good')::int as surface_good, count(*) filter (where s.surface = 'cracked')::int as surface_cracked,
      count(*) filter (where s.surface = 'wet-prone')::int as surface_wet,
      count(*) filter (where s.busy is not null)::int as busy_answers,
      count(*) filter (where cardinality(s.busy) = 0)::int as busy_never, max(s.updated_at) as last
    from said s where s.court_id = c.id) t on true
  left join lateral (
    select jsonb_object_agg(part, k) as busy from (
      select part, count(*)::int as k from said s, unnest(s.busy) as part where s.court_id = c.id group by part) x) b on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('text', y.notes, 'on', y.updated_at::date) order by y.updated_at desc) as notes from (
      select s.notes, s.updated_at from said s
      where s.court_id = c.id and s.notes is not null and public.known_adult(s.user_id)
        and not public.is_suspended(s.user_id) and not public.is_blocked_between(s.user_id, auth.uid())
      order by s.updated_at desc limit 3) y) n on true
  where c.id in (select id from wanted)
$body$
$fn$;
  -- Who may ask, as migration 60 set it (create or replace keeps it; said again so it stays so).
  revoke all on function public.court_facts(text[]) from public;
  grant execute on function public.court_facts(text[]) to anon, authenticated;
  if (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.court_facts(text[])')) is distinct from '6f65a8f2316b37de544b8e435bc39e72' then
    raise exception 'Migration 145 stopped: court_facts did not come out as written. Nothing was changed.';
  end if;
end $outer$;

-- ------------------------------------------------------------- 3. made as written
do $$
begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
             and ((p.proname = 'stamp_report' and md5(p.prosrc) <> 'a242082b75189a967c163ca8ec5ee0aa')
               or (p.proname = 'my_reported_targets' and md5(p.prosrc) <> '5f70e8b56150e99b1262b53f2c73e885')
               or (p.proname = 'notify_admins_of_report' and md5(p.prosrc) <> '3cc7c3fdff002f8fae27e48c11fb26bc'))) then
    raise exception 'Migration 145 stopped: it did not come out as written. Nothing was changed.';
  end if;
end $$;

commit;

-- Checks afterwards (each should say what is in brackets):
-- select proname, md5(prosrc) from pg_proc where proname in ('stamp_report', 'my_reported_targets', 'notify_admins_of_report', 'court_facts');
--   (stamp_report a242082b75189a967c163ca8ec5ee0aa · my_reported_targets 5f70e8b56150e99b1262b53f2c73e885
--    notify_admins_of_report 3cc7c3fdff002f8fae27e48c11fb26bc
--    court_facts 6f65a8f2316b37de544b8e435bc39e72, or 4072f6fc09fceb91cbf7e52e21ec44e2 while 109 hasn't run)
-- Then, in a transaction you undo (begin; … rollback;), as a player: a report
-- 'group:<a group id>' naming nobody comes out naming its creator; a
-- 'court-note:<court>:x' report whose reason is a note's exact words comes
-- out naming that note's writer; both admins get "Reported a group" and
-- "Reported a court note".
