-- CourtSide · migration 20261029000200: "Show your tennis to friends?", one
-- phone alert, once, to a player who never chose who sees the tennis that
-- logs itself.
--
-- NOT APPLIED. Run it in the Supabase SQL editor as one piece, after 193
-- (live). Ship order: first the app update that has the card it opens
-- (app/auto-log-ask, on the "production" channel, never "store"); this runs
-- only once that update is out. An app without the card opens Notifications
-- from the alert instead (harmless: its "Tennis logged" rows are there).
-- All-or-nothing: if a check fails, it stops and nothing at all changes.
-- Safe to run more than once. Undo: supabase/rollback/200_undo.sql.
--
-- The owner, Oct 29: "Can you somehow push them to pick friends", then
-- "Show to friends should be emphasized and pushed hard".
--
-- Who gets it: a player whose user_state.auto_log_audience is still null
-- (never chosen: everyone who connected before 193, and every Apple Health
-- player who has not chosen), with at least one session the server logged
-- for them that they have not posted themselves, so it is saved for them
-- alone. Exactly once, ever (public.nudges, kind 'auto-log-ask'): never
-- repeated, whatever they answer or if they ignore it.
--
-- What it says (the app's own words, no marketing; Apple 4.5.4):
--   "CourtSide" / "Your tennis from Tuesday is saved. Want friends to see it?"
--   ("from today", "from yesterday", a weekday in the last week, else the
--   date; several: "Your 3 tennis sessions are saved. Want friends to see
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
-- Left as they are: who sees anything (still nothing until they choose), the
-- alerts and reminders already there, the posts.

begin;

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

-- ------------------------------------------------------------- 1. the alert
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
    select us.user_id as u, us.tz, count(*) as n, max(p.created_at) as last_at
      from public.user_state us
      join public.posts p on p.author_id = us.user_id and p.auto_logged and jsonb_typeof(p.session) = 'object'
     where us.auto_log_audience is null
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
        v_played := (r.last_at at time zone r.tz)::date;
        v_when := case
          when v_played >= v_today then 'from today'
          when v_played = v_today - 1 then 'from yesterday'
          when v_played > v_today - 7 then 'from ' || to_char(r.last_at at time zone r.tz, 'FMDay')
          else 'from ' || to_char(r.last_at at time zone r.tz, 'FMMon FMDD') end;
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

-- ------------------------------------------------------------- 2. the job
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

-- ------------------------------------------------------------- 3. last check
do $$
begin
  if to_regprocedure('public.send_auto_log_asks(timestamp with time zone, boolean)') is null
     or has_function_privilege('anon', 'public.send_auto_log_asks(timestamp with time zone, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.send_auto_log_asks(timestamp with time zone, boolean)', 'execute') then
    raise exception 'Migration 20261029000200 stopped: the result was not as planned; nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------------- DRY RUN
-- Who would be asked RIGHT NOW, in the exact words. Sends nothing:
-- select n.who, p.handle, n.words from public.send_auto_log_asks(now(), true) n join public.profiles p on p.id = n.who;
--
-- Everyone it is for, whatever the hour (never chosen, a session saved for
-- them alone, alerts switch on, not asked yet):
-- select count(*) from (select us.user_id from public.user_state us join public.posts p on p.author_id = us.user_id and p.auto_logged
--   where us.auto_log_audience is null and us.push_activity is not false
--     and not exists (select 1 from public.nudges n where n.user_id = us.user_id and n.kind = 'auto-log-ask') group by us.user_id) x;

-- ------------------------------------------------- 4. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
-- (a) The hourly job (expect courtside-auto-log-ask, 55 * * * *):
-- select jobname, schedule from cron.job where jobname = 'courtside-auto-log-ask';
-- (b) Sent so far, and how many of those chose since (Friends / Only me):
-- select count(*) as sent,
--        count(*) filter (where us.auto_log_audience = 'mutuals') as friends,
--        count(*) filter (where us.auto_log_audience = 'private') as only_me
--   from public.nudges n join public.user_state us on us.user_id = n.user_id where n.kind = 'auto-log-ask';
