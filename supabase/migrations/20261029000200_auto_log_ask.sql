-- CourtSide · migration 20261029000200: "Show your tennis to friends?", one
-- phone alert, once, to a player who never chose who sees the tennis that
-- logs itself.
--
-- NOT APPLIED. Run it in the Supabase SQL editor as one piece, after 193
-- (live). Ship order: first the app update that has the card it opens
-- (app/auto-log-ask, on the "production" channel, never "store"); this runs
-- only once that update is out. And it goes only to an account whose phone
-- has run that update (it says so once a launch, public.auto_log_ask_ready,
-- into public.auto_log_ask_phones): never to a phone on an older version, as
-- the store's build 22 or a phone still opening an old saved copy, which
-- could not show the card (the alert is spent once sent). Its link stays
-- '/notifications?ask=auto-log', an address every version can open.
-- All-or-nothing: if a check fails, it stops and nothing at all changes.
-- Safe to run more than once. Undo: supabase/rollback/200_undo.sql.
--
-- The owner, Oct 29: "Can you somehow push them to pick friends", then
-- "Show to friends should be emphasized and pushed hard".
--
-- Who gets it: a player whose user_state.auto_log_audience is still null
-- (never chosen: everyone who connected before 193, and every Apple Health
-- player who has not chosen), whose phone has run the app that has the
-- card, with at least one session the server logged for them that they have
-- not posted themselves and that was not taken down, so it is saved for them
-- alone. Exactly once, ever (public.nudges, kind 'auto-log-ask'): never
-- repeated, whatever they answer or if they ignore it.
--
-- What it says (the app's own words, no marketing; Apple 4.5.4):
--   "CourtSide" / "Your tennis from Tuesday is saved. Want friends to see it?"
--   ("from today", "from yesterday", a weekday in the last week, else the
--   date: the day it was played, from its session; several: "Your 3 tennis sessions are saved. Want friends to see
--   them?"). No length, heart rate or place on the lock screen.
-- A tap opens "Show your tennis to friends?" in the app: "Show to friends"
-- or "Keep private", each saved as Settings saves it. Nothing is shared by
-- the alert itself; nothing changes until they choose.
--
-- On their terms, as every reminder (private.nudge_ok, migration 170):
-- only between 9am and 9pm their time, never on a day another reminder went
-- out, only with a phone that takes alerts, never to a suspended account.
-- Off with their "Tennis sessions" / "Workouts" alerts switch (push_activity).
-- Not within 3 hours of their latest session, so it never lands on top of
-- that session's own "Tennis logged" alert. Teens too (the same audience
-- the app offers them: friends who follow them back, no numbers).
--
-- New: public.auto_log_ask_phones (who has the app that shows the card; read
-- only by the job, written only through public.auto_log_ask_ready()).
-- Left as they are: who sees anything (still nothing until they choose), the
-- alerts and reminders already there, the posts, user_state.

begin;
set local lock_timeout = '5s';

-- ------------------------------------------------------------------ 0. check
do $$
declare
  r record;
  -- As read from the live database on Oct 29.
  want jsonb := '{
    "private.nudge_ok": "adc4d103bdf2614750836502a20fe093",
    "private.send_nudge": "37d2a560f48535dc551f9ab24b46de85",
    "public.send_push": "1350721d1183cbbf2084a10017aa11ab"
  }';
begin
  if to_regclass('public.nudges') is null or to_regclass('public.posts') is null or to_regclass('public.user_state') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'auto_log_audience')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'push_activity')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'tz')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'auto_logged')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'removed_at')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'practice_sessions' and column_name = 'activity_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'practice_sessions' and column_name = 'day')
     or to_regprocedure('private.nudge_ok(uuid, timestamp with time zone)') is null
     or to_regprocedure('private.send_nudge(uuid, text, text, text, text, timestamp with time zone)') is null then
    raise exception 'Migration 20261029000200 stopped before changing anything: migration 193 (sessions that log themselves) and the reminders (170) have to run first.';
  end if;
  for r in select k.key as fn, k.value #>> '{}' as ok,
                  (select max(md5(p.prosrc)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = split_part(k.key, '.', 1) and p.proname = split_part(k.key, '.', 2)) as now_is
             from jsonb_each(want) k loop
    if r.now_is is distinct from r.ok then
      raise exception 'Migration 20261029000200 stopped before changing anything: % changed since it was read on Oct 29. This file must be brought up to date with that change first.', r.fn;
    end if;
  end loop;
end $$;

-- ------------------------------------------- 1. phones that can show the card
-- The app with "Show your tennis to friends?" says so once a launch for the
-- account signed in (errors ignored; before this runs it simply is not
-- there). The alert below goes only to accounts in this list. Nobody can read
-- or change it directly; a second call changes nothing.
create table if not exists public.auto_log_ask_phones (
  user_id  uuid primary key references public.profiles(id) on delete cascade,
  ready_at timestamptz not null default now()
);
alter table public.auto_log_ask_phones enable row level security;
revoke all on public.auto_log_ask_phones from public, anon, authenticated;

create or replace function public.auto_log_ask_ready()
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  insert into public.auto_log_ask_phones (user_id)
    select pr.id from public.profiles pr where pr.id = auth.uid()
  on conflict (user_id) do nothing;
end $$;
revoke all on function public.auto_log_ask_ready() from public, anon, authenticated;
grant execute on function public.auto_log_ask_ready() to authenticated;

-- ------------------------------------------------------------- 2. the alert
-- Who would get it now (or gets it: p_dry_run false), in the exact words.
-- Run by the hourly job below; nobody else can call it.
create or replace function public.send_auto_log_asks(p_now timestamptz default now(), p_dry_run boolean default false)
returns table (who uuid, words text, link text)
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  w text;
  v_today date;
  v_played date;
  v_when text;
begin
  for r in
    select us.user_id as u, us.tz, count(*) as n, max(p.created_at) as last_at,
           -- The day it was played (its session's), else the day of the post's time (when it was played too).
           max(coalesce(ps.day, (p.created_at at time zone us.tz)::date)) as last_day
      from public.user_state us
      join public.posts p on p.author_id = us.user_id and p.auto_logged and jsonb_typeof(p.session) = 'object'
           and p.removed_at is null
      left join lateral (
             select s.day from public.practice_sessions s
              where s.user_id = p.author_id and s.activity_id::text = lower(p.session->>'activityId')
              order by s.day desc limit 1) ps on true
     where us.auto_log_audience is null
       -- Only a phone that has run the app with the card (an older one could not show it).
       and exists (select 1 from public.auto_log_ask_phones a where a.user_id = us.user_id)
       and us.push_activity is not false
       and us.tz is not null
       -- Not one they posted themselves since (that post stands for it, as auto_post_shown says).
       and not exists (
             select 1 from public.posts q
              where q.author_id = p.author_id and not q.auto_logged and jsonb_typeof(q.session) = 'object'
                and ((p.session ? 'sessionId' and lower(q.session->>'sessionId') = lower(p.session->>'sessionId'))
                  or (p.session ? 'activityId' and lower(q.session->>'activityId') = lower(p.session->>'activityId'))))
       and not exists (select 1 from public.nudges n where n.user_id = us.user_id and n.kind = 'auto-log-ask')
     group by us.user_id, us.tz
     order by us.user_id
  loop
    begin
      -- Never on top of that session's own "Tennis logged" alert.
      continue when r.last_at > p_now - interval '3 hours';
      -- 9am to 9pm their time, one reminder a day, a phone that takes alerts, not suspended.
      continue when not private.nudge_ok(r.u, p_now);
      if r.n > 1 then
        w := 'Your ' || r.n || ' tennis sessions are saved. Want friends to see them?';
      else
        v_today := (p_now at time zone r.tz)::date;
        v_played := r.last_day;
        v_when := case
          when v_played >= v_today then 'from today'
          when v_played = v_today - 1 then 'from yesterday'
          when v_played > v_today - 7 then 'from ' || to_char(v_played, 'FMDay')
          else 'from ' || to_char(v_played, 'FMMon FMDD') end;
        w := 'Your tennis ' || v_when || ' is saved. Want friends to see it?';
      end if;
      if not p_dry_run then
        -- Once ever (the nudges row's key): a second run sends nothing.
        continue when not private.send_nudge(r.u, 'auto-log-ask', '', w, '/notifications?ask=auto-log', p_now);
      end if;
      who := r.u; words := w; link := '/notifications?ask=auto-log';
      return next;
    exception when others then
      raise warning 'auto log ask for %: %', r.u, sqlerrm;
    end;
  end loop;
  return;
end $$;
revoke all on function public.send_auto_log_asks(timestamptz, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------- 3. the job
-- At 55 past every hour (after the other reminders). Scheduling the same
-- name again replaces it. Where pg_cron is off this says so and carries on.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('courtside-auto-log-ask', '55 * * * *', 'select count(*) from public.send_auto_log_asks()');
  else
    raise notice 'pg_cron not turned on: no "Show your tennis to friends?" alerts until it is';
  end if;
exception when others then
  raise notice 'pg_cron not set up (%): no "Show your tennis to friends?" alerts until it is', sqlerrm;
end $$;

-- ------------------------------------------------------------- 4. last check
do $$
begin
  if to_regprocedure('public.send_auto_log_asks(timestamp with time zone, boolean)') is null
     or has_function_privilege('anon', 'public.send_auto_log_asks(timestamp with time zone, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.send_auto_log_asks(timestamp with time zone, boolean)', 'execute') then
    raise exception 'Migration 20261029000200 stopped: the result was not as planned; nothing was changed.';
  end if;
  if to_regprocedure('public.auto_log_ask_ready()') is null or to_regclass('public.auto_log_ask_phones') is null
     or has_function_privilege('anon', 'public.auto_log_ask_ready()', 'execute')
     or not has_function_privilege('authenticated', 'public.auto_log_ask_ready()', 'execute')
     or has_table_privilege('authenticated', 'public.auto_log_ask_phones', 'select')
     or has_table_privilege('anon', 'public.auto_log_ask_phones', 'select') then
    raise exception 'Migration 20261029000200 stopped: the phones list was not as planned; nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------------- DRY RUN
-- Who would be asked RIGHT NOW, in the exact words. Sends nothing:
-- select n.who, p.handle, n.words from public.send_auto_log_asks(now(), true) n join public.profiles p on p.id = n.who;
--
-- Everyone it is for, whatever the hour (never chosen, a session saved for
-- them alone and not taken down, alerts switch on, not asked yet), and how
-- many of them have the app that shows the card so far (only those get it):
-- select count(*) as never_chosen, count(*) filter (where x.ready) as with_the_card
--   from (select us.user_id, bool_or(exists (select 1 from public.auto_log_ask_phones a where a.user_id = us.user_id)) as ready
--           from public.user_state us join public.posts p on p.author_id = us.user_id and p.auto_logged and p.removed_at is null
--          where us.auto_log_audience is null and us.push_activity is not false
--            and not exists (select 1 from public.nudges n where n.user_id = us.user_id and n.kind = 'auto-log-ask') group by us.user_id) x;

-- ------------------------------------------------- 5. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
-- (a) The hourly job (expect courtside-auto-log-ask, 55 * * * *):
-- select jobname, schedule from cron.job where jobname = 'courtside-auto-log-ask';
-- (b) Sent so far, and how many of those chose since (Friends / Only me):
-- select count(*) as sent,
--        count(*) filter (where us.auto_log_audience = 'mutuals') as friends,
--        count(*) filter (where us.auto_log_audience = 'private') as only_me
--   from public.nudges n join public.user_state us on us.user_id = n.user_id where n.kind = 'auto-log-ask';
