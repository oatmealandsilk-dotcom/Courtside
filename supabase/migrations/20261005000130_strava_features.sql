-- CourtSide · migration 130: King of the Court, Flyby and the weekly recap
-- (the Strava-style features the owner picked on Oct 5: "King of the court.
-- Most wins at one court?", "Flyby is good, personal records is good, weekly
-- [recap] is good too"). Personal records need nothing here: the phone works
-- them out from your own log, which only you can read.
--
-- NOT APPLIED — needs the owner's OK, and a rolled-back test on the live
-- database first (described at the end). Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if a check below fails, it stops and
-- nothing at all changes. Safe to run more than once. It only adds things:
-- no table, column or function anyone uses today is changed or removed.
--
-- ORDER: either way round. Until this runs, the app shows no King card, no
-- Flyby, and the weekly recap only as the in-app "Your week" card (the phone
-- works it out itself); the court of a new session is kept on the phone only.
-- Once it runs, an older app keeps working exactly as before.
--
-- What it adds, in plain words:
--
-- 1. Where a session was played. practice_sessions.court_id: the map's id
--    for the court a session was logged at (picked in the post, "Played
--    at…", or the hit it was logged from). Private like the rest of your log:
--    only you can read it. The map's id only, never a position.
--
-- 2. King of the Court (court_kings). On a court's page, the player with the
--    most match wins posted at that court in the last 90 days, then numbers 2
--    and 3, and your own place. A win counts when a match from someone's own
--    log, marked won, is on a post tagged at that court (the log's word, not
--    the post's), the post is up (not archived, not taken down, not group
--    only), and the match was in the last 90 days. One win per match however
--    often it is posted, and at most 2 a day each. Ties go to the latest win.
--    Who can be on the board: public accounts that are not suspended and are
--    known adults; never a teen, never a private account, never someone you
--    are blocked with (either way). Whether someone is an adult is only ever
--    asked within the day's budget (age_rule_budget, migration 109), and the
--    app never says why someone is not ranked beyond "Only public accounts
--    are ranked". Nobody has won there yet: the "Regulars" there instead
--    (most days with a session posted there, last 90 days, the same rules).
--    Not at a court marked private (someone's home court). Signed in only.
--
-- 3. Flyby (flyby). Right after you log or post a session at a court: "3
--    others were at Alder Park today". Only when you were there that day
--    yourself (your post there, your session logged there, or your check-in
--    there), and only for today, yesterday or the day before. Who is listed:
--    people who posted there that day whom the court's page already shows
--    you (shows_at_court, inside the budget, as shown_at_court does); and,
--    for adults only, friends (you follow each other) who are adults and
--    checked in there that day, still share where they are (Location on,
--    not "Only me"). Never you, never the people tagged on your sessions that
--    day, never a suspended account or anyone you are blocked with. Never a
--    time: only morning, afternoon or evening, in your own time.
--
--    For this, check-ins are kept for 2 days (court_visits: who, which court,
--    when; one row per person and court). Nobody can read it but these
--    functions. Older rows are deleted every hour.
--
-- 4. The weekly recap. Mondays at 8am in your own time zone, an alert row in
--    Notifications and a phone alert: "Your week on court · 6h 15m, 4
--    sessions — up 2h. Best streak yet." Only for people who played in the
--    last 2 weeks; a rest week after a played one says "A quiet week. You
--    played 3h the week before — up for a hit?". The phone tells the server
--    its time zone (set_my_time_zone; a name like "America/Los_Angeles",
--    checked against Postgres's own list). The alert can be switched off
--    (user_state.push_recap; the row in Notifications stays). One recap per
--    week each, ever. Runs from Supabase's scheduler (pg_cron) at 5 past
--    every hour, so every time zone gets its 8am.
--
-- Nothing here is open to signed-out visitors. Relies on, and checks it is
-- exactly as live on Oct 5: shows_at_court, age_rule_budget, known_adult,
-- follow_each_other, is_blocked_between, is_suspended, send_push. Does not
-- touch anything migrations 124–129 change (125 removes court tags from
-- posts by anyone not known to be an adult: this file only reads them).

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  -- Relied on and never rewritten here: exactly as live on Oct 5.
  kept constant text[][] := array[
    ['public.shows_at_court',     'b325f768cd4001366038723b73c94fbd'],
    ['public.age_rule_budget',    '9f020e0237d8c5e61e913cbc6d5f6923'],
    ['public.known_adult',        'a79e745befd4374ea124ccf1692145a2'],
    ['public.follow_each_other',  '1bc1148421d20a5927824dc7ef3ad967'],
    ['public.is_blocked_between', 'f7246d0dbae4888d3a96a1d317c9de5f'],
    ['public.is_suspended',       '26f652f2bbe907f1e5ef2c709c310a6f'],
    ['public.send_push',          '1350721d1183cbbf2084a10017aa11ab']
  ];
  -- Made by this file: absent before, or exactly as this file leaves them.
  made constant text[][] := array[
    ['public.note_court_visit',      '4a1154e6df20b4cd4e074ce9e0bb1926'],
    ['public.court_kings',           'a6f90f3b907c8c3fd93be165a48ee3c6'],
    ['public.flyby',                 '138019b5698a61bd393504ee489c75a5'],
    ['public.set_my_time_zone',      '70e608d4676bbc1918fb9569a3609b7c'],
    ['private.recap_length',         '34b3cec9de311323c4144db619f1c154'],
    ['public.weekly_recap_numbers',  '946d40d553ad380880de48c6a2bde10c'],
    ['public.send_weekly_recaps',    '519a8a9e44334e9feb9c3e70bdca0690']
  ];
  i int;
  n int;
  now_is text;
  wrong text[] := '{}';
begin
  if to_regnamespace('private') is null
     or to_regclass('public.court_checkins') is null
     or to_regclass('public.age_rule_asks') is null
     or to_regclass('public.last_seen') is null
     or to_regclass('public.session_tags') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'practice_sessions' and column_name = 'sets')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'courts' and column_name = 'access')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'court_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'group_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'map_visibility')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'age_group') then
    raise exception 'Migration 130 stopped before changing anything: migrations 51, 54, 60, 62, 63, 64, 91 and 109 have to run first.';
  end if;
  for i in 1 .. array_length(kept, 1) loop
    select count(*), max(md5(p.prosrc)) into n, now_is from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = split_part(kept[i][1], '.', 1) and p.proname = split_part(kept[i][1], '.', 2);
    if n <> 1 or now_is <> kept[i][2] then
      wrong := wrong || kept[i][1];
    end if;
  end loop;
  for i in 1 .. array_length(made, 1) loop
    select count(*), max(md5(p.prosrc)) into n, now_is from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = split_part(made[i][1], '.', 1) and p.proname = split_part(made[i][1], '.', 2);
    if n > 1 or (n = 1 and now_is <> made[i][2]) then
      wrong := wrong || made[i][1];
    end if;
  end loop;
  -- The names this file takes must be free, or already this file's.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'practice_sessions' and column_name = 'court_id' and data_type <> 'text')
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'tz' and data_type <> 'text')
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'push_recap' and data_type <> 'boolean')
     or (to_regclass('public.court_visits') is not null and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'court_visits'
           and column_name in ('user_id', 'court_id', 'at')) <> 3)
     or exists (select 1 from pg_trigger where tgrelid = 'public.court_checkins'::regclass and not tgisinternal and tgname = 'note_court_visit'
                and tgfoid <> coalesce(to_regprocedure('public.note_court_visit()'), 0::oid)) then
    wrong := wrong || 'a column, table or trigger with one of this file''s names'::text;
  end if;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 130 stopped before changing anything: % changed since it was written (Oct 5). This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ===================================================== 1. where a session was played

alter table public.practice_sessions add column if not exists court_id text;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.practice_sessions'::regclass and conname = 'practice_sessions_court_id_check') then
    alter table public.practice_sessions add constraint practice_sessions_court_id_check
      check (court_id is null or court_id ~ '^(node|way|relation)[0-9]{1,15}$');
  end if;
end $$;
create index if not exists practice_sessions_court on public.practice_sessions (court_id, day) where court_id is not null;

-- Your time zone (for the recap at 8am your time) and the recap's alert switch.
alter table public.user_state add column if not exists tz text;
alter table public.user_state add column if not exists push_recap boolean not null default true;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.user_state'::regclass and conname = 'user_state_tz_check') then
    alter table public.user_state add constraint user_state_tz_check check (tz is null or char_length(tz) between 1 and 64);
  end if;
end $$;

-- The posts at one court, newest first (already there on the live database).
create index if not exists posts_court_idx on public.posts (court_id, created_at desc) where court_id is not null;

-- ===================================================== 2. check-ins kept for 2 days

create table if not exists public.court_visits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  court_id text not null,
  at timestamptz not null default now(),
  primary key (user_id, court_id)
);
create index if not exists court_visits_court on public.court_visits (court_id, at desc);
alter table public.court_visits enable row level security;
-- No rules: nobody reads or writes it but the functions below.
revoke all on table public.court_visits from public, anon, authenticated;

create or replace function public.note_court_visit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.court_visits as v (user_id, court_id, at) values (new.user_id, new.court_id, now())
    on conflict (user_id, court_id) do update set at = excluded.at;
  delete from public.court_visits where at < now() - interval '48 hours';
  return null;
end $$;
revoke all on function public.note_court_visit() from public, anon, authenticated;

drop trigger if exists note_court_visit on public.court_checkins;
create trigger note_court_visit after insert or update of court_id, created_at on public.court_checkins
  for each row execute function public.note_court_visit();

-- Check-ins already on when this runs count from when they started.
insert into public.court_visits (user_id, court_id, at)
  select k.user_id, k.court_id, k.created_at from public.court_checkins k
   where k.created_at > now() - interval '48 hours'
  on conflict (user_id, court_id) do nothing;

-- ===================================================== 3. King of the Court

-- {mode: 'wins' | 'regulars' | 'none', top: [{id, n, last}], me: {n, rank, ranked, days}}.
-- 'wins': n is wins, last the day of the latest. 'regulars': n is days, last the latest day.
-- me.n is always your own wins here (the same counting), me.rank your place when you are ranked.
create or replace function public.court_kings(p_court text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  since date := current_date - 90;
  tally jsonb;
  my_wins int := 0;
  my_days int := 0;
  me_ok boolean;
  cands uuid[];
  asked uuid[];
  board jsonb;
  my_rank int;
  out_mode text := 'none';
  nothing constant jsonb := jsonb_build_object('mode', 'none', 'top', '[]'::jsonb, 'me', jsonb_build_object('n', 0, 'rank', null, 'ranked', false, 'days', 0));
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_court is null or p_court !~ '^(node|way|relation)[0-9]{1,15}$' then return nothing; end if;
  -- Someone's home court has no board.
  if exists (select 1 from public.courts c where c.id = p_court and c.access = 'private') then return nothing; end if;
  -- You can be ranked: a public account, not suspended, a known adult (your own age, never anyone else's).
  select not p.is_private and p.suspended_at is null and public.known_adult(me) into me_ok from public.profiles p where p.id = me;
  me_ok := coalesce(me_ok, false);

  -- Every win at this court, per player: one per match however often it is
  -- posted, at most 2 a day each, from the poster's own log (kind and result).
  with w as (
    select p.author_id as uid, s.id as sid, s.day, max(p.created_at) as at
      from public.posts p
      join public.practice_sessions s
        on s.id = case when p.session->>'sessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (p.session->>'sessionId')::uuid end
       and s.user_id = p.author_id
     where p.court_id = p_court and not p.archived and p.removed_at is null and p.group_id is null
       and jsonb_typeof(p.session) = 'object' and p.session->>'kind' = 'match'
       and s.kind = 'match' and s.won is true and s.day >= since and s.day <= current_date + 1
     group by p.author_id, s.id, s.day
  ), capped as (
    select uid, day, at, row_number() over (partition by uid, day order by at, sid) as k from w
  )
  select coalesce(jsonb_agg(jsonb_build_object('uid', uid, 'n', n, 'd', d, 'at', at)), '[]'::jsonb) into tally
    from (select uid, count(*)::int as n, max(day) as d, max(at) as at from capped where k <= 2 group by uid) t;

  for pass in 1 .. 2 loop
    if pass = 2 then
      -- Nobody to crown: the regulars, by days with a session posted here.
      select coalesce(jsonb_agg(jsonb_build_object('uid', uid, 'n', n, 'd', d, 'at', at)), '[]'::jsonb) into tally from (
        select p.author_id as uid, count(distinct (p.created_at at time zone 'UTC')::date)::int as n,
               max((p.created_at at time zone 'UTC')::date) as d, max(p.created_at) as at
          from public.posts p
         where p.court_id = p_court and not p.archived and p.removed_at is null and p.group_id is null
           and jsonb_typeof(p.session) = 'object' and p.created_at >= since::timestamp at time zone 'UTC'
         group by p.author_id) t;
      my_days := coalesce((select w.n from jsonb_to_recordset(tally) as w(uid uuid, n int, d date, at timestamptz) where w.uid = me), 0);
    else
      my_wins := coalesce((select w.n from jsonb_to_recordset(tally) as w(uid uuid, n int, d date, at timestamptz) where w.uid = me), 0);
    end if;
    -- The others who could be on the board, best first: public, not suspended, not blocked either way.
    select coalesce(array_agg(x.uid order by x.n desc, x.d desc, x.at desc), '{}') into cands from (
      select w.uid, w.n, w.d, w.at from jsonb_to_recordset(tally) as w(uid uuid, n int, d date, at timestamptz)
        join public.profiles p on p.id = w.uid
       where w.uid <> me and not p.is_private and p.suspended_at is null and not public.is_blocked_between(me, w.uid)
       order by w.n desc, w.d desc, w.at desc limit 50) x;
    -- Who is an adult is only ever asked within the day's budget (109); the rest are left out.
    asked := case when cardinality(cands) > 0 then public.age_rule_budget(cands) else '{}'::uuid[] end;
    with ranked as (
      select w.uid, w.n, w.d, row_number() over (order by w.n desc, w.d desc, w.at desc) as r
        from jsonb_to_recordset(tally) as w(uid uuid, n int, d date, at timestamptz)
       where (w.uid = me and me_ok and w.n > 0)
          or (w.uid = any (cands) and w.uid = any (asked) and public.known_adult(w.uid))
    )
    select jsonb_agg(jsonb_build_object('id', uid, 'n', n, 'last', to_char(d, 'YYYY-MM-DD')) order by r) filter (where r <= 3),
           max(r) filter (where uid = me)
      into board, my_rank from ranked;
    if board is not null then
      out_mode := case when pass = 1 then 'wins' else 'regulars' end;
      exit;
    end if;
  end loop;

  return jsonb_build_object('mode', out_mode, 'top', coalesce(board, '[]'::jsonb),
    'me', jsonb_build_object('n', my_wins, 'rank', my_rank, 'ranked', my_rank is not null, 'days', my_days));
end $$;
revoke all on function public.court_kings(text) from public, anon, authenticated;
grant execute on function public.court_kings(text) to authenticated;

-- ===================================================== 4. Flyby

-- Who else was at a court on a day (p_day, in your own time: p_offset_min is
-- your clock's minutes ahead of UTC, -420 in Los Angeles in summer). Nothing
-- unless you were there that day yourself. At most 30, one row each, a post
-- before a check-in. part: 'morning' (before noon), 'afternoon' (before 5pm)
-- or 'evening', in your time. via: 'post' or 'checkin'.
create or replace function public.flyby(p_court text, p_day date, p_offset_min int default 0)
returns table (user_id uuid, part text, via text, post_id uuid)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  off int := greatest(-840, least(840, coalesce(p_offset_min, 0)));
  t0 timestamptz;
  t1 timestamptz;
  skip uuid[];
  cands uuid[];
  asked uuid[];
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_court is null or p_court !~ '^(node|way|relation)[0-9]{1,15}$' or p_day is null then return; end if;
  if p_day < current_date - 2 or p_day > current_date + 1 then return; end if;
  if public.is_suspended(me) then return; end if;
  t0 := (p_day::timestamp - make_interval(mins => off)) at time zone 'UTC';
  t1 := t0 + interval '1 day';

  -- You were there that day: your post there, your session logged there, or your check-in there.
  if not (
    exists (select 1 from public.posts p where p.author_id = me and p.court_id = p_court and p.removed_at is null
              and ((p.created_at >= t0 and p.created_at < t1) or (jsonb_typeof(p.session) = 'object' and p.session->>'day' = to_char(p_day, 'YYYY-MM-DD'))))
    or exists (select 1 from public.practice_sessions s where s.user_id = me and s.court_id = p_court and s.day = p_day)
    or exists (select 1 from public.court_visits v where v.user_id = me and v.court_id = p_court and v.at >= t0 and v.at < t1)
  ) then return; end if;

  -- The people on your sessions that day (you played them: no need to say they were there).
  select coalesce(array_agg(distinct x), '{}') into skip from (
    select t.tagged_id as x from public.session_tags t join public.practice_sessions s on s.id = t.session_id
     where t.tagger_id = me and s.user_id = me and s.day = p_day and t.status in ('pending', 'accepted')
    union
    select t.tagger_id from public.session_tags t join public.practice_sessions s on s.id = t.session_id
     where t.tagged_id = me and s.day = p_day and t.status in ('pending', 'accepted')
  ) y;

  -- Who posted there that day, as the court's page shows them to you (shown_at_court's rule).
  select coalesce(array_agg(a), '{}') into cands from (
    select p.author_id as a from public.posts p
     where p.court_id = p_court and p.created_at >= t0 and p.created_at < t1
       and not p.archived and p.removed_at is null and p.group_id is null
       and p.author_id <> me and not (p.author_id = any (skip))
     group by p.author_id order by min(p.created_at) limit 60) z;
  if cardinality(cands) > 0 then asked := public.age_rule_budget(cands); else asked := '{}'; end if;

  return query
  with posted as (
    select distinct on (p.author_id) p.author_id as uid, p.created_at as at, p.id as pid
      from public.posts p join public.profiles pr on pr.id = p.author_id
     where p.court_id = p_court and p.created_at >= t0 and p.created_at < t1
       and not p.archived and p.removed_at is null and p.group_id is null
       and p.author_id = any (cands) and p.author_id = any (asked)
       and pr.suspended_at is null
       and public.shows_at_court(me, p.author_id)
     order by p.author_id, p.created_at
  ), checked as (
    -- Friends only, adults only, and only while they still share where they are.
    select v.user_id as uid, v.at
      from public.court_visits v
      join public.profiles pr on pr.id = v.user_id
      left join public.user_state us on us.user_id = v.user_id
     where public.known_adult(me)
       and v.court_id = p_court and v.at >= t0 and v.at < t1
       and v.user_id <> me and not (v.user_id = any (skip))
       and not exists (select 1 from posted where posted.uid = v.user_id)
       and pr.suspended_at is null
       and public.known_adult(v.user_id)
       and public.follow_each_other(me, v.user_id)
       and not public.is_blocked_between(me, v.user_id)
       and coalesce(us.map_visibility, 'nearby') <> 'none'
       and exists (select 1 from public.last_seen ls where ls.user_id = v.user_id)
  ), everyone as (
    select uid, at, 'post'::text as how, pid from posted
    union all
    select uid, at, 'checkin'::text, null::uuid from checked
  )
  select e.uid,
         case when extract(hour from (e.at at time zone 'UTC') + make_interval(mins => off)) < 12 then 'morning'
              when extract(hour from (e.at at time zone 'UTC') + make_interval(mins => off)) < 17 then 'afternoon'
              else 'evening' end,
         e.how, e.pid
    from everyone e
   order by e.how desc, e.at
   limit 30;
end $$;
revoke all on function public.flyby(text, date, int) from public, anon, authenticated;
grant execute on function public.flyby(text, date, int) to authenticated;

-- ===================================================== 5. your time zone

-- The phone's own time zone name. True when it is one Postgres knows (kept), false when not.
create or replace function public.set_my_time_zone(p_tz text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_tz is null or char_length(p_tz) not between 1 and 64 or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_tz) then
    return false;
  end if;
  update public.user_state set tz = p_tz where user_id = me and tz is distinct from p_tz;
  return true;
end $$;
revoke all on function public.set_my_time_zone(text) from public, anon, authenticated;
grant execute on function public.set_my_time_zone(text) to authenticated;

-- ===================================================== 6. the weekly recap

-- "6h 15m", "2h", "45 min": a length as the app writes it (lib/format duration).
create or replace function private.recap_length(m int)
returns text language sql immutable set search_path = public as $$
  select case when m < 60 then m || ' min'
              when m % 60 = 0 then (m / 60) || 'h'
              else (m / 60) || 'h ' || (m % 60) || 'm' end
$$;
revoke all on function private.recap_length(int) from public, anon, authenticated;

-- One player's week (Monday week_start to Sunday) next to the week before,
-- by the same rules the app uses (features/recap/recap.ts): tennis only
-- (practice, matches, drills), a streak counts any day with a session, a
-- post or an Instant, in the player's time zone. body is the alert's words,
-- or null when there is nothing to say (no tennis in either week).
create or replace function public.weekly_recap_numbers(u uuid, week_start date, p_tz text default 'UTC')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  zone text := coalesce(p_tz, 'UTC');
  wk_end date := week_start + 6;
  mins int; n int; wins int; losses int;
  prev_mins int; prev_n int;
  best_before int;
  run_now int; run_before int;
  best_week boolean; best_streak boolean;
  body text;
  tail text;
begin
  select coalesce(sum(s.minutes), 0)::int, count(*)::int,
         (count(*) filter (where s.kind = 'match' and s.won is true))::int,
         (count(*) filter (where s.kind = 'match' and s.won is false))::int
    into mins, n, wins, losses
    from public.practice_sessions s where s.user_id = u and s.kind <> 'fitness' and s.day between week_start and wk_end;
  select coalesce(sum(s.minutes), 0)::int, count(*)::int into prev_mins, prev_n
    from public.practice_sessions s where s.user_id = u and s.kind <> 'fitness' and s.day between week_start - 7 and week_start - 1;
  -- The most time on court in any earlier week (the last 400 days, as the app holds).
  select coalesce(max(t), 0)::int into best_before from (
    select sum(s.minutes) as t from public.practice_sessions s
     where s.user_id = u and s.kind <> 'fitness' and s.day >= week_start - 400 and s.day < week_start
     group by date_trunc('week', s.day::timestamp)) x;
  -- Streaks: the longest run of days that reaches into this week, and the longest that ended before it.
  with d as (
    select distinct day from (
      select s.day from public.practice_sessions s where s.user_id = u and s.day between week_start - 400 and wk_end
      union all
      select (p.created_at at time zone zone)::date from public.posts p where p.author_id = u and p.removed_at is null
         and p.created_at >= (week_start - 401)::timestamp at time zone zone and p.created_at < (wk_end + 2)::timestamp at time zone zone
      union all
      select (st.created_at at time zone zone)::date from public.stories st where st.author_id = u and st.removed_at is null
         and st.created_at >= (week_start - 401)::timestamp at time zone zone and st.created_at < (wk_end + 2)::timestamp at time zone zone
    ) a where day between week_start - 400 and wk_end
  ), runs as (
    select min(day) as a, max(day) as b, count(*)::int as len
      from (select day, day - (row_number() over (order by day))::int as grp from d) g group by grp
  )
  select coalesce(max(len) filter (where b >= week_start), 0), coalesce(max(len) filter (where b < week_start), 0)
    into run_now, run_before from runs;

  best_week := n > 0 and best_before >= 60 and mins > best_before;
  best_streak := run_before >= 3 and run_now > run_before;
  if n = 0 then
    if prev_n > 0 then
      body := 'A quiet week. You played ' || private.recap_length(prev_mins) || ' the week before — up for a hit?';
    end if;
  else
    body := private.recap_length(mins) || ', ' || n || case when n = 1 then ' session' else ' sessions' end
      || case when prev_n > 0 and mins > prev_mins then ' — up ' || private.recap_length(mins - prev_mins) else '' end || '.';
    tail := case when best_week then 'Your biggest week yet.'
                 when best_streak then 'Best streak yet.'
                 when wins > 0 then wins || case when wins = 1 then ' match won.' else ' matches won.' end end;
    if tail is not null then body := body || ' ' || tail; end if;
  end if;
  return jsonb_build_object('week', to_char(week_start, 'YYYY-MM-DD'), 'minutes', mins, 'sessions', n, 'won', wins, 'lost', losses,
    'prevMinutes', prev_mins, 'prevSessions', prev_n, 'bestWeek', best_week, 'bestStreak', best_streak, 'streak', run_now, 'body', body);
end $$;
revoke all on function public.weekly_recap_numbers(uuid, date, text) from public, anon, authenticated;

-- One recap per player per week, ever.
create unique index if not exists notifications_weekly_recap_once on public.notifications (user_id, target_id) where kind = 'weekly-recap';

-- The hourly job: everyone for whom it is now Monday, 8 o'clock, who played
-- in the last two weeks, gets last week's recap (a row in Notifications from
-- themselves, so push_for_notification leaves it alone, then the alert here
-- unless they switched it off). p_now is for testing. Each player on their
-- own, so one failure never stops the rest. Also clears check-ins older
-- than 2 days. Returns how many recaps were filed.
create or replace function public.send_weekly_recaps(p_now timestamptz default now())
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  nums jsonb;
  wk date;
  filed uuid;
  sent int := 0;
begin
  delete from public.court_visits where at < p_now - interval '48 hours';
  for r in
    -- Only time zones Postgres knows (the list is read first, so a bad name can never stop the job).
    with zones as materialized (select z.name from pg_catalog.pg_timezone_names z),
    people as materialized (
      select us.user_id, us.tz, us.push_recap from public.user_state us
        join public.profiles pr on pr.id = us.user_id and pr.suspended_at is null
       where us.tz is not null and us.tz in (select name from zones)
    )
    select pe.user_id, pe.tz, pe.push_recap, (p_now at time zone pe.tz)::date as today
      from people pe
     where extract(isodow from (p_now at time zone pe.tz)) = 1
       and extract(hour from (p_now at time zone pe.tz)) = 8
       and exists (select 1 from public.practice_sessions s where s.user_id = pe.user_id and s.kind <> 'fitness'
                     and s.day >= (p_now at time zone pe.tz)::date - 14 and s.day < (p_now at time zone pe.tz)::date)
     order by pe.user_id
     limit 2000
  loop
    begin
      wk := r.today - 7;
      if exists (select 1 from public.notifications n where n.user_id = r.user_id and n.kind = 'weekly-recap' and n.target_id = to_char(wk, 'YYYY-MM-DD')) then
        continue;
      end if;
      nums := public.weekly_recap_numbers(r.user_id, wk, r.tz);
      if nums->>'body' is null then continue; end if;
      filed := null;
      insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
        values (r.user_id, r.user_id, 'weekly-recap', to_char(wk, 'YYYY-MM-DD'), 'recap', nums->>'body')
        on conflict (user_id, target_id) where kind = 'weekly-recap' do nothing
        returning id into filed;
      if filed is null then continue; end if;
      sent := sent + 1;
      if r.push_recap is not false then
        perform public.send_push(r.user_id, 'Your week on court', nums->>'body', '/weekly-recap?week=' || to_char(wk, 'YYYY-MM-DD'));
      end if;
    exception when others then
      raise warning 'weekly recap for %: %', r.user_id, sqlerrm;
    end;
  end loop;
  return sent;
end $$;
revoke all on function public.send_weekly_recaps(timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------- 7. the scheduler
-- At 5 past every hour (so every time zone gets its 8am, half-hour ones
-- included). Scheduling the same job name again replaces it. Where pg_cron
-- is not set up this says so and carries on: the app still shows the recap
-- card on Mondays by itself.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('courtside-weekly-recap', '5 * * * *', 'select public.send_weekly_recaps()');
  else
    raise notice 'pg_cron not set up: no weekly recap alerts (the app still shows the card)';
  end if;
exception when others then
  raise notice 'pg_cron not set up (%): no weekly recap alerts (the app still shows the card)', sqlerrm;
end $$;

-- ------------------------------------------------------------- 8. last check
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'practice_sessions' and column_name = 'court_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'tz')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'push_recap')
     or not (select relrowsecurity from pg_class where oid = 'public.court_visits'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'court_visits')
     or has_table_privilege('anon', 'public.court_visits', 'select') or has_table_privilege('authenticated', 'public.court_visits', 'select')
     or has_table_privilege('authenticated', 'public.court_visits', 'insert')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.court_checkins'::regclass and tgname = 'note_court_visit' and not tgisinternal)
     or has_function_privilege('anon', 'public.court_kings(text)', 'execute')
     or has_function_privilege('anon', 'public.flyby(text, date, integer)', 'execute')
     or has_function_privilege('anon', 'public.set_my_time_zone(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.court_kings(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.flyby(text, date, integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_my_time_zone(text)', 'execute')
     or has_function_privilege('authenticated', 'public.send_weekly_recaps(timestamp with time zone)', 'execute')
     or has_function_privilege('authenticated', 'public.weekly_recap_numbers(uuid, date, text)', 'execute')
     or has_function_privilege('anon', 'public.send_weekly_recaps(timestamp with time zone)', 'execute')
     or has_function_privilege('authenticated', 'public.note_court_visit()', 'execute')
     or not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'notifications' and indexname = 'notifications_weekly_recap_once') then
    raise exception 'Migration 130 stopped: the result was not as planned; nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------- 9. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
-- (a) The hourly job (expect courtside-weekly-recap, 5 * * * *):
-- select jobname, schedule, command from cron.job where jobname = 'courtside-weekly-recap';
-- (b) Who has told the server their time zone so far (grows as phones open the new app):
-- select count(*) filter (where tz is not null) as with_zone, count(*) as everyone from user_state;
-- (c) The recaps filed (after the first Monday 8am):
-- select date_trunc('day', created_at) as day, count(*) from notifications where kind = 'weekly-recap' group by 1 order by 1 desc;
--
-- The rolled-back test that goes with this file (run before applying it):
-- scratchpad strava-build/t130_rollback.sql — the whole file twice, then each
-- rule tried as the people involved, inside one transaction that is undone.
