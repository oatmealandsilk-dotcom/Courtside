-- CourtSide · migration 20261021000180: a weekly streak you share with a
-- hitting partner (sweep item R12, Oct 20).
--
-- The owner said yes on Oct 20; not yet run on the live database.
--
-- Why: like a Duolingo friend streak, but by the week, because tennis is
-- weekly. Two players who are on the same logged session at least once in
-- a calendar week (Monday to Sunday) keep a streak going together.
--
-- What it does, in plain words:
--   * "Played together" reuses the session tags (migrations 62 and 77):
--     a session logged by one of them with the other tagged and ACCEPTED,
--     or a session someone else logged with both of them tagged and both
--     accepted (a doubles four). Pending, declined, removed or dropped tags
--     never count, and neither does a copy in the tagged person's log (the
--     original counts once). No place, no time of day: only the session's
--     own day.
--   * The week is the players' own: a session's day is the day on the
--     logger's own calendar, and "this week" is worked out in the reader's
--     own time zone (user_state.tz, migration 130; UTC when the phone has
--     not said).
--   * partner_streaks keeps one line per pair: the current run of weeks in
--     a row, its last week, and the best run. Worked out again from the
--     tags whenever a tag is made, accepted, declined, taken off or
--     dropped, a session's day changes, or a session is deleted (triggers
--     below), so it is never stale. Nobody reads or writes the table from
--     the app.
--   * Who sees it: ONLY the two players, each about the other (on the
--     other's profile next to Head to head, and in their own Tennis
--     profile). Never anyone else. And only while they may see each other
--     by the teen rules: they follow each other, or both are known adults
--     (two adults who played together). Never across a block, never a
--     suspended account. A streak shows from 2 weeks in a row, while it is
--     alive: this week already played, or last week played and this week
--     still open.
--   * A small celebration at 4, 10 and 25 weeks: my_partner_streaks says
--     which milestone each player has not yet seen; the app shows it once
--     and calls seen_partner_streak. Nothing is sent for it.
--   * One gentle weekend reminder when a streak of 2+ weeks has nothing yet
--     this week: "Your 🔥 5-week streak with Sam ends Sunday. Get a hit in
--     this weekend?" On Saturday or Sunday in the player's own time zone,
--     at most once a week, naming the longest open streak. It is one of the
--     come-back alerts of migrations 170/171: at most one of those a day,
--     only 9am to 9pm their time, only to a phone that can get it. Its own
--     switch: Settings → Notifications → "Partner streak reminders", on to
--     start with.
--
-- Adds: partner_streaks, user_state.push_partner_streak, three triggers on
-- session_tags and practice_sessions, private.partner_streak_recompute,
-- private.partner_streak_pairs, public.my_partner_streaks,
-- public.seen_partner_streak, public.send_partner_streak_nudges, and the
-- come-back alerts' notebook (word for word as in 170 and 171, so this file
-- runs before or after them). Touches no existing function, rule or
-- trigger. Needs (all live): session_tags (62, 77), practice_sessions (39,
-- 62), user_state.tz (130), push_tokens and send_push (14, 106), known_adult
-- (109), is_blocked_between (21), follow_each_other (60). Stops before
-- changing anything if any is missing. Safe to run more than once.
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
     or to_regclass('public.push_tokens') is null or to_regclass('public.practice_sessions') is null
     or to_regclass('public.session_tags') is null
     or to_regprocedure('public.send_push(uuid, text, text, text)') is null
     or to_regprocedure('public.known_adult(uuid)') is null
     or to_regprocedure('public.is_blocked_between(uuid, uuid)') is null
     or to_regprocedure('public.follow_each_other(uuid, uuid)') is null then
    raise exception 'Migration 180 stopped before changing anything: a table or function it needs is missing (see "Needs" at the top).';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'tz')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'practice_sessions' and column_name = 'from_session_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'session_tags' and column_name = 'tagger_dropped') then
    raise exception 'Migration 180 stopped before changing anything: a column it needs is missing (user_state.tz, practice_sessions.from_session_id or session_tags.tagger_dropped).';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'push_partner_streak' and data_type <> 'boolean') then
    raise exception 'Migration 180 stopped before changing anything: user_state already has a push_partner_streak column that is not a yes/no.';
  end if;
  if to_regclass('public.nudges') is not null and not exists (
       select 1 from information_schema.columns where table_schema = 'public' and table_name = 'nudges' and column_name = 'ref') then
    raise exception 'Migration 180 stopped before changing anything: a nudges table is already there and is not migration 170''s.';
  end if;
end $$;

-- ------------------------------------------- 1. the come-back alerts' notebook
-- (Word for word the same as in migrations 170 and 171, so any of the three
-- can run without the others, in any order, and running it again changes
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

-- ------------------------------------------------------------ 2. the table
-- One line per pair that has ever played together, the smaller id first.
-- weeks: the latest run of weeks in a row, ending at last_week (a Monday).
-- seen_lo / seen_hi: the highest milestone (4, 10, 25) each side has been
-- shown. Nobody reads or writes it from the app: my_partner_streaks does.
create table if not exists public.partner_streaks (
  user_lo   uuid not null references public.profiles(id) on delete cascade,
  user_hi   uuid not null references public.profiles(id) on delete cascade,
  weeks     int  not null check (weeks >= 1),
  last_week date not null,
  best      int  not null check (best >= 1),
  seen_lo   int  not null default 0,
  seen_hi   int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_lo, user_hi),
  check (user_lo < user_hi)
);
create index if not exists partner_streaks_hi_idx on public.partner_streaks (user_hi);
alter table public.partner_streaks enable row level security;
revoke all on public.partner_streaks from public, anon, authenticated;

-- The switch: Settings → Notifications → "Partner streak reminders".
alter table public.user_state add column if not exists push_partner_streak boolean not null default true;

-- ------------------------------------------------- 3. working a pair out again
-- Every Monday on which the two played together (see the top), then the
-- latest run of weeks in a row and the longest. No weeks: the line goes.
-- A milestone already seen stays seen, unless the run starts again lower
-- (then a new 4 weeks is celebrated again).
create or replace function private.partner_streak_recompute(a uuid, b uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  lo uuid := least(a, b);
  hi uuid := greatest(a, b);
  v_weeks int;
  v_last date;
  v_best int;
begin
  if a is null or b is null or a = b then return; end if;
  with together as (
    -- Logged by one, the other tagged and accepted.
    select s.day
      from public.practice_sessions s
      join public.session_tags t on t.session_id = s.id and t.tagger_id = s.user_id
     where s.from_session_id is null and t.status = 'accepted' and not t.tagger_dropped
       and ((s.user_id = lo and t.tagged_id = hi) or (s.user_id = hi and t.tagged_id = lo))
    union all
    -- Logged by someone else, both tagged and both accepted.
    select s.day
      from public.practice_sessions s
      join public.session_tags t1 on t1.session_id = s.id and t1.tagger_id = s.user_id and t1.tagged_id = lo
      join public.session_tags t2 on t2.session_id = s.id and t2.tagger_id = s.user_id and t2.tagged_id = hi
     where s.from_session_id is null
       and t1.status = 'accepted' and not t1.tagger_dropped
       and t2.status = 'accepted' and not t2.tagger_dropped
  ), wk as (
    select distinct date_trunc('week', day)::date as w from together
  ), runs as (
    -- Weeks in a row share the same (Monday minus 7 days times its place).
    select w, w - (7 * row_number() over (order by w))::int as grp from wk
  ), grouped as (
    select grp, count(*)::int as n, max(w) as last from runs group by grp
  )
  select (select n from grouped order by last desc limit 1),
         (select max(last) from grouped),
         (select max(n) from grouped)
    into v_weeks, v_last, v_best;

  if v_weeks is null then
    delete from public.partner_streaks where user_lo = lo and user_hi = hi;
    return;
  end if;
  insert into public.partner_streaks as p (user_lo, user_hi, weeks, last_week, best, updated_at)
    values (lo, hi, v_weeks, v_last, v_best, now())
  on conflict (user_lo, user_hi) do update
    set weeks = excluded.weeks, last_week = excluded.last_week, best = excluded.best, updated_at = now(),
        seen_lo = least(p.seen_lo, excluded.weeks), seen_hi = least(p.seen_hi, excluded.weeks);
end $$;
revoke all on function private.partner_streak_recompute(uuid, uuid) from public, anon, authenticated;

-- Every pair on one session that includes `who` (the logger and everyone
-- tagged on it, whatever their answer), worked out again.
create or replace function private.partner_streak_pairs(p_session uuid, who uuid, p_owner uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  other uuid;
begin
  for other in
    select x from (
      select p_owner as x
      union select s.user_id from public.practice_sessions s where s.id = p_session
      union select t.tagged_id from public.session_tags t where t.session_id = p_session
    ) people where x is not null and x <> who
  loop
    perform private.partner_streak_recompute(who, other);
  end loop;
end $$;
revoke all on function private.partner_streak_pairs(uuid, uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ 4. the triggers
-- A tag made, answered, taken off or dropped.
create or replace function private.partner_streak_on_tag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    perform private.partner_streak_pairs(old.session_id, old.tagged_id, old.tagger_id);
  end if;
  perform private.partner_streak_pairs(new.session_id, new.tagged_id, new.tagger_id);
  return null;
exception when others then
  -- A streak must never stop a tag from being saved.
  raise warning 'partner streak (tag): %', sqlerrm;
  return null;
end $$;
revoke all on function private.partner_streak_on_tag() from public, anon, authenticated;

drop trigger if exists partner_streak_on_tag on public.session_tags;
create trigger partner_streak_on_tag
  after insert or update of status, tagger_dropped, session_id, tagged_id on public.session_tags
  for each row execute function private.partner_streak_on_tag();

-- Tags gone: taken away, or their session deleted (the tags go with it).
-- Worked out once for the whole lot, so two players tagged on the same
-- deleted session (a doubles four someone else logged) are worked out
-- again too, though neither of their tags is still there to say so.
create or replace function private.partner_streak_on_tag_gone() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select distinct least(a, b) as a, greatest(a, b) as b from (
      select g.tagged_id as a, g.tagger_id as b from gone g
      union all
      select g1.tagged_id, g2.tagged_id from gone g1 join gone g2 on g2.session_id = g1.session_id and g2.tagged_id <> g1.tagged_id
    ) x where a <> b
  loop
    perform private.partner_streak_recompute(r.a, r.b);
  end loop;
  -- Anyone still on a session that lost a tag (a tag taken off, the session kept).
  for r in select distinct g.session_id, g.tagged_id, g.tagger_id from gone g loop
    perform private.partner_streak_pairs(r.session_id, r.tagged_id, r.tagger_id);
  end loop;
  return null;
exception when others then
  raise warning 'partner streak (tag gone): %', sqlerrm;
  return null;
end $$;
revoke all on function private.partner_streak_on_tag_gone() from public, anon, authenticated;

drop trigger if exists partner_streak_on_tag_gone on public.session_tags;
create trigger partner_streak_on_tag_gone
  after delete on public.session_tags
  referencing old table as gone
  for each statement execute function private.partner_streak_on_tag_gone();

-- A session's day moved (another week), or it turned into / out of a copy.
create or replace function private.partner_streak_on_session() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t record;
begin
  for t in select tagged_id from public.session_tags where session_id = new.id loop
    perform private.partner_streak_pairs(new.id, t.tagged_id, new.user_id);
  end loop;
  return null;
exception when others then
  raise warning 'partner streak (session): %', sqlerrm;
  return null;
end $$;
revoke all on function private.partner_streak_on_session() from public, anon, authenticated;

drop trigger if exists partner_streak_on_session on public.practice_sessions;
create trigger partner_streak_on_session
  after update of day, from_session_id on public.practice_sessions
  for each row when (old.day is distinct from new.day or old.from_session_id is distinct from new.from_session_id)
  execute function private.partner_streak_on_session();

-- ------------------------------------------------------- 5. the weeks, in words
-- Monday of the week `p_now` falls in, in this person's own time zone (UTC
-- when their phone has not told us, or the zone is not one we know).
create or replace function private.partner_streak_this_week(u uuid, p_now timestamptz)
returns date language plpgsql stable security definer set search_path = public as $$
declare
  zone text;
  d date;
begin
  select us.tz into zone from public.user_state us where us.user_id = u;
  begin
    d := (p_now at time zone coalesce(zone, 'UTC'))::date;
  exception when others then
    d := (p_now at time zone 'UTC')::date;
  end;
  return date_trunc('week', d)::date;
end $$;
revoke all on function private.partner_streak_this_week(uuid, timestamptz) from public, anon, authenticated;

-- May these two see their streak? Teen rules: following each other, or two
-- known adults. Never across a block, never a suspended account.
create or replace function private.partner_streak_visible(me uuid, other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select me is not null and other is not null and me <> other
     and not public.is_blocked_between(me, other)
     and not exists (select 1 from public.profiles p where p.id in (me, other) and p.suspended_at is not null)
     and (public.follow_each_other(me, other) or (public.known_adult(me) and public.known_adult(other)))
$$;
revoke all on function private.partner_streak_visible(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ 6. for the app
-- Your live streaks of 2+ weeks, longest first. this_week: already played
-- together this week (false: the week is still open). celebrate: a
-- milestone (4, 10 or 25) reached and not yet shown to you, else null.
create or replace function public.my_partner_streaks()
returns table (user_id uuid, weeks int, best int, last_week date, this_week boolean, celebrate int)
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  monday date;
begin
  if me is null then return; end if;
  monday := private.partner_streak_this_week(me, now());
  return query
    select x.other, x.weeks, x.best, x.last_week, x.last_week >= monday,
           (select max(m) from unnest(array[4, 10, 25]) m where m <= x.weeks and m > x.seen)::int
      from (
        select case when p.user_lo = me then p.user_hi else p.user_lo end as other,
               p.weeks, p.best, p.last_week,
               case when p.user_lo = me then p.seen_lo else p.seen_hi end as seen
          from public.partner_streaks p
         where (p.user_lo = me or p.user_hi = me)
      ) x
     where x.weeks >= 2
       and x.last_week >= monday - 7
       and private.partner_streak_visible(me, x.other)
     order by x.weeks desc, x.last_week desc, x.other
     limit 50;
end $$;
revoke all on function public.my_partner_streaks() from public, anon;
grant execute on function public.my_partner_streaks() to authenticated;

-- The app showed you a milestone's celebration: never again for that run.
create or replace function public.seen_partner_streak(other uuid, milestone int)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or other is null or me = other or milestone not in (4, 10, 25) then return; end if;
  update public.partner_streaks p
     set seen_lo = case when p.user_lo = me then greatest(p.seen_lo, least(milestone, p.weeks)) else p.seen_lo end,
         seen_hi = case when p.user_hi = me then greatest(p.seen_hi, least(milestone, p.weeks)) else p.seen_hi end
   where p.user_lo = least(me, other) and p.user_hi = greatest(me, other);
end $$;
revoke all on function public.seen_partner_streak(uuid, int) from public, anon;
grant execute on function public.seen_partner_streak(uuid, int) to authenticated;

-- ------------------------------------------------- 7. the weekend reminder
-- The hourly job: see the top of this file for the rules. p_now is for
-- testing. p_dry_run true sends nothing and writes nothing: it only lists
-- what would go out right now. One line per reminder sent (or that would be).
create or replace function public.send_partner_streak_nudges(p_now timestamptz default now(), p_dry_run boolean default false)
returns table (who uuid, nudge text, words text, link text)
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  w text;
  planned uuid[] := '{}';
  monday date;
begin
  for r in
    select x.me, x.other, x.weeks, x.last_week,
           split_part(coalesce(nullif(btrim(o.name), ''), o.handle, 'your partner'), ' ', 1) as first_name,
           coalesce(us.muted_ids, '{}') || coalesce(us.blocked_ids, '{}') as quiet,
           us.tz
      from (
        select p.user_lo as me, p.user_hi as other, p.weeks, p.last_week from public.partner_streaks p where p.weeks >= 2
        union all
        select p.user_hi, p.user_lo, p.weeks, p.last_week from public.partner_streaks p where p.weeks >= 2
      ) x
      join public.profiles o on o.id = x.other
      join public.user_state us on us.user_id = x.me
     where us.push_partner_streak is not false
       and us.tz is not null
       and x.last_week >= ((p_now at time zone 'UTC')::date - 15)
     order by x.me, x.weeks desc, x.last_week desc, x.other
  loop
    begin
      continue when r.me = any (planned);
      monday := private.partner_streak_this_week(r.me, p_now);
      -- Only Saturday and Sunday of their own week, while the week is still open.
      continue when ((p_now at time zone r.tz)::date - monday) < 5;
      continue when r.last_week <> monday - 7;
      continue when r.other::text = any (r.quiet);
      continue when not private.partner_streak_visible(r.me, r.other);
      -- One a week at most, whichever partner it named.
      continue when exists (select 1 from public.nudges n where n.user_id = r.me and n.kind = 'partner-streak' and n.ref = to_char(monday, 'YYYY-MM-DD'));
      continue when not private.nudge_ok(r.me, p_now);
      w := 'Your 🔥 ' || r.weeks || '-week streak with ' || r.first_name || ' ends Sunday. Get a hit in this weekend?';
      if p_dry_run then
        planned := planned || r.me;
      elsif not private.send_nudge(r.me, 'partner-streak', to_char(monday, 'YYYY-MM-DD'), w, '/user/' || r.other, p_now) then
        continue;
      else
        planned := planned || r.me;
      end if;
      who := r.me; nudge := 'partner-streak'; words := w; link := '/user/' || r.other;
      return next;
    exception when others then
      raise warning 'partner streak reminder for %: %', r.me, sqlerrm;
    end;
  end loop;
  return;
end $$;
revoke all on function public.send_partner_streak_nudges(timestamptz, boolean) from public, anon, authenticated;

-- ---------------------------------------------- 8. pairs that played already
-- Every pair already on an accepted tag, worked out once now.
do $$
declare
  t record;
begin
  for t in
    select distinct s.id as session_id, x.tagged_id, s.user_id
      from public.session_tags x join public.practice_sessions s on s.id = x.session_id
     where x.status = 'accepted' and not x.tagger_dropped
  loop
    perform private.partner_streak_pairs(t.session_id, t.tagged_id, t.user_id);
  end loop;
end $$;

-- ------------------------------------------------------------- 9. the scheduler
-- At 40 past every hour (after 170's and 171's, which are more urgent).
-- Scheduling the same job name again replaces it. Where pg_cron is not
-- turned on this says so and carries on (nothing sent).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('courtside-partner-streak-nudges', '40 * * * *', 'select count(*) from public.send_partner_streak_nudges()');
  else
    raise notice 'pg_cron not turned on: no partner streak reminders until it is (see OWNER STEPS)';
  end if;
exception when others then
  raise notice 'pg_cron not set up (%): no partner streak reminders until it is (see OWNER STEPS)', sqlerrm;
end $$;

-- ------------------------------------------------------------- 10. last check
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'push_partner_streak')
     or not (select relrowsecurity from pg_class where oid = 'public.partner_streaks'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'partner_streaks')
     or has_table_privilege('anon', 'public.partner_streaks', 'select') or has_table_privilege('authenticated', 'public.partner_streaks', 'select')
     or has_table_privilege('authenticated', 'public.partner_streaks', 'update')
     or has_function_privilege('anon', 'public.my_partner_streaks()', 'execute')
     or not has_function_privilege('authenticated', 'public.my_partner_streaks()', 'execute')
     or has_function_privilege('anon', 'public.seen_partner_streak(uuid, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.send_partner_streak_nudges(timestamp with time zone, boolean)', 'execute')
     or has_function_privilege('authenticated', 'private.partner_streak_recompute(uuid, uuid)', 'execute') then
    raise exception 'Migration 180 stopped: the result was not as planned; nothing was changed.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ------------------------------------------------------------- DRY RUN
-- Who would be reminded RIGHT NOW, in the exact words. Sends nothing:
-- select n.who, p.handle, n.words, n.link from public.send_partner_streak_nudges(now(), true) n join public.profiles p on p.id = n.who;

-- ------------------------------------------------- 11. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
-- (a) The hourly job (expect courtside-partner-streak-nudges, 40 * * * *; no
--     row means pg_cron is off, see OWNER STEPS):
-- select jobname, schedule from cron.job where jobname = 'courtside-partner-streak-nudges';
-- (b) ADMIN PREVIEW: the longest streaks going (handles only):
-- select a.handle, b.handle, s.weeks, s.best, s.last_week from public.partner_streaks s join public.profiles a on a.id = s.user_lo join public.profiles b on b.id = s.user_hi order by s.weeks desc limit 20;
-- (c) The last 50 reminders:
-- select n.sent_at, p.handle, n.words from public.nudges n join public.profiles p on p.id = n.user_id where n.kind = 'partner-streak' order by n.sent_at desc limit 50;
