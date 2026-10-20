-- CourtSide · migration 20261021000169: one "your turn" reminder for a hit
-- invite left unanswered (sweep item R10, Oct 20).
--
-- NOT APPLIED. Needs the owner's OK first.
--
-- Why: when Sam invites a friend to hit, the friend gets one alert. If it
-- arrives at a bad moment it is forgotten, Sam hears nothing back, and the
-- hit quietly does not happen.
--
-- What it does, in plain words:
--   * About 20 hours after an invite, if the invited player has not said
--     "I'm in" and has not written to the person who invited them since,
--     and the hit is still on, still in the future (at least 90 minutes
--     away) and still has a spot, they get ONE reminder:
--       "Sam invited you to a doubles game tomorrow at 6:00 PM. There's
--        still a spot for you. In?"
--     Tapping it opens the hit. Never a second one for the same invite.
--   * Never names a place (only the day and time). Never from someone
--     blocked either way, muted, or suspended, nor to a suspended account.
--   * Teen rules: a teen (or someone whose age we do not know) is reminded
--     only about an invite from a friend they follow each other with, the
--     same rule as the invite itself.
--   * At most one of the new come-back alerts (this, 167's and 168's) a day
--     per person, only between 9am and 9pm in their own time zone (someone
--     whose phone has not told us its time zone gets none). This one runs
--     first each hour, as it is the most time-sensitive.
--   * Its own switch: Settings → Notifications → "Hit invite reminders",
--     on to start with.
--
-- How it runs: like the Monday weekly recap (migration 130). Supabase's
-- scheduler (pg_cron) runs it at 10 past every hour; it sends through
-- send_push like every other CourtSide alert. If the scheduler is not turned
-- on, this file says so and nothing is sent (see OWNER STEPS).
--
-- Touches no existing function, rule or trigger. Adds: the nudges table
-- (shared with 167 and 168), user_state.push_hit_nudges, and the functions
-- private.nudge_ok, private.send_nudge, public.send_hit_invite_nudges. Needs
-- (all live): user_state.tz (130), push_tokens and send_push (14, 106),
-- known_adult (109), is_blocked_between (21), follow_each_other (60),
-- hit_invites (76), hit_when (53), hit_requests.joined_count (95), messages
-- and conversation_members (6, 54). Stops before changing anything if any is
-- missing. Safe to run more than once.
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
     or to_regclass('public.push_tokens') is null or to_regclass('public.hit_requests') is null
     or to_regclass('public.hit_joins') is null or to_regclass('public.hit_invites') is null
     or to_regclass('public.messages') is null or to_regclass('public.conversation_members') is null
     or to_regprocedure('public.send_push(uuid, text, text, text)') is null
     or to_regprocedure('public.known_adult(uuid)') is null
     or to_regprocedure('public.is_blocked_between(uuid, uuid)') is null
     or to_regprocedure('public.follow_each_other(uuid, uuid)') is null
     or to_regprocedure('public.hit_when(timestamp with time zone, jsonb)') is null then
    raise exception 'Migration 169 stopped before changing anything: a table or function it needs is missing (see "Needs" at the top).';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'tz')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hit_requests' and column_name = 'joined_count') then
    raise exception 'Migration 169 stopped before changing anything: a column it needs is missing (user_state.tz or hit_requests.joined_count).';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'push_hit_nudges' and data_type <> 'boolean') then
    raise exception 'Migration 169 stopped before changing anything: user_state already has a push_hit_nudges column that is not a yes/no.';
  end if;
  if to_regclass('public.nudges') is not null and not exists (
       select 1 from information_schema.columns where table_schema = 'public' and table_name = 'nudges' and column_name = 'ref') then
    raise exception 'Migration 169 stopped before changing anything: a nudges table is already there and is not this file''s.';
  end if;
end $$;

-- ------------------------------------------- 1. the come-back alerts' notebook
-- (Word for word the same in migrations 167, 168 and 169, so any one of them
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
-- ------------------------------------------------- 2. the switch in Settings
-- Settings → Notifications → "Hit invite reminders". On to start with; off,
-- no reminder is sent (the invite's own alert is not affected).
alter table public.user_state add column if not exists push_hit_nudges boolean not null default true;

-- To find invites of the right age quickly.
create index if not exists hit_invites_created_idx on public.hit_invites (created_at);

-- ------------------------------------------------ 3. invites left unanswered
-- The hourly job: see the top of this file for the rules. Soonest hit first.
-- p_now is for testing. p_dry_run true sends nothing and writes nothing: it
-- only lists what would go out right now (see DRY RUN at the bottom).
-- Returns one line per reminder sent (or that would be sent).
create or replace function public.send_hit_invite_nudges(p_now timestamptz default now(), p_dry_run boolean default false)
returns table (who uuid, nudge text, words text, link text)
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  w text;
  planned uuid[] := '{}';
begin
  for r in
    select i.user_id, i.created_at as invited_at, h.id as hit_id, h.author_id, h.format, h.starts_at, h.place,
           split_part(coalesce(nullif(btrim(a.name), ''), a.handle, 'Someone'), ' ', 1) as first_name,
           coalesce(us.muted_ids, '{}') || coalesce(us.blocked_ids, '{}') as quiet
      from public.hit_invites i
      join public.hit_requests h on h.id = i.hit_id
      join public.profiles a on a.id = h.author_id
      join public.profiles p on p.id = i.user_id
      join public.user_state us on us.user_id = i.user_id
     where i.created_at between p_now - interval '7 days' and p_now - interval '20 hours'
       and not h.cancelled
       and h.starts_at > p_now + interval '90 minutes'
       and h.joined_count < h.spots
       and i.user_id <> h.author_id
       and a.suspended_at is null
       and p.suspended_at is null
       and us.push_hit_nudges is not false
       and not exists (select 1 from public.hit_joins j where j.hit_id = h.id and j.user_id = i.user_id)
       and not exists (select 1 from public.nudges n where n.user_id = i.user_id and n.kind = 'hit-invite' and n.ref = h.id::text)
     order by h.starts_at
     limit 1000
  loop
    begin
      continue when r.user_id = any (planned);
      continue when r.author_id::text = any (r.quiet);
      continue when public.is_blocked_between(r.user_id, r.author_id);
      -- Teen rules: a teen, or someone whose age we do not know, only about a friend's invite.
      continue when not public.known_adult(r.user_id) and not public.follow_each_other(r.user_id, r.author_id);
      -- Answered in a chat with the person who invited them since the invite: not "unanswered".
      continue when exists (
        select 1 from public.messages m
          join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = r.author_id
         where m.sender_id = r.user_id and m.created_at > r.invited_at);
      continue when not private.nudge_ok(r.user_id, p_now);
      w := r.first_name || ' invited you to '
        || case r.format when 'singles' then 'a singles game' when 'doubles' then 'a doubles game' else 'a hit' end
        || ' ' || public.hit_when(r.starts_at, r.place) || '. There''s still a spot for you. In?';
      if p_dry_run then
        planned := planned || r.user_id;
      elsif not private.send_nudge(r.user_id, 'hit-invite', r.hit_id::text, w, '/hit-request/' || r.hit_id, p_now) then
        continue;
      end if;
      who := r.user_id; nudge := 'hit-invite'; words := w; link := '/hit-request/' || r.hit_id;
      return next;
    exception when others then
      raise warning 'hit invite reminder for %: %', r.user_id, sqlerrm;
    end;
  end loop;
  return;
end $$;
revoke all on function public.send_hit_invite_nudges(timestamptz, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------- 4. the scheduler
-- At 10 past every hour (before 168's and 167's, so this time-sensitive one
-- goes first). Scheduling the same job name again replaces it. Where pg_cron
-- is not turned on this says so and carries on (nothing sent).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('courtside-hit-invite-nudges', '10 * * * *', 'select count(*) from public.send_hit_invite_nudges()');
  else
    raise notice 'pg_cron not turned on: no hit invite reminders until it is (see OWNER STEPS)';
  end if;
exception when others then
  raise notice 'pg_cron not set up (%): no hit invite reminders until it is (see OWNER STEPS)', sqlerrm;
end $$;

-- ------------------------------------------------------------- 5. last check
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'push_hit_nudges')
     or not (select relrowsecurity from pg_class where oid = 'public.nudges'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nudges')
     or has_table_privilege('anon', 'public.nudges', 'select') or has_table_privilege('authenticated', 'public.nudges', 'select')
     or has_table_privilege('authenticated', 'public.nudges', 'insert')
     or has_function_privilege('anon', 'public.send_hit_invite_nudges(timestamp with time zone, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.send_hit_invite_nudges(timestamp with time zone, boolean)', 'execute')
     or has_function_privilege('authenticated', 'private.nudge_ok(uuid, timestamp with time zone)', 'execute')
     or has_function_privilege('authenticated', 'private.send_nudge(uuid, text, text, text, text, timestamp with time zone)', 'execute') then
    raise exception 'Migration 169 stopped: the result was not as planned; nothing was changed.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ------------------------------------------------------------- DRY RUN
-- Who would be reminded RIGHT NOW, about which hit, in the exact words.
-- Sends nothing, writes nothing (safe to run any time after this file):
-- select n.who, p.handle, n.words, n.link from public.send_hit_invite_nudges(now(), true) n join public.profiles p on p.id = n.who;
-- Invites still unanswered after 20 hours (whether or not a reminder can go now):
-- select i.created_at, h.starts_at, h.format from public.hit_invites i join public.hit_requests h on h.id = i.hit_id where i.created_at < now() - interval '20 hours' and h.starts_at > now() and not h.cancelled and not exists (select 1 from public.hit_joins j where j.hit_id = i.hit_id and j.user_id = i.user_id) order by 2;

-- ------------------------------------------------- 6. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
-- (a) The hourly job (expect courtside-hit-invite-nudges, 10 * * * *; no row
--     means pg_cron is off, see OWNER STEPS):
-- select jobname, schedule from cron.job where jobname = 'courtside-hit-invite-nudges';
-- (b) ADMIN PREVIEW: the last 50 reminders, and whether that player said "I'm in" afterwards:
-- select n.sent_at, p.handle, n.words, exists (select 1 from public.hit_joins j where j.hit_id::text = n.ref and j.user_id = n.user_id) as joined_after from public.nudges n join public.profiles p on p.id = n.user_id where n.kind = 'hit-invite' order by n.sent_at desc limit 50;
-- (c) How many have switched it off:
-- select count(*) filter (where push_hit_nudges is false) as off, count(*) as everyone from public.user_state;
