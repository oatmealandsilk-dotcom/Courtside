-- CourtSide · migration 20261103000211: the city board, all time ("for now").
--
-- Owner, Nov 3, on an empty board on the 3rd: "Why is the leaderboard empty rn,
-- maybe we should just make it all time for now. At least the city one".
-- It was empty because the board is monthly (it starts again on the 1st) and a
-- city needs 5 players with a counted session that month to be ranked: on
-- Nov 3, November had 4 players in all, so every city showed 0.
--
-- NOT APPLIED. Run it in the Supabase SQL editor as one piece. Ship order: this
-- first (the app keeps asking for months until its update is out, and months
-- come out exactly as before), then the app update (CITY_BOARD_ALL_TIME, an
-- over-the-air update on "production", never "store"). All-or-nothing: if a
-- check fails, it stops and nothing at all changes. Safe to run more than once.
-- Undo: supabase/rollback/211_undo.sql.
--
-- What changes:
--   * refresh_city_board() (pg_cron, :03/:18/:33/:48) works out one more board
--     each run, kept under the month '2000-01-01' (the all-time key), after the
--     months, which it still works out exactly as before (older app versions
--     keep asking for months).
--   * The all-time board is the months added up, each session counted for the
--     city its month counted it for (a month keeps a player's city of its
--     first counted session), plus one block for the sessions from before the
--     first month board (before October 2026), by each player's town when this
--     runs. The same counting rules as the months (tennis kinds only, logged
--     within 7 days of the day played and not for a later day, at most 2 a
--     day, not suspended, everyone else's numbers as of yesterday in Hawaii).
--     So a count once counted for a city stays with that city for ever: a
--     town change never moves anyone's sessions from one city to another (a
--     mover's new sessions count for the new town from their first one in a
--     new month, as on the months), and a city's all-time total only ever
--     moves by exactly what that day's month boards move by. Its change minus
--     the month's change is always 0: it gives away nothing the month boards
--     do not (review of 211: city_now all time let the all-time board minus
--     the month board give a mover's hidden count exactly).
--     A player's row on it (Top players, "you") is their latest month's city,
--     with what they counted there; named / friends_only by the same rules as
--     a month (that city must be the town on their profile now).
--     The block from before October is kept in private.city_board_all_time_base
--     (new; player, city, sessions; no one but the database can read it), and
--     the 13-month clean-up first adds a month that is about to go into it,
--     so the all-time board never drops when old months are cleared.
--   * Movement ("this week"), "climbing N weeks", news and the daily snapshot
--     work for it as for a month (its end is a far-off day, so the snapshot is
--     taken every day); the first week shows no movement (no snapshot a week
--     back yet). The 13-month clean-up never deletes it.
--   * city_board(p_month) and city_page(p_city, p_month) take '2000-01-01' as
--     well as the months around today. city_board() sends no open_until for it
--     (the app reads a missing one as ''). city_page()'s Most active courts,
--     all time: each court's months added up (city_board_active_courts as
--     refresh_active_courts() keeps them, each month's number as it was shown,
--     so the sum only moves when a month's number does), shown as that court's
--     busiest month's entry. Top players, the fill and the clip read the
--     all-time rows refresh_city_board() keeps. On a city where you counted
--     before a move, its Top players hold back one more row, as for any player
--     of that city (your count there is in its total).
--   * send_catch_up_alerts() step d ("<city> moved up to #N on the city
--     board") reads the all-time board, the one its link now opens.
--   * Every privacy rule of 196/197/198/193 is as it was: teens never named
--     to anyone but friends who follow each other (197), unranked cities never
--     named, Top players capped so no one's number can be worked out (the same
--     code, on the all-time rows), the auto-logged audience rule (193).
--
-- Not touched: refresh_active_courts() and its job, every grant (checked),
-- every existing table's shape.

begin;
set local lock_timeout = '5s';

-- ------------------------------------------------------------------ 0. check
-- The three functions this file replaces, as read from the live database on
-- Nov 3 (refresh_city_board as 193 left it, city_board as 196, city_page as
-- 198), or as this file leaves them, so a second run passes.
do $$
declare
  bad text;
begin
  if to_regclass('public.city_board_members') is null or to_regclass('public.city_board_cities') is null
     or to_regclass('public.city_board_active_courts') is null or to_regclass('public.city_board_daily') is null
     or to_regprocedure('private.city_board_friends_only(uuid)') is null or to_regprocedure('private.city_board_court_place(public.courts)') is null then
    raise exception 'Migration 211 stopped before changing anything: migrations 196, 197 and 198 (city boards) have to run first.';
  end if;
  select string_agg(w.sig, ', ') into bad
    from (values
      ('public.refresh_city_board()', array['653b4f13594b34cff16425c59b3edc63', '2a47b8ab7e8df21ecfaa2c0167b7d13e']),
      ('public.city_board(date)', array['0a3e2f3846eb9f612adaf4a6ec59515d', 'a38cb62648a6faffeef863c526e80959']),
      ('public.city_page(text, date)', array['e6c05cc304a90e64a76e2c5d1e65e0c7', '4c5148cd8bb584e4b36e25a63da00c86']),
      ('public.send_catch_up_alerts(timestamptz, boolean)', array['12f4da3f721e8aad97fd1b3a39c3a9d5', '2dcb9690a1fcd124be4bb28c7d215e30'])
    ) as w(sig, md5s)
   where not exists (select 1 from pg_proc p where p.oid = to_regprocedure(w.sig) and md5(p.prosrc) = any (w.md5s));
  if bad is not null then
    raise exception 'Migration 211 stopped before changing anything: % changed since Nov 3. Ask Claude to look.', bad;
  end if;
  if to_regclass('private.city_board_all_time_base') is not null and not exists (
       select 1 from pg_proc p where p.oid = 'public.refresh_city_board()'::regprocedure and md5(p.prosrc) = '2a47b8ab7e8df21ecfaa2c0167b7d13e') then
    raise exception 'Migration 211 stopped before changing anything: private.city_board_all_time_base is there, but not 211''s refresh. Ask Claude to look.';
  end if;
  perform set_config('courtside.m211_grants', (
    select string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, '-') || '/' || p.prosecdef::text || '/' || coalesce(p.proconfig::text, '-'), '; ' order by p.oid::regprocedure::text)
      from pg_proc p
     where p.oid in ('public.refresh_city_board()'::regprocedure, 'public.city_board(date)'::regprocedure, 'public.city_page(text, date)'::regprocedure,
                     'public.send_catch_up_alerts(timestamptz, boolean)'::regprocedure)), true);
end $$;

-- -------------------------------------------- 0b. the all-time board's parts
-- What each player counted for each city, all time: the sessions from before
-- the first month board (taken once, here, by the town on each profile now;
-- the all-time board does not exist before this, so there is no "before" to
-- compare it with), and later every month 13-month clean-up clears (added in
-- by refresh_city_board() before it clears them). Numbers and ids only; no
-- one but the database (refresh_city_board, city_page) reads it.
do $$
declare
  v_first date;
  v_cutoff date := (now() at time zone 'Pacific/Honolulu')::date - 1;
  v_day_cut timestamptz := ((now() at time zone 'Pacific/Honolulu')::date)::timestamp at time zone 'Pacific/Honolulu';
begin
  if to_regclass('private.city_board_all_time_base') is not null then
    return;   -- a second run: taken once, never again
  end if;
  create table private.city_board_all_time_base (
    user_id uuid not null references public.profiles(id) on delete cascade,
    city_id text not null references public.board_cities(id) on delete cascade,
    sessions int not null check (sessions > 0),
    last_month date not null,   -- the latest month it holds (the block from before the boards: the month before the first)
    primary key (user_id, city_id));
  alter table private.city_board_all_time_base enable row level security;
  revoke all on table private.city_board_all_time_base from public, anon, authenticated;
  -- The first month with a board (October 2026); with none yet, the first the refresh will work out.
  v_first := coalesce(least((select min(mo.month) from public.city_board_months mo where mo.month <> date '2000-01-01'),
                            (select min(mb.month) from public.city_board_members mb where mb.month <> date '2000-01-01')),
                      date_trunc('month', current_date - 3)::date);
  -- Sessions before it, by the month boards' rules (refresh_city_board, step 1), as of yesterday in Hawaii.
  insert into private.city_board_all_time_base (user_id, city_id, sessions, last_month)
  select x.user_id, x.city_id, x.sessions, (v_first - interval '1 month')::date
    from (
      select k.user_id, private.city_board_city(p.city_lat, p.city_lng, p.location) as city_id,
             count(*) filter (where k.day <= v_cutoff and k.created_at < v_day_cut)::int as sessions
        from (
          select s.user_id, s.day, s.created_at, row_number() over (partition by s.user_id, s.day order by s.created_at, s.id) as n
            from public.practice_sessions s
           where s.day < v_first
             and s.kind in ('practice', 'match', 'drills')
             and s.created_at < (s.day + 8)::timestamp at time zone 'UTC'
             and s.day <= (s.created_at at time zone 'UTC')::date + 1
        ) k
        join public.profiles p on p.id = k.user_id and p.suspended_at is null
       where k.n <= 2
       group by k.user_id, p.city_lat, p.city_lng, p.location
    ) x
   where x.city_id is not null and x.sessions > 0;
end $$;

-- Each player's count per city (null: counted with no town), all time: the
-- block above plus every month board kept. `last_month`: the latest month in it.
-- A month refresh_city_board() no longer works out (before the month of 3 days
-- ago) adds its `sessions` as `sessions_now` too: a session for its last days
-- logged after that day's cut in Hawaii is in its frozen sessions_now but never
-- reaches its sessions, so "you" would stay 1 above "in total" for ever (review
-- of 211, round 3). Parts that add up to nothing are left out (a board row
-- needs sessions_now > 0).
CREATE OR REPLACE FUNCTION private.city_board_all_time_parts(p_user uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, city_id text, sessions integer, sessions_now integer, last_month date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select z.user_id, z.city_id, sum(z.sessions)::int, sum(z.sessions_now)::int, max(z.month)
    from (select b.user_id, b.city_id, b.sessions, b.sessions as sessions_now, b.last_month as month
            from private.city_board_all_time_base b
           where p_user is null or b.user_id = p_user
          union all
          select mb.user_id, mb.city_id, mb.sessions,
                 case when mb.month < date_trunc('month', current_date - 3)::date then mb.sessions else mb.sessions_now end,
                 mb.month
            from public.city_board_members mb
           where mb.month <> date '2000-01-01'
             and (p_user is null or mb.user_id = p_user)) z
   group by z.user_id, z.city_id
  having sum(z.sessions_now) > 0
$function$;
revoke all on function private.city_board_all_time_parts(uuid) from public, anon, authenticated;

-- ------------------------------------------------- 1. the refresh (pg_cron)
-- As 193 left it, plus the all-time board ('2000-01-01'), marked "211".
CREATE OR REPLACE FUNCTION public.refresh_city_board()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t0 timestamptz := clock_timestamp();
  v_at timestamptz := clock_timestamp();
  v_rules record;
  v_months date[];
  v_m date;
  v_end date;
  v_old jsonb;
  v_was jsonb;
  -- "Played ..." is never today anywhere in the US: the last day before Honolulu's today.
  v_cutoff date := (now() at time zone 'Pacific/Honolulu')::date - 1;
  -- ...and only what was logged before Honolulu's today began: what others
  -- see changes once a day (10:00 UTC), never 15 minutes after someone logs,
  -- even a session logged today for an earlier day.
  v_day_cut timestamptz := ((now() at time zone 'Pacific/Honolulu')::date)::timestamp at time zone 'Pacific/Honolulu';
  -- Busiest courts are worked out once a week, from what was logged before this
  -- week began (Monday 00:00 UTC): a court's number never moves with a day, a
  -- session or one player switching off, only with a whole week.
  v_court_cut timestamptz := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
  -- A court named for where people live (most courts' access is 'unknown').
  v_home_words text := '(apartment|\mapts?\M|condo|townho|residen|estates|villas|\mhoa\M|homeowner|subdivision|backyard|back yard|\mhome\M|\mhouse\M|private|driveway|family|neighbou?rhood|club ?house|swim ?(and|&|n) ?(racquet|tennis)|\mpool\M)';
  c record;
  v_prev int;
  v_now int;
  v_day date;
  v_run int;
  v_n int;
  v_events int := 0;
  v_out jsonb := '[]'::jsonb;
  v_mt timestamptz;
  -- 211: the all-time board's key (every session ever, the months added up), worked out after the months.
  v_all constant date := '2000-01-01';
begin
  if not pg_try_advisory_xact_lock(hashtextextended('refresh_city_board', 196)) then
    return jsonb_build_object('skipped', 'already running');
  end if;
  select * into v_rules from private.city_board_rules();
  v_months := array(select distinct date_trunc('month', x)::date from unnest(array[current_date - 3, current_date, current_date + 1]) as x order by 1);
  v_months := v_months || v_all;   -- 211: last, after the months (which come out exactly as before)

  foreach v_m in array v_months loop
    v_mt := clock_timestamp();
    -- 211: the all-time board has no end (a far-off day, so the daily snapshot below is taken every day).
    v_end := case when v_m = v_all then date '3000-01-01' else (v_m + interval '1 month')::date end;

    -- 1. Players: counted sessions, by the PROFILE town. Tennis only; logged
    --    within 7 days of the day played and not for a later day; at most 2 a
    --    day; not suspended. Everyone counted is in the totals. `named`: an
    --    adult who may be named to anyone (city_board_named). `friends_only`
    --    (197): a teen or no birthday on file, switch and activity status on,
    --    named only to friends who follow each other with them (city_page).
    --    Private and switched-off players: never named. `sessions` stops at
    --    yesterday in Hawaii (what others see); `sessions_now` has today (yours
    --    only). A player keeps the city (or no city) of their first counted
    --    session this month; after a town change they still count there, unnamed.
    if v_m = v_all then
    -- 211: all time, the months added up (private.city_board_all_time_parts), never worked out again from the
    -- sessions: a count stays with the city its month counted it for, so a town change never moves anyone's
    -- sessions from one city to another (which the all-time board minus the month's would give away exactly).
    -- A player's row: their latest month's city (else the latest in the block from before the boards), with
    -- what they counted there; named / friends_only as on a month (that city is their profile town now).
    delete from public.city_board_members where month = v_m;
    insert into public.city_board_members (month, user_id, city_id, sessions, sessions_now, named, friends_only)
    select v_m, t.user_id, t.city_id, t.sessions, t.sessions_now,
           t.city_id is not null and p.suspended_at is null and t.city_id = private.city_board_city(p.city_lat, p.city_lng, p.location)
             and private.city_board_named(t.user_id),
           t.city_id is not null and p.suspended_at is null and t.city_id = private.city_board_city(p.city_lat, p.city_lng, p.location)
             and private.city_board_friends_only(t.user_id)
      from (select distinct on (a.user_id) a.*
              from private.city_board_all_time_parts() a
             order by a.user_id, a.last_month desc, a.sessions_now desc, a.city_id) t
      join public.profiles p on p.id = t.user_id;
    else
    select coalesce(jsonb_object_agg(mb.user_id::text, mb.city_id), '{}'::jsonb) into v_was
      from public.city_board_members mb where mb.month = v_m;
    delete from public.city_board_members where month = v_m;
    insert into public.city_board_members (month, user_id, city_id, sessions, sessions_now, named, friends_only)
    select v_m, x.user_id, y.city_id, x.sessions, x.sessions_now,
           y.city_id is not null and y.city_id = x.city_now and private.city_board_named(x.user_id),
           y.city_id is not null and y.city_id = x.city_now and private.city_board_friends_only(x.user_id)
      from (
        select k.user_id, count(*) filter (where k.day <= v_cutoff and k.created_at < v_day_cut)::int as sessions, count(*)::int as sessions_now,
               private.city_board_city(p.city_lat, p.city_lng, p.location) as city_now
          from (
            select s.user_id, s.day, s.created_at, row_number() over (partition by s.user_id, s.day order by s.created_at, s.id) as n
              from public.practice_sessions s
             where s.day >= v_m and s.day < v_end
               and s.kind in ('practice', 'match', 'drills')
               and s.created_at < (s.day + 8)::timestamp at time zone 'UTC'
               and s.day <= (s.created_at at time zone 'UTC')::date + 1
          ) k
          join public.profiles p on p.id = k.user_id and p.suspended_at is null
         where k.n <= 2
         group by k.user_id, p.city_lat, p.city_lng, p.location
      ) x
      cross join lateral (select case when v_was ? x.user_id::text then v_was ->> x.user_id::text else x.city_now end as city_id) y;
    end if;

    -- 2. The words under a filled face, for players who may be named (to
    --    anyone, or to friends only): "Usually
    --    weekends / evenings / mornings" (6 of their last 10, at least 4 that
    --    say), else the last day they played (never today, at most a week back).
    with tzs as materialized (
      select x.tz as name
        from (select distinct us.tz from public.user_state us
                join public.city_board_members mb on mb.month = v_m and mb.user_id = us.user_id and (mb.named or mb.friends_only)
               where us.tz is not null) x
       where private.safe_tz(x.tz) is not null
    ), recent as (
      select s.user_id, s.day, s.created_at, s.activity_id,
             row_number() over (partition by s.user_id order by s.day desc, s.created_at desc, s.id) as n
        from public.practice_sessions s
        join public.city_board_members mb on mb.month = v_m and mb.user_id = s.user_id and (mb.named or mb.friends_only)
       where s.kind in ('practice', 'match', 'drills')
         and s.day <= v_cutoff and s.day > v_cutoff - 90
         and s.created_at < v_day_cut
         and s.created_at < (s.day + 8)::timestamp at time zone 'UTC'
         -- 193: a session that logged itself counts here only once someone besides its player may see it
         -- (not Only me, not before they chose who sees them).
         and (not s.auto_logged or public.auto_log_audience_of(s.user_id, null) <> 'private')
    ), ten as (
      select r.user_id, r.day, extract(isodow from r.day) >= 6 as weekend,
             -- The hour it started: a tracker's own start in its own offset; else
             -- when it was logged, in the player's time zone, if logged that same day.
             coalesce(extract(hour from (a.started_at at time zone 'UTC') + make_interval(mins => a.tz_offset_min))::int,
                      case when z.name is not null and (r.created_at at time zone z.name)::date = r.day
                           then extract(hour from r.created_at at time zone z.name)::int end) as hour
        from recent r
        left join public.detected_activities a on a.id = r.activity_id and a.tz_offset_min is not null
              -- 193: Apple Health's (and Health Connect's) start time only for a player who lets others see their sessions.
              and (a.source not in ('apple-health', 'health-connect') or public.auto_log_audience_of(r.user_id, null) <> 'private')
        left join public.user_state us on us.user_id = r.user_id
        left join tzs z on z.name = us.tz
       where r.n <= 10
    ), sh as (
      select t.user_id, max(t.day) as last_day, count(*) as n, count(t.hour) as nh,
             count(*) filter (where t.weekend)::numeric / count(*) as wk,
             count(*) filter (where t.hour >= 17)::numeric / nullif(count(t.hour), 0) as ev,
             count(*) filter (where t.hour < 11)::numeric / nullif(count(t.hour), 0) as mo
        from ten t group by t.user_id
    )
    update public.city_board_members mb
       set last_day = case when sh.last_day >= v_cutoff - 5 then sh.last_day end,
           habit = (select h.word from (values ('weekends', case when sh.n >= 4 then sh.wk end, 1),
                                               ('evenings', case when sh.nh >= 4 then sh.ev end, 2),
                                               ('mornings', case when sh.nh >= 4 then sh.mo end, 3)) as h(word, share, o)
                     where h.share >= 0.6 order by h.share desc, h.o limit 1)
      from sh
     where mb.month = v_m and mb.user_id = sh.user_id;

    -- 3. Cities: totals of everyone counted up to yesterday; ranked only with min_players.
    select coalesce(jsonb_object_agg(cb.city_id, cb.rank), '{}'::jsonb) into v_old
      from public.city_board_cities cb where cb.month = v_m and cb.rank is not null;
    delete from public.city_board_cities where month = v_m;
    if v_m = v_all then
    -- 211: all time, from every player's count per city (a mover counts in each city they counted for, as on the months).
    insert into public.city_board_cities (month, city_id, sessions, players, rank, per_value, per_rank)
    select v_m, x.city_id, x.sessions, x.players,
           case when x.ranked then rank() over (partition by x.ranked order by x.sessions desc) end,
           x.per_value,
           case when x.ranked then rank() over (partition by x.ranked order by x.per_value desc) end
      from (
        select a.city_id, sum(a.sessions)::int as sessions, count(*)::int as players,
               round(sum(a.sessions)::numeric / count(*), 1) as per_value,
               count(*) >= v_rules.min_players and bc.country = 'US' as ranked
          from private.city_board_all_time_parts() a join public.board_cities bc on bc.id = a.city_id
         where a.sessions > 0 and a.city_id is not null
         group by a.city_id, bc.country
      ) x;
    else
    insert into public.city_board_cities (month, city_id, sessions, players, rank, per_value, per_rank)
    select v_m, x.city_id, x.sessions, x.players,
           case when x.ranked then rank() over (partition by x.ranked order by x.sessions desc) end,
           x.per_value,
           case when x.ranked then rank() over (partition by x.ranked order by x.per_value desc) end
      from (
        select mb.city_id, sum(mb.sessions)::int as sessions, count(*)::int as players,
               round(sum(mb.sessions)::numeric / count(*), 1) as per_value,
               count(*) >= v_rules.min_players and bc.country = 'US' as ranked
          from public.city_board_members mb join public.board_cities bc on bc.id = mb.city_id
         where mb.month = v_m and mb.sessions > 0 and mb.city_id is not null
         group by mb.city_id, bc.country
      ) x;
    end if;

    -- Movement: against the snapshot 7 days ago, same month only.
    update public.city_board_cities cb set week_ago_rank = d.rank
      from public.city_board_daily d
     where cb.month = v_m and cb.rank is not null
       and d.month = v_m and d.day = current_date - 7 and d.city_id = cb.city_id and d.rank is not null;
    -- "Climbing N weeks running": 7-day steps back in a row that each improved.
    for c in select cb.city_id, cb.rank from public.city_board_cities cb where cb.month = v_m and cb.rank is not null loop
      v_run := 0;
      v_now := c.rank;
      v_day := current_date;
      loop
        v_prev := null;
        select d.rank into v_prev from public.city_board_daily d where d.month = v_m and d.city_id = c.city_id and d.day = v_day - 7;
        exit when v_prev is null or v_now >= v_prev or v_run >= 5;
        v_run := v_run + 1;
        v_now := v_prev;
        v_day := v_day - 7;
      end loop;
      if v_run > 0 then
        update public.city_board_cities set run = v_run where month = v_m and city_id = c.city_id;
      end if;
    end loop;

    -- News: every pair of ranked cities that swapped since the last refresh.
    insert into public.city_board_events (month, at, city_id, passed_id)
    select v_m, v_at, a.city_id, b.city_id
      from public.city_board_cities a
      join public.city_board_cities b on b.month = v_m and b.city_id <> a.city_id and b.rank is not null
     where a.month = v_m and a.rank is not null
       and v_old ? a.city_id and v_old ? b.city_id
       and a.rank < b.rank and (v_old ->> a.city_id)::int > (v_old ->> b.city_id)::int;
    get diagnostics v_n = row_count;
    v_events := v_events + v_n;
    -- Taken back within a day: neither is news.
    with flips as (
      select e.id as eid, f.id as fid
        from public.city_board_events e
        join public.city_board_events f on f.month = e.month and f.city_id = e.passed_id and f.passed_id = e.city_id
       where e.month = v_m and e.at = v_at and f.at < v_at and f.at >= v_at - interval '24 hours'
    )
    delete from public.city_board_events ev where ev.id in (select eid from flips union select fid from flips);

    -- One snapshot a day (the first run after 10:00 UTC, about 6am Eastern), within the month itself.
    if extract(hour from now() at time zone 'UTC') >= 10 and current_date >= v_m and current_date < v_end
       and not exists (select 1 from public.city_board_daily d where d.month = v_m and d.day = current_date) then
      insert into public.city_board_daily (month, day, city_id, rank, sessions, players)
      select v_m, current_date, cb.city_id, cb.rank, cb.sessions, cb.players from public.city_board_cities cb where cb.month = v_m;
    end if;

    -- 4. Busiest courts: parks (the app's ~250 m fold), courts only, no people.
    --    Worked out once a week, from what was logged before Monday 00:00 UTC,
    --    one park-week at a time, and a park-week once counted is never
    --    changed or taken back: a court's number only ever grows, a whole week
    --    at a time, so it never moves with a day, one session, or one player
    --    switching off, going private or leaving (which would point at them).
    --    Only sessions by players who may be named, with public accounts (teens,
    --    no birthday, private accounts, switched off: never), at courts with a
    --    name that are not anyone's home ('private', or named for an apartment,
    --    condo, HOA, backyard...). A park-week counts only with 3+ different
    --    players on 2+ different days (one group's one outing is not enough);
    --    the park's city is the park's own position, not who played there.
    if (select mo.courts_cut from public.city_board_months mo where mo.month = v_m) is distinct from v_court_cut then
      with at_courts as (
        select k.user_id, k.day, date_trunc('week', k.day::timestamp)::date as wk, ct.id as court_id, ct.name, ct.lat, ct.lng,
               round(ct.lat / 0.0022)::int as gi, round(ct.lng / 0.003)::int as gj
          from (
            select s.user_id, s.day, s.court_id, s.created_at,
                   row_number() over (partition by s.user_id, s.day order by s.created_at, s.id) as n
              from public.practice_sessions s
             where s.day >= v_m and s.day < v_end
               and s.kind in ('practice', 'match', 'drills')
               and s.created_at < (s.day + 8)::timestamp at time zone 'UTC'
               and s.day <= (s.created_at at time zone 'UTC')::date + 1
          ) k
          join public.profiles p on p.id = k.user_id and p.suspended_at is null and not p.is_private
          join public.courts ct on ct.id = k.court_id and ct.access <> 'private'
                               and nullif(btrim(coalesce(ct.name, '')), '') is not null
                               and ct.name !~* v_home_words
         where k.n <= 2 and k.court_id is not null and k.created_at < v_court_cut
           and private.city_board_named(k.user_id)
      ), cells as (
        select a.gi, a.gj, a.wk, count(*)::int as sessions, count(distinct a.user_id)::int as players, avg(a.lat) as lat, avg(a.lng) as lng
          from at_courts a
         where a.wk < (v_court_cut at time zone 'UTC')::date          -- whole weeks only
         group by a.gi, a.gj, a.wk
        having count(distinct a.user_id) >= v_rules.court_min_players and count(distinct a.day) >= 2
      ), placed as (
        select ce.*, private.city_board_city(ce.lat, ce.lng, null) as city_id, top.court_id, top.name,
               (select count(*)::int from public.courts ct
                 where ct.lat between (ce.gi - 0.5) * 0.0022 and (ce.gi + 0.5) * 0.0022
                   and ct.lng between (ce.gj - 0.5) * 0.003 and (ce.gj + 0.5) * 0.003
                   and round(ct.lat / 0.0022)::int = ce.gi and round(ct.lng / 0.003)::int = ce.gj
                   and ct.access <> 'private') as courts
          from cells ce
          cross join lateral (
            select a.court_id, a.name from at_courts a where a.gi = ce.gi and a.gj = ce.gj and a.wk = ce.wk
             group by a.court_id, a.name order by count(*) desc, a.court_id limit 1) top
      )
      insert into public.city_board_court_weeks (month, wk, park_key, city_id, court_id, name, courts, sessions, players)
      select v_m, pl.wk, pl.gi || ':' || pl.gj, pl.city_id, pl.court_id, pl.name, greatest(pl.courts, 1), pl.sessions, pl.players
        from placed pl where pl.city_id is not null
      on conflict (month, wk, park_key) do nothing;

      delete from public.city_board_courts where month = v_m;
      insert into public.city_board_courts (month, city_id, park_key, court_id, name, courts, sessions, players)
      select v_m, y.city_id, y.park_key, y.court_id, y.name, y.courts, y.sessions, y.players
        from (select w.city_id, w.park_key,
                     (array_agg(w.court_id order by w.sessions desc, w.wk desc))[1] as court_id,
                     (array_agg(w.name order by w.sessions desc, w.wk desc))[1] as name,
                     max(w.courts) as courts, sum(w.sessions)::int as sessions, max(w.players) as players,
                     row_number() over (partition by w.city_id order by sum(w.sessions) desc, max(w.players) desc, w.park_key) as r
                from public.city_board_court_weeks w
               where w.month = v_m
               group by w.city_id, w.park_key) y
       where y.r <= 3;
    end if;

    -- 5. Clip of the month: a post that may be one (city_board_clip_ok: what
    --    guest mode would show, a video, by a named adult, no court or place
    --    on it, everyone on it nameable), posted that month. Top 3 per city,
    --    one per author, by views; city_page checks each again for its viewer.
    delete from public.city_board_clips where month = v_m;
    insert into public.city_board_clips (month, city_id, post_id, author_id, views, place)
    select v_m, z.city_id, z.id, z.author_id, z.views, z.place
      from (
        select y.*, row_number() over (partition by y.city_id order by y.views desc, y.created_at desc, y.id)::smallint as place
          from (
            select distinct on (po.author_id) po.id, po.author_id, po.views, po.created_at,
                   private.city_board_city(p.city_lat, p.city_lng, p.location) as city_id
              from public.posts po join public.profiles p on p.id = po.author_id
             where po.created_at >= v_m::timestamp at time zone 'UTC' and po.created_at < v_end::timestamp at time zone 'UTC'
               and po.video_url is not null and not po.archived and po.removed_at is null and po.group_id is null
               and not p.is_private and p.suspended_at is null
               and private.city_board_clip_ok(po)
             order by po.author_id, po.views desc, po.created_at desc, po.id
          ) y
         where y.city_id is not null
      ) z
     where z.place <= 3;

    insert into public.city_board_months (month, refreshed_at, took_ms, courts_cut)
    values (v_m, clock_timestamp(), (extract(epoch from clock_timestamp() - v_mt) * 1000)::int, v_court_cut)
    on conflict (month) do update set refreshed_at = excluded.refreshed_at, took_ms = excluded.took_ms, courts_cut = excluded.courts_cut;

    v_out := v_out || jsonb_build_object('month', v_m,
      'players', (select count(*) from public.city_board_members where month = v_m),
      'cities', (select count(*) from public.city_board_cities where month = v_m),
      'ranked', (select count(*) from public.city_board_cities where month = v_m and rank is not null));
  end loop;

  -- Keep it small. (211: never the all-time board; a month's players are first added into the all-time
  -- board's block, private.city_board_all_time_base, so the all-time board never drops when they go.)
  insert into private.city_board_all_time_base as b (user_id, city_id, sessions, last_month)
  select mb.user_id, mb.city_id, sum(mb.sessions)::int, max(mb.month)
    from public.city_board_members mb
   where mb.month < (date_trunc('month', current_date) - interval '13 months')::date and mb.month <> v_all
     and mb.city_id is not null and mb.sessions > 0
   group by mb.user_id, mb.city_id
  on conflict (user_id, city_id) do update set sessions = b.sessions + excluded.sessions, last_month = greatest(b.last_month, excluded.last_month);
  delete from public.city_board_daily where day < current_date - 70;
  delete from public.city_board_events where at < now() - interval '14 days';
  delete from public.city_board_members where month < (date_trunc('month', current_date) - interval '13 months')::date and month <> v_all;
  delete from public.city_board_cities where month < (date_trunc('month', current_date) - interval '13 months')::date and month <> v_all;
  delete from public.city_board_courts where month < (date_trunc('month', current_date) - interval '13 months')::date and month <> v_all;
  delete from public.city_board_court_weeks where month < (date_trunc('month', current_date) - interval '13 months')::date and month <> v_all;
  delete from public.city_board_clips where month < (date_trunc('month', current_date) - interval '13 months')::date and month <> v_all;
  delete from public.city_board_months where month < (date_trunc('month', current_date) - interval '13 months')::date and month <> v_all;

  return jsonb_build_object('months', v_out, 'events', v_events,
    'took_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int);
end $function$;

-- ------------------------------------------------------- 2. city_board(month)
-- As 196, but '2000-01-01' (all time) is a month it takes, with no open_until.
CREATE OR REPLACE FUNCTION public.city_board(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  v_rules record;
  v_my_city text;
  v_mine public.city_board_members;
  v_c public.city_board_cities;
  v_b public.board_cities;
  v_ranked text[];
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.flag_on_for('city-board', me) then return jsonb_build_object('off', true); end if;
  -- 211: the all-time board ('2000-01-01') too, besides the months around today.
  if p_month is null
     or (p_month <> date '2000-01-01'
         and (p_month <> date_trunc('month', p_month)::date
              or p_month not in (date_trunc('month', current_date - 3)::date, date_trunc('month', current_date)::date, date_trunc('month', current_date + 1)::date))) then
    raise exception 'month out of range';
  end if;
  select * into v_rules from private.city_board_rules();
  select private.city_board_city(p.city_lat, p.city_lng, p.location) into v_my_city from public.profiles p where p.id = me;
  select * into v_mine from public.city_board_members mb where mb.month = p_month and mb.user_id = me;
  select * into v_c from public.city_board_cities cb where cb.month = p_month and cb.city_id = v_my_city;
  select * into v_b from public.board_cities b where b.id = v_my_city;
  v_ranked := array(select cb.city_id from public.city_board_cities cb where cb.month = p_month and cb.rank is not null);

  return jsonb_build_object(
    'month', to_char(p_month, 'YYYY-MM-DD'),
    'refreshed_at', (select m.refreshed_at from public.city_board_months m where m.month = p_month),
    -- 211: the all-time board is never closed: no open_until.
    'open_until', case when p_month <> date '2000-01-01' then to_char((p_month + interval '1 month')::date + 2, 'YYYY-MM-DD') end,
    -- Everything below but `me` is as of yesterday in Hawaii.
    'cities', coalesce((
      select jsonb_agg(jsonb_build_object('id', cb.city_id, 'name', b.name, 'region', b.region,
               'sessions', cb.sessions, 'players', cb.players, 'rank', cb.rank, 'per_value', cb.per_value,
               'per_rank', cb.per_rank, 'week_ago_rank', cb.week_ago_rank, 'run', cb.run)
             order by cb.rank, cb.players desc, b.name)
        from public.city_board_cities cb join public.board_cities b on b.id = cb.city_id
       where cb.month = p_month and cb.rank is not null), '[]'::jsonb),
    -- Only between cities that are on the board now (an unranked city is never named).
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('who', e.city_id, 'passed', e.passed_id, 'at', e.at) order by e.at desc, e.id desc)
        from (select ev.* from public.city_board_events ev
               where ev.month = p_month and ev.at > now() - interval '7 days'
                 and ev.city_id = any (v_ranked) and ev.passed_id = any (v_ranked)
               order by ev.at desc, ev.id desc limit 10) e), '[]'::jsonb),
    -- Yours, up to the minute: `sessions` has today too; `in_total` is what your
    -- city's total holds of yours (up to yesterday), so the phone can add the rest.
    'me', jsonb_build_object(
      'city_id', v_my_city, 'city_name', v_b.name, 'region', v_b.region,
      'counts_for', v_mine.city_id,   -- the city this month's sessions count for (fixed at the first one), may differ after a move
      'ranked', v_c.rank is not null,
      'sessions', coalesce(v_mine.sessions_now, 0),
      'in_total', case when v_mine.city_id = v_my_city then v_mine.sessions else 0 end,
      'players_needed', case when v_my_city is not null and v_c.rank is null
                             then private.city_board_needs(v_c.players, v_mine.city_id = v_my_city and v_mine.sessions > 0) end));
end $function$;

-- -------------------------------------------------- 3. city_page(city, month)
-- As 198, but '2000-01-01' (all time) is a month it takes; Most active courts
-- all time adds up each court's months.
CREATE OR REPLACE FUNCTION public.city_page(p_city text, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  v_rules record;
  v_adult boolean;
  v_muted text[];
  v_my_city text;
  v_mine boolean;
  v_b public.board_cities;
  v_c public.city_board_cities;
  v_of int;
  v_me public.city_board_members;
  v_member boolean;
  v_cap int;
  v_room int;
  v_cands uuid[];
  v_ok uuid[] := '{}';
  v_batch uuid[];
  v_paid uuid[];
  v_asked uuid[];
  v_i int := 1;
  v_top uuid[];
  v_up uuid[] := '{}';
  v_fill uuid[];
  v_top_json jsonb;
  v_my_rank int;
  v_fill_json jsonb;
  v_courts jsonb;
  v_active jsonb;
  v_clip jsonb;
  v_city jsonb;
  v_me_json jsonb;
  v_rest_n int;
  v_rest_s int;
  v_nf int;
  v_drop uuid[] := '{}';
  v_in int;
  cl record;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.flag_on_for('city-board', me) then return jsonb_build_object('off', true); end if;
  -- 211: the all-time board ('2000-01-01') too, besides the months around today.
  if p_month is null
     or (p_month <> date '2000-01-01'
         and (p_month <> date_trunc('month', p_month)::date
              or p_month not in (date_trunc('month', current_date - 3)::date, date_trunc('month', current_date)::date, date_trunc('month', current_date + 1)::date))) then
    raise exception 'month out of range';
  end if;
  if p_city is null or p_city !~ '^[a-z0-9-]{2,60}$' then return jsonb_build_object('city', null); end if;
  select * into v_b from public.board_cities b where b.id = p_city;
  if not found then return jsonb_build_object('city', null); end if;
  select * into v_rules from private.city_board_rules();
  select * into v_c from public.city_board_cities cb where cb.month = p_month and cb.city_id = p_city;
  select private.city_board_city(p.city_lat, p.city_lng, p.location) into v_my_city from public.profiles p where p.id = me;
  v_mine := coalesce(v_my_city = p_city, false);
  -- A city not on the board yet opens only for its own players.
  if v_c.rank is null and not v_mine then return jsonb_build_object('city', null); end if;

  v_adult := public.known_adult(me);   -- your own age only
  select us.muted_ids into v_muted from public.user_state us where us.user_id = me;
  v_muted := coalesce(v_muted, '{}');
  select * into v_me from public.city_board_members mb where mb.month = p_month and mb.user_id = me and mb.city_id = p_city;
  -- You are one of the city's players (its totals hold you) only from yesterday's count.
  -- 211: all time, also when you counted here before a move (your row is then your new city's).
  v_in := coalesce(v_me.sessions, 0);
  if p_month = date '2000-01-01' and v_me.user_id is null then
    select coalesce(sum(a.sessions), 0)::int into v_in from private.city_board_all_time_parts(me) a where a.city_id = p_city;
  end if;
  v_member := v_in > 0;
  select count(*)::int into v_of from public.city_board_cities cb where cb.month = p_month and cb.rank is not null;

  -- On a ranked city, at least two counted players always stay out of your
  -- reach besides the adults (anyone can be shown all of them, muting their
  -- way down the list): else the last one's number is the total minus all
  -- the rest. Every teen who follows you counts as in reach (you could follow
  -- back), so your own follows can't move this. When fewer than two would be
  -- left, that many of those teens stay off your list here too, picked by id,
  -- never by number. Not a friend of any teen here: nothing changes (196).
  if v_c.rank is not null then
    select count(*)::int into v_nf
      from public.city_board_members mb
     where mb.month = p_month and mb.city_id = p_city and mb.sessions > 0 and mb.user_id <> me and not mb.named
       and not (mb.friends_only and exists (select 1 from public.follows f where f.follower_id = mb.user_id and f.following_id = me));
    if v_nf < 2 then
      v_drop := array(select mb.user_id from public.city_board_members mb
                       where mb.month = p_month and mb.city_id = p_city and mb.sessions > 0 and mb.user_id <> me and mb.friends_only
                         and exists (select 1 from public.follows f where f.follower_id = mb.user_id and f.following_id = me)
                       order by md5(me::text || mb.user_id::text), mb.user_id
                       limit 2 - v_nf);
    end if;
  end if;

  -- Everyone who may be named to you here, most sessions (as of yesterday) first.
  -- An adult (`named`): as 196. A teen or no birthday on file (`friends_only`,
  -- 197): only when you follow each other, and never when either of you muted
  -- the other. Anyone who is not a friend of a teen here gets exactly 196's list.
  select coalesce(array_agg(x.user_id order by x.sessions desc, x.last_day desc nulls last, x.user_id), '{}') into v_cands
    from (select mb.user_id, mb.sessions, mb.last_day, mb.named
            from public.city_board_members mb
           where mb.month = p_month and mb.city_id = p_city and mb.sessions > 0 and mb.user_id <> me
             and (mb.named or (mb.friends_only and not (mb.user_id = any (v_drop)) and public.follow_each_other(me, mb.user_id)))
             and not (mb.user_id::text = any (v_muted))
           order by mb.sessions desc, mb.last_day desc nulls last, mb.user_id
           limit 200) x
   where case when x.named
              then private.city_board_named(x.user_id)       -- still adult, switch on, activity on, not suspended
              else private.city_board_friends_only(x.user_id) -- still a teen, switch on, activity on, not suspended
                   and public.follow_each_other(me, x.user_id)
                   and not coalesce((select us.muted_ids from public.user_state us where us.user_id = x.user_id) @> array[me::text], false)
         end
     and (select private.city_board_city(pp.city_lat, pp.city_lng, pp.location) from public.profiles pp where pp.id = x.user_id) = p_city
     and not public.is_blocked_between(me, x.user_id)
     and public.can_view(x.user_id)                          -- a private account only once you follow it
     and (v_adult or public.follow_each_other(me, x.user_id)); -- a teen: friends who follow each other only

  -- Up to hit today, ringed. Your own city: today's Find Players rule
  -- (players_in_town, unchanged), less anyone you muted or who turned "Show
  -- me on city boards" off. Another city: friends who follow each other with
  -- you (decision 4), who may be named, whose profile town is that city.
  if v_mine then
    select coalesce(array_agg(t.user_id order by t.o), '{}') into v_up
      from public.players_in_town() with ordinality as t(user_id, o)
      join public.profiles p on p.id = t.user_id
      left join public.user_state us on us.user_id = t.user_id
     where p.open_to_hit_until > now()
       and coalesce(us.city_boards, true)
       and not (t.user_id::text = any (v_muted));
  else
    select coalesce(array_agg(p.id order by p.open_to_hit_until desc, p.id), '{}') into v_up
      from public.follows f
      join public.profiles p on p.id = f.following_id
     where f.follower_id = me and p.id <> me
       and p.open_to_hit_until > now()
       and public.follow_each_other(me, p.id)
       and not public.is_blocked_between(me, p.id)
       and not (p.id::text = any (v_muted))
       and private.city_board_named(p.id)
       and private.city_board_city(p.city_lat, p.city_lng, p.location) = p_city;
  end if;

  -- How many may carry a number: never more than players - 2 (- 1 more when you
  -- are one of them), so no one's own count can be worked out from the total.
  v_cap := case when v_c.rank is null then 0
                else least(v_rules.top_max, greatest(0, v_c.players - 2 - case when v_member then 1 else 0 end)) end;
  v_room := greatest(0, v_rules.fill_to - cardinality(v_up));
  -- A stranger who does not follow you costs the day's age-check allowance
  -- (109; seeing them here says they are an adult), 5 at a time, best first.
  while (cardinality(v_ok) < v_cap
         or (select count(*) from unnest(v_ok) as x where not (x = any (v_up))) < v_room)
        and v_i <= cardinality(v_cands) and v_i <= 40 loop
    v_batch := v_cands[v_i : v_i + 4];
    v_paid := array(select x from unnest(v_batch) as x
                     where not exists (select 1 from public.follows f where f.follower_id = x and f.following_id = me));
    v_asked := case when cardinality(v_paid) > 0 then public.age_rule_budget(v_paid) else '{}'::uuid[] end;
    v_ok := v_ok || array(select u.x from unnest(v_batch) with ordinality as u(x, o)
                           where not (u.x = any (v_paid)) or u.x = any (v_asked) order by u.o);
    v_i := v_i + 5;
  end loop;
  if v_rules.up_strangers_elsewhere and not v_mine then
    v_up := v_up || array(select u.x from unnest(v_ok) with ordinality as u(x, o) join public.profiles p on p.id = u.x
                           where p.open_to_hit_until > now() and not (u.x = any (v_up))
                             and private.city_board_named(u.x)   -- never a teen, whatever this rule says (197)
                           order by u.o);
    v_room := greatest(0, v_rules.fill_to - cardinality(v_up));
  end if;

  -- Top players. The k people not shown (players - shown - you) hold the rest
  -- of the total, each at least 1: if the rest were exactly k, every one of
  -- them would be known to have played once. So: fewer rows until rest > k.
  v_top := v_ok[1 : v_cap];
  loop
    exit when coalesce(cardinality(v_top), 0) = 0;
    v_rest_n := v_c.players - cardinality(v_top) - case when v_member then 1 else 0 end;
    v_rest_s := v_c.sessions - case when v_member then v_in else 0 end
                - (select coalesce(sum(mb.sessions), 0)::int from public.city_board_members mb
                    where mb.month = p_month and mb.user_id = any (v_top));
    exit when v_rest_s > v_rest_n;
    v_top := v_top[1 : cardinality(v_top) - 1];
  end loop;
  v_top := coalesce(v_top, '{}');

  -- Ranked among the rows shown and you (your own count up to the minute):
  -- never among people you are not shown.
  with t as (
    select u.x as user_id, mb.sessions, u.o
      from unnest(v_top) with ordinality as u(x, o)
      join public.city_board_members mb on mb.month = p_month and mb.user_id = u.x
    union all
    select me, v_me.sessions_now, 0 where v_me.user_id is not null and v_c.rank is not null
  ), r as (select t.*, rank() over (order by t.sessions desc) as place from t)
  select coalesce(jsonb_agg(jsonb_build_object('id', r.user_id, 'sessions', r.sessions, 'rank', r.place) order by r.place, r.o)
                  filter (where r.user_id <> me), '[]'::jsonb),
         max(r.place) filter (where r.user_id = me)
    into v_top_json, v_my_rank from r;

  -- The fill after the ringed faces: the city's most active, no number unless already on Top players.
  v_fill := array(select u.x from unnest(v_ok) with ordinality as u(x, o) where not (u.x = any (v_up)) order by u.o limit v_room);
  select coalesce(jsonb_agg(jsonb_build_object('id', mb.user_id, 'habit', mb.habit,
                    'last_day', to_char(mb.last_day, 'YYYY-MM-DD'),
                    'sessions', case when mb.user_id = any (v_top) then mb.sessions end) order by u.o), '[]'::jsonb)
    into v_fill_json
    from unnest(v_fill) with ordinality as u(x, o)
    join public.city_board_members mb on mb.month = p_month and mb.user_id = u.x;

  -- Busiest courts: courts only.
  select coalesce(jsonb_agg(jsonb_build_object('court_id', k.court_id, 'name', k.name, 'courts', k.courts, 'sessions', k.sessions)
                  order by k.sessions desc, k.players desc, k.park_key), '[]'::jsonb)
    into v_courts
    from public.city_board_courts k where k.month = p_month and k.city_id = p_city;

  -- Most active courts (198): courts only, up to 5, most visits first, each
  -- court checked again now (still listable: not anyone's home, still named).
  select coalesce(jsonb_agg(jsonb_build_object('court_id', k.court_id, 'name', k.name,
                    'lat', round(k.lat::numeric, 5), 'lng', round(k.lng::numeric, 5), 'visits', k.visits)
                  order by k.visits desc, k.players desc, k.place_key), '[]'::jsonb)
    into v_active
    from (select a.* from public.city_board_active_courts a
            join public.courts ct on ct.id = a.court_id
           where a.month = p_month and a.city_id = p_city
             and private.city_board_court_place(ct) = a.place_key
             and p_month <> date '2000-01-01'
          union all
          -- 211: all time, each court's months added up (each month's number as Most active courts gave it,
          -- so it only ever moves when a month's does), shown as its busiest month's entry.
          select null::date, s.place_key, p_city, s.court_id, s.name, s.lat, s.lng, s.visits, s.players, null::timestamptz
            from (select a.place_key,
                         (array_agg(a.court_id order by a.visits desc, a.month desc))[1] as court_id,
                         (array_agg(a.name order by a.visits desc, a.month desc))[1] as name,
                         (array_agg(a.lat order by a.visits desc, a.month desc))[1] as lat,
                         (array_agg(a.lng order by a.visits desc, a.month desc))[1] as lng,
                         sum(a.visits)::int as visits, max(a.players) as players
                    from public.city_board_active_courts a
                    join public.courts ct on ct.id = a.court_id
                   where p_month = date '2000-01-01' and a.month <> date '2000-01-01' and a.city_id = p_city
                     and private.city_board_court_place(ct) = a.place_key
                   group by a.place_key) s
           order by visits desc, players desc, place_key
           limit 5) k;

  -- The clip: the first candidate this viewer may see, checked again now
  -- (and never one with someone on it who is blocked with you either way).
  for cl in
    select k.post_id, k.author_id, po.views
      from public.city_board_clips k
      join public.posts po on po.id = k.post_id
     where k.month = p_month and k.city_id = p_city
       and po.author_id = k.author_id
       and private.city_board_clip_ok(po)
       and not public.is_blocked_between(me, k.author_id)
       and not (k.author_id::text = any (v_muted))
       and not exists (select 1 from unnest(private.city_board_post_people(po)) as t(u)
                        where t.u <> me and (public.is_blocked_between(me, t.u) or t.u::text = any (v_muted)))
     order by k.place
  loop
    if cl.author_id <> me
       and not exists (select 1 from public.follows f where f.follower_id = cl.author_id and f.following_id = me)
       and not (cl.author_id = any (public.age_rule_budget(array[cl.author_id]))) then
      continue;
    end if;
    v_clip := jsonb_build_object('post_id', cl.post_id, 'author_id', cl.author_id, 'views', cl.views);
    exit;
  end loop;

  if v_c.rank is not null then
    v_city := jsonb_build_object('id', v_b.id, 'name', v_b.name, 'region', v_b.region, 'rank', v_c.rank, 'of', v_of,
      'sessions', v_c.sessions, 'players', v_c.players, 'per_value', v_c.per_value, 'per_rank', v_c.per_rank,
      'week_ago_rank', v_c.week_ago_rank, 'run', v_c.run);
  else
    v_city := jsonb_build_object('id', v_b.id, 'name', v_b.name, 'region', v_b.region, 'rank', null, 'of', v_of,
      'players_needed', private.city_board_needs(v_c.players, v_member));
  end if;
  if v_mine or v_me.user_id is not null then
    v_me_json := jsonb_build_object('rank', v_my_rank, 'sessions', coalesce(v_me.sessions_now, 0), 'in_total', coalesce(v_me.sessions, 0));
  end if;

  return jsonb_build_object(
    'month', to_char(p_month, 'YYYY-MM-DD'),
    'refreshed_at', (select m.refreshed_at from public.city_board_months m where m.month = p_month),
    'city', v_city, 'top', v_top_json, 'me', v_me_json, 'fill', v_fill_json,
    'up', to_jsonb(v_up), 'courts', v_courts, 'active_courts', v_active, 'clip', v_clip);
end $function$;

-- --------------------------------------------- 3b. send_catch_up_alerts()
-- As 201 left it, but step d ("<city> moved up to #N on the city board")
-- reads the all-time board, the one its link (/city/<id>) now opens.
CREATE OR REPLACE FUNCTION public.send_catch_up_alerts(p_now timestamp with time zone DEFAULT now(), p_dry_run boolean DEFAULT false)
 RETURNS TABLE(who uuid, nudge text, words text, link text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  w text;
  l text;
  here_lat double precision;
  here_lng double precision;
  town text;
  v_n integer;
  v_names text[];
  v_first uuid;
  v_weekend boolean;
  v_clips boolean;
  v_sessions boolean;
  v_post uuid;
  since timestamptz;
  planned uuid[] := '{}';
begin
  for r in
    -- Only time zones Postgres knows (the list is read first, so a bad name can never stop the job).
    with zones as materialized (select z.name from pg_catalog.pg_timezone_names z),
    people as materialized (
      select us.user_id, us.tz, coalesce(us.muted_ids, '{}') || coalesce(us.blocked_ids, '{}') as quiet,
             (p_now at time zone us.tz)::date as today,
             -- The map's own switches: "Friends up for a hit" (a) and "New open hits" (b).
             us.push_map_friends is not false as friends_on, us.push_map_hits is not false as hits_on
        from public.user_state us
        join public.profiles pr on pr.id = us.user_id and pr.suspended_at is null
       where us.tz is not null and us.tz in (select name from zones)
         and us.push_catch_up is not false
         and exists (select 1 from public.push_tokens t where t.user_id = us.user_id)
    )
    select pe.user_id, pe.tz, pe.quiet, pe.today, pe.friends_on, pe.hits_on, pr.location, pr.city_lat, pr.city_lng,
           ls.lat as spot_lat, ls.lng as spot_lng,
           greatest((select max(a.day) from public.app_opens a where a.user_id = pe.user_id),
                    (select (max(t.updated_at) at time zone pe.tz)::date from public.push_tokens t where t.user_id = pe.user_id)) as last_day,
           (select max((n.sent_at at time zone pe.tz)::date) from public.nudges n where n.user_id = pe.user_id and n.kind = 'catch-up') as last_alert
      from people pe
      join public.profiles pr on pr.id = pe.user_id
      left join public.last_seen ls on ls.user_id = pe.user_id
     order by pe.user_id
     limit 5000
  loop
    begin
      -- Away 5 days or more, and 5 days or more since the last of these.
      continue when r.last_day is null or r.today - r.last_day < 5;
      continue when r.last_alert is not null and r.today - r.last_alert < 5;
      continue when r.user_id = any (planned);
      continue when not private.nudge_ok(r.user_id, p_now);
      w := null; l := null;
      here_lat := coalesce(r.city_lat, r.spot_lat);
      here_lng := case when r.city_lat is not null then r.city_lng else r.spot_lng end;
      town := nullif(btrim(split_part(coalesce(r.location, ''), ',', 1)), '');
      -- When they left: the day after their last open, their time.
      since := greatest(((r.last_day + 1)::timestamp at time zone r.tz), p_now - interval '5 days');

      -- a. Friends who follow each other with them, up for a hit today, near them.
      --    The map's rule for "Friends up for a hit": two known adults, or their spot is shown to them.
      --    Not when they turned "Friends up for a hit" off: then b, c or d.
      if here_lat is not null and r.friends_on then
        select count(*), (array_agg(x.nm order by x.until desc))[1:2], (array_agg(x.id order by x.until desc))[1]
          into v_n, v_names, v_first
          from (
            select p.id, split_part(coalesce(nullif(btrim(p.name), ''), p.handle), ' ', 1) as nm, p.open_to_hit_until as until
              from public.follows f
              join public.profiles p on p.id = f.following_id
              join public.last_seen s on s.user_id = p.id
             where f.follower_id = r.user_id
               and p.open_to_hit_until > p_now and p.suspended_at is null
               and public.follow_each_other(r.user_id, p.id)
               and not (p.id::text = any (r.quiet))
               and not public.is_blocked_between(r.user_id, p.id)
               and ((public.known_adult(r.user_id) and public.known_adult(p.id)) or public.spot_shown_to(r.user_id, p.id))
               and public.km_between(here_lat, here_lng, s.lat, s.lng) <= 50
          ) x;
        if v_n = 1 then
          w := v_names[1] || ' is up for a hit today';
          l := '/user/' || v_first;
        elsif v_n = 2 then
          w := v_names[1] || ' and ' || v_names[2] || ' are up for a hit today';
          l := '/map';
        elsif v_n > 2 then
          w := v_names[1] || ' and ' || (v_n - 1) || ' other friends are up for a hit today';
          l := '/map';
        end if;
      end if;

      -- b. Open hits near their town in the next 7 days, by known adults, to known adults only.
      --    Not when they turned "New open hits" off: then c or d.
      if w is null and here_lat is not null and r.hits_on and public.known_adult(r.user_id) then
        select count(distinct h.author_id), coalesce(bool_and(extract(isodow from (h.starts_at at time zone r.tz)) in (6, 7)
                                                            and (h.starts_at at time zone r.tz)::date - r.today <= 7 - extract(isodow from r.today)::int), false)
          into v_n, v_weekend
          from public.hit_requests h
          join public.profiles a on a.id = h.author_id and a.suspended_at is null
          cross join lateral public.hit_point(h.place) hp
         where not h.cancelled and h.starts_at > p_now and h.starts_at < p_now + interval '7 days'
           and coalesce(h.audience, 'everyone') = 'everyone'
           and h.author_id <> r.user_id
           and public.known_adult(h.author_id)
           and not (h.author_id::text = any (r.quiet))
           and not public.is_blocked_between(r.user_id, h.author_id)
           and public.hit_is_open(h.id)
           and hp.p_lat is not null and hp.p_lng is not null
           and public.km_between(here_lat, here_lng, hp.p_lat, hp.p_lng) <= 25;
        if v_n > 0 then
          w := case when v_n = 1 then 'A player near ' || coalesce(town, 'you') || ' is up for a hit'
                    else v_n || ' players near ' || coalesce(town, 'you') || ' are up for a hit' end
               || case when v_weekend then ' this weekend' else ' this week' end;
          l := '/map';
        end if;
      end if;

      -- c. A clip or session posted since they left by friends who follow each other with them.
      if w is null then
        select count(distinct x.author_id), (array_agg(x.nm order by x.created_at desc))[1:2], (array_agg(x.id order by x.created_at desc))[1],
               coalesce(bool_and(x.is_clip), false), coalesce(bool_and(not x.is_clip), false)
          into v_n, v_names, v_post, v_clips, v_sessions
          from (
            select distinct on (p.author_id) p.id, p.author_id, p.created_at,
                   split_part(coalesce(nullif(btrim(a.name), ''), a.handle), ' ', 1) as nm,
                   (p.kind = 'clip' or p.video_url is not null) as is_clip
              from public.follows f
              join public.posts p on p.author_id = f.following_id
              join public.profiles a on a.id = p.author_id and a.suspended_at is null
             where f.follower_id = r.user_id
               and p.created_at > since and p.created_at <= p_now
               and p.removed_at is null and not coalesce(p.archived, false) and p.group_id is null
               and not coalesce(p.auto_held, false)
               and (p.kind = 'clip' or p.video_url is not null or jsonb_typeof(p.session) = 'object')
               and (not coalesce(p.auto_logged, false) or public.auto_log_audience_of(p.author_id, null) in ('mutuals', 'public'))
               and not exists (select 1 from public.post_demotions d where d.post_id = p.id)
               and public.follow_each_other(r.user_id, p.author_id)
               and not (p.author_id::text = any (r.quiet))
               and not public.is_blocked_between(r.user_id, p.author_id)
             order by p.author_id, p.created_at desc
          ) x;
        if v_n = 1 then
          w := v_names[1] || ' posted a new ' || case when v_clips then 'clip' else 'session' end;
        elsif v_n = 2 then
          w := v_names[1] || ' and ' || v_names[2] || ' posted new ' || case when v_clips then 'clips' when v_sessions then 'sessions' else 'clips and sessions' end;
        elsif v_n > 2 then
          w := v_names[1] || ' and ' || (v_n - 1) || ' other friends posted new ' || case when v_clips then 'clips' when v_sessions then 'sessions' else 'clips and sessions' end;
        end if;
        if w is not null then l := '/post/' || v_post; end if;
      end if;

      -- d. Their city moved up the city board this week (196), all time: the board the app shows (211).
      if w is null then
        select bc.name || ' moved up to #' || c.rank || ' on the city board', '/city/' || c.city_id
          into w, l
          from public.city_board_members m
          join public.city_board_cities c on c.month = m.month and c.city_id = m.city_id
          join public.board_cities bc on bc.id = c.city_id
         where m.user_id = r.user_id
           and m.month = date '2000-01-01'
           and c.rank is not null and c.week_ago_rank is not null and c.rank < c.week_ago_rank
         limit 1;
      end if;

      -- Nothing real to say: nothing sent (the next hour looks again).
      continue when w is null;
      if not p_dry_run then
        continue when not private.send_nudge(r.user_id, 'catch-up', to_char(r.today, 'YYYY-MM-DD'), w, l, p_now);
      end if;
      planned := planned || r.user_id;
      who := r.user_id; nudge := 'catch-up'; words := w; link := l;
      return next;
    exception when others then
      raise warning 'catch-up alert for %: %', r.user_id, sqlerrm;
    end;
  end loop;
  return;
end $function$;

-- ------------------------------------------------------------- 4. last check
do $$
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.refresh_city_board()'::regprocedure) <> '2a47b8ab7e8df21ecfaa2c0167b7d13e'
     or (select md5(p.prosrc) from pg_proc p where p.oid = 'public.city_board(date)'::regprocedure) <> 'a38cb62648a6faffeef863c526e80959'
     or (select md5(p.prosrc) from pg_proc p where p.oid = 'public.city_page(text, date)'::regprocedure) <> '4c5148cd8bb584e4b36e25a63da00c86'
     or (select md5(p.prosrc) from pg_proc p where p.oid = 'public.send_catch_up_alerts(timestamptz, boolean)'::regprocedure) <> '2dcb9690a1fcd124be4bb28c7d215e30'
     or (select md5(p.prosrc) from pg_proc p where p.oid = 'private.city_board_all_time_parts(uuid)'::regprocedure) is distinct from '6b1bead2c48eb5dcd732043044cf6c88' then
    raise exception 'Migration 211 stopped: the city board functions did not come out as written. Nothing was changed.';
  end if;
  if (select string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, '-') || '/' || p.prosecdef::text || '/' || coalesce(p.proconfig::text, '-'), '; ' order by p.oid::regprocedure::text)
        from pg_proc p
       where p.oid in ('public.refresh_city_board()'::regprocedure, 'public.city_board(date)'::regprocedure, 'public.city_page(text, date)'::regprocedure,
                       'public.send_catch_up_alerts(timestamptz, boolean)'::regprocedure))
     is distinct from current_setting('courtside.m211_grants', true) then
    raise exception 'Migration 211 stopped: who may call the city board functions would change. Nothing was changed.';
  end if;
  if has_function_privilege('authenticated', 'public.refresh_city_board()', 'execute')
     or has_function_privilege('anon', 'public.refresh_city_board()', 'execute')
     or has_function_privilege('anon', 'public.city_board(date)', 'execute')
     or has_function_privilege('anon', 'public.city_page(text, date)', 'execute')
     or has_function_privilege('authenticated', 'public.send_catch_up_alerts(timestamptz, boolean)', 'execute')
     or has_function_privilege('anon', 'public.send_catch_up_alerts(timestamptz, boolean)', 'execute')
     or has_function_privilege('authenticated', 'private.city_board_all_time_parts(uuid)', 'execute')
     or has_function_privilege('anon', 'private.city_board_all_time_parts(uuid)', 'execute')
     or has_table_privilege('authenticated', 'private.city_board_all_time_base', 'select, insert, update, delete')
     or has_table_privilege('anon', 'private.city_board_all_time_base', 'select, insert, update, delete') then
    raise exception 'Migration 211 stopped: the city board functions can be reached by someone they should not. Nothing was changed.';
  end if;
end $$;

-- Warm: the all-time board is filled now, not 15 minutes from now. (If the job
-- happens to be running this second, this skips and the job fills it.)
select public.refresh_city_board();

commit;

-- ------------------------------------------------------- 5. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
-- (a) The all-time board, every city (expect Raleigh ranked, the rest unranked):
-- select cb.city_id, cb.sessions, cb.players, cb.rank from public.city_board_cities cb
--  where cb.month = '2000-01-01' order by cb.rank nulls last, cb.sessions desc;
-- (b) When it was last worked out:
-- select * from public.city_board_months order by month;
