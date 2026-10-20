-- CourtSide · migration 20261021000170: when a Discussions question is
-- waiting with no answers, tell a few people likely to answer it (sweep item
-- R6, Oct 20).
--
-- The owner said yes on Oct 20; not yet run on the live database.
--
-- Why: a question nobody answers is the fastest way to lose the person who
-- asked it, and the people who could answer have no way of knowing it is
-- there unless they happen to open Discussions.
--
-- What it does, in plain words:
--   * A question that is 2 hours to 3 days old, still with no answer from
--     anyone but the asker, is shown to up to 3 people in total:
--       "Can you help? A technique question has no answers yet: “How do I
--        stop my toss drifting?”"
--     Tapping it opens the question.
--   * Who: people who have answered questions on the same topic in the last
--     6 months (most answers first), and, for technique and gear questions,
--     coaches. Never the asker; never anyone blocked either way, suspended,
--     or who muted the asker; never twice about the same question.
--   * Teen rules: it goes only to known adults, and only about questions
--     asked by known adults, so a teen's question is never pushed to adult
--     strangers and a teen is never pushed toward one (someone whose age we
--     do not know counts as a teen).
--   * At most one of the new come-back alerts (this and 171's) a day
--     per person, only between 9am and 9pm in their own time zone (someone
--     whose phone has not told us its time zone gets none).
--   * Its own switch: Settings → Notifications → "Questions you could
--     answer", on to start with.
--
-- How it runs: like the Monday weekly recap (migration 130). Supabase's
-- scheduler (pg_cron) runs it at 25 past every hour; it sends through
-- send_push like every other CourtSide alert. If the scheduler is not turned
-- on, this file says so and nothing is sent (see OWNER STEPS).
--
-- Touches no existing function, rule or trigger. Adds: the nudges table
-- (shared with 171), user_state.push_questions, and the functions
-- private.nudge_ok, private.send_nudge, public.send_question_nudges. Needs
-- (all live): user_state.tz (130), push_tokens and send_push (14, 106),
-- known_adult (109), is_blocked_between (21), questions and answers with
-- removed_at (8, 108). Stops before changing anything if any is missing.
-- Safe to run more than once.
--
-- ------------------------------------------------------------ OWNER STEPS
-- 1. Supabase → SQL Editor → New query, paste this whole file, press Run.
--    "Success" means it is in. Anything else: nothing was changed.
-- 2. Check the scheduler with check (a) at the bottom. If it shows no row,
--    the scheduler is off: Supabase → Database → Extensions → search
--    "pg_cron" → turn it on, then run this file again.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.user_state') is null
     or to_regclass('public.push_tokens') is null or to_regclass('public.questions') is null
     or to_regclass('public.answers') is null
     or to_regprocedure('public.send_push(uuid, text, text, text)') is null
     or to_regprocedure('public.known_adult(uuid)') is null
     or to_regprocedure('public.is_blocked_between(uuid, uuid)') is null then
    raise exception 'Migration 170 stopped before changing anything: a table or function it needs is missing (see "Needs" at the top).';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'tz')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'questions' and column_name = 'removed_at')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'answers' and column_name = 'removed_at') then
    raise exception 'Migration 170 stopped before changing anything: a column it needs is missing (user_state.tz, questions.removed_at or answers.removed_at).';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'push_questions' and data_type <> 'boolean') then
    raise exception 'Migration 170 stopped before changing anything: user_state already has a push_questions column that is not a yes/no.';
  end if;
  if to_regclass('public.nudges') is not null and not exists (
       select 1 from information_schema.columns where table_schema = 'public' and table_name = 'nudges' and column_name = 'ref') then
    raise exception 'Migration 170 stopped before changing anything: a nudges table is already there and is not this file''s.';
  end if;
end $$;

-- ------------------------------------------- 1. the come-back alerts' notebook
-- (Word for word the same in migrations 170 and 171, so either of them
-- can run without the other, in any order, and running it again changes
-- nothing.)
--
-- One line per come-back alert sent: who got it, which kind, what it was
-- about, the words and when. It is how "at most one of these a day", "at
-- most 2 ever" and "never twice about the same thing" are kept. Nobody can
-- read or write it from the app or the website; the owner reads it in the
-- SQL editor (the admin preview at the bottom of each file).
create schema if not exists private;

create table if not exists public.nudges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind    text not null check (char_length(kind) between 1 and 40),
  ref     text not null default '' check (char_length(ref) <= 80),
  words   text check (char_length(words) <= 300),
  href    text check (char_length(href) <= 200),
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
create index if not exists nudges_sent_idx on public.nudges (user_id, sent_at desc);
alter table public.nudges enable row level security;
revoke all on public.nudges from public, anon, authenticated;

-- May this person get a come-back alert at this moment? Only when:
--   * their phone has told us its time zone (set_my_time_zone, migration
--     130); without it we cannot tell their night, so they get none;
--   * it is between 9am and 9pm there;
--   * they have had none of these alerts today (their own day);
--   * the account is not suspended;
--   * a phone of theirs can receive it (a website-only account gets none,
--     and so uses up nothing).
create or replace function private.nudge_ok(u uuid, p_now timestamptz)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  zone text;
  here timestamp;
begin
  if u is null then return false; end if;
  select us.tz into zone from public.user_state us where us.user_id = u;
  if zone is null then return false; end if;
  begin
    here := p_now at time zone zone;
  exception when others then
    return false;
  end;
  if extract(hour from here) < 9 or extract(hour from here) >= 21 then return false; end if;
  if exists (select 1 from public.profiles p where p.id = u and p.suspended_at is not null) then return false; end if;
  if not exists (select 1 from public.push_tokens t where t.user_id = u) then return false; end if;
  return not exists (select 1 from public.nudges n where n.user_id = u
    and n.sent_at > p_now - interval '36 hours' and (n.sent_at at time zone zone)::date = here::date);
end $$;
revoke all on function private.nudge_ok(uuid, timestamptz) from public, anon, authenticated;

-- Writes the line, then sends the alert through send_push, the way every
-- other CourtSide alert goes out (two lines: CourtSide on top, the words
-- underneath). False, and nothing sent, when this exact alert (same person,
-- kind and subject) was sent before.
create or replace function private.send_nudge(u uuid, p_kind text, p_ref text, p_words text, p_href text, p_at timestamptz)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  insert into public.nudges (user_id, kind, ref, words, href, sent_at)
    values (u, p_kind, coalesce(p_ref, ''), left(p_words, 300), left(p_href, 200), coalesce(p_at, now()))
    on conflict (user_id, kind, ref) do nothing;
  if not found then return false; end if;
  perform public.send_push(u, 'CourtSide', p_words, p_href);
  return true;
end $$;
revoke all on function private.send_nudge(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
-- ------------------------------------------------- 2. the switch in Settings
-- Settings → Notifications → "Questions you could answer". On to start with;
-- off, none of these alerts is sent.
alter table public.user_state add column if not exists push_questions boolean not null default true;

-- To find the questions still waiting quickly.
create index if not exists questions_created_idx on public.questions (created_at desc);

-- ------------------------------------------ 3. questions waiting for an answer
-- The hourly job: see the top of this file for the rules. Oldest question
-- first (it has waited longest), each told to at most 3 people in total
-- (over all runs). p_now is for testing. p_dry_run true sends nothing and
-- writes nothing: it only lists what would go out right now (see DRY RUN at
-- the bottom). Returns one line per alert sent (or that would be sent).
create or replace function public.send_question_nudges(p_now timestamptz default now(), p_dry_run boolean default false)
returns table (who uuid, nudge text, words text, link text)
language plpgsql volatile security definer set search_path = public as $$
declare
  q record;
  c record;
  told int;
  w text;
  topic_words text;
  planned uuid[] := '{}';
begin
  for q in
    select qq.id, qq.author_id, qq.topic, btrim(regexp_replace(qq.title, '\s+', ' ', 'g')) as title
      from public.questions qq
      join public.profiles a on a.id = qq.author_id
     where qq.removed_at is null
       and qq.created_at between p_now - interval '3 days' and p_now - interval '2 hours'
       and a.suspended_at is null
       and public.known_adult(qq.author_id)
       and char_length(btrim(qq.title)) > 0
       and not exists (select 1 from public.answers x where x.question_id = qq.id and x.removed_at is null and x.author_id <> qq.author_id)
     order by qq.created_at
     limit 200
  loop
    begin
      select count(*)::int into told from public.nudges n where n.kind = 'question' and n.ref = q.id::text;
      continue when told >= 3;
      topic_words := case q.topic when 'mental' then 'mental game' else coalesce(nullif(q.topic, ''), 'tennis') end;
      -- chr(8220) / chr(8221) are curly quotes and chr(8230) the ellipsis, written so they survive any copy and paste.
      w := 'Can you help? ' || case when topic_words ~ '^[aeiou]' then 'An ' else 'A ' end || topic_words
        || ' question has no answers yet: ' || chr(8220)
        || case when char_length(q.title) > 90 then left(q.title, 89) || chr(8230) else q.title end || chr(8221);
      for c in
        select p.id
          from public.profiles p
          join public.user_state us on us.user_id = p.id
          left join lateral (
            select count(*)::int as n from public.answers a2 join public.questions q2 on q2.id = a2.question_id
             where a2.author_id = p.id and a2.removed_at is null and q2.topic = q.topic and q2.id <> q.id
               and q2.author_id <> p.id and a2.created_at > p_now - interval '180 days') past on true
         where p.id <> q.author_id
           and p.suspended_at is null
           and us.push_questions is not false
           and (past.n > 0 or (p.is_coach and q.topic in ('technique', 'gear')))
           and public.known_adult(p.id)
           and not public.is_blocked_between(p.id, q.author_id)
           and not (q.author_id::text = any (coalesce(us.muted_ids, '{}') || coalesce(us.blocked_ids, '{}')))
           and not exists (select 1 from public.nudges n where n.user_id = p.id and n.kind = 'question' and n.ref = q.id::text)
         order by past.n desc, p.is_coach desc, p.id
         limit 50
      loop
        exit when told >= 3;
        continue when c.id = any (planned);
        continue when not private.nudge_ok(c.id, p_now);
        if p_dry_run then
          planned := planned || c.id;
        elsif not private.send_nudge(c.id, 'question', q.id::text, w, '/question/' || q.id, p_now) then
          continue;
        end if;
        told := told + 1;
        who := c.id; nudge := 'question'; words := w; link := '/question/' || q.id;
        return next;
      end loop;
    exception when others then
      raise warning 'question nudges for %: %', q.id, sqlerrm;
    end;
  end loop;
  return;
end $$;
revoke all on function public.send_question_nudges(timestamptz, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------- 4. the scheduler
-- At 25 past every hour. Scheduling the same job name again replaces it.
-- Where pg_cron is not turned on this says so and carries on (nothing sent).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('courtside-question-nudges', '25 * * * *', 'select count(*) from public.send_question_nudges()');
  else
    raise notice 'pg_cron not turned on: no "Can you help?" alerts until it is (see OWNER STEPS)';
  end if;
exception when others then
  raise notice 'pg_cron not set up (%): no "Can you help?" alerts until it is (see OWNER STEPS)', sqlerrm;
end $$;

-- ------------------------------------------------------------- 5. last check
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'push_questions')
     or not (select relrowsecurity from pg_class where oid = 'public.nudges'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nudges')
     or has_table_privilege('anon', 'public.nudges', 'select') or has_table_privilege('authenticated', 'public.nudges', 'select')
     or has_table_privilege('authenticated', 'public.nudges', 'insert')
     or has_function_privilege('anon', 'public.send_question_nudges(timestamp with time zone, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.send_question_nudges(timestamp with time zone, boolean)', 'execute')
     or has_function_privilege('authenticated', 'private.nudge_ok(uuid, timestamp with time zone)', 'execute')
     or has_function_privilege('authenticated', 'private.send_nudge(uuid, text, text, text, text, timestamp with time zone)', 'execute') then
    raise exception 'Migration 170 stopped: the result was not as planned; nothing was changed.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ------------------------------------------------------------- DRY RUN
-- Who would be asked RIGHT NOW, about which question, in the exact words.
-- Sends nothing, writes nothing (safe to run any time after this file):
-- select n.who, p.handle, n.words, n.link from public.send_question_nudges(now(), true) n join public.profiles p on p.id = n.who;
-- The questions waiting right now with no answer (whether or not anyone would be asked):
-- select q.created_at, q.topic, q.title from public.questions q where q.removed_at is null and q.created_at > now() - interval '3 days' and not exists (select 1 from public.answers a where a.question_id = q.id and a.removed_at is null and a.author_id <> q.author_id) order by 1;

-- ------------------------------------------------- 6. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
-- (a) The hourly job (expect courtside-question-nudges, 25 * * * *; no row
--     means pg_cron is off, see OWNER STEPS):
-- select jobname, schedule from cron.job where jobname = 'courtside-question-nudges';
-- (b) ADMIN PREVIEW: the last 50 "Can you help?" alerts, and whether that question got an answer afterwards:
-- select n.sent_at, p.handle, n.words, exists (select 1 from public.answers a where a.question_id::text = n.ref and a.created_at > n.sent_at) as answered_after from public.nudges n join public.profiles p on p.id = n.user_id where n.kind = 'question' order by n.sent_at desc limit 50;
-- (c) How many have switched it off:
-- select count(*) filter (where push_questions is false) as off, count(*) as everyone from public.user_state;
