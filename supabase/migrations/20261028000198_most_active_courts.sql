-- CourtSide · migration 20261028000198: "Most active courts" on a city's page
-- (owner, Oct 28, on his Raleigh page, under Top players: "Under here should
-- be most active courts").
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece, after 196 and
-- 197. All-or-nothing: if a check fails, it stops and nothing at all changes.
-- Safe to run more than once. Undo: supabase/rollback/198_undo.sql.
--
-- What it adds: city_page() gains `active_courts`, up to 5 courts in that
-- city this month, most visits first: { court_id, name, lat, lng, visits }.
-- Courts only: never a person, never a day or a time. Everything else in
-- city_page() (and the old `courts`, Busiest courts, which app builds already
-- out there still read) comes back exactly as 197 gives it.
--
-- The rule.
--   * A visit = one player at one court on one day, counted once however many
--     things they did there that day: a session logged there (the board's
--     rules: tennis, logged within 7 days, at most 2 a day), an open hit they
--     posted there for everyone to see (not cancelled, not friends- or
--     group-only, for a day that has passed), or "I'm playing here" (a
--     check-in).
--   * Whose visits count: adults who may be named on city boards (a birthday
--     on file saying 18+, "Show me on city boards" and activity status on,
--     not suspended) with a PUBLIC account. Teens, anyone with no birthday on
--     file, private accounts and anyone switched off: never, not even as a
--     number (the safest rule; it still lists Raleigh's busiest court).
--   * Which courts: a court with a real name that is not anyone's home (not
--     'private', not named for an apartment, condo, HOA, backyard...) and not
--     just "Tennis courts", in the city its own position falls in. Entries of
--     one club under the same name in one city are one court ("The Raleigh
--     Raquet Club" is two map entries), linked to its busiest entry.
--   * Listed only with 3 or more DIFFERENT players and 2 or more different
--     days this month (one group's one outing is not enough).
--   * Frozen a week at a time, as Busiest courts: worked out once a week
--     (Monday 00:00 UTC) from whole weeks, logged before then. And a court's
--     number only ever goes up by a batch that 3 or more different players
--     added to, on 2 or more days (review, Oct 28): visits logged since its
--     last rise wait, week after week, until 3 different players are among
--     them. So a rise can never be one player's week (a +1 the Monday after
--     one Top player's count rose would otherwise point at them). Once listed,
--     a court's numbers never go down that month (a player switching off,
--     going private or deleting a session never shows as a drop).
--   * "I'm playing here" is still kept for 2 days only (Privacy center): the
--     day after one ends, it is added to that court's day as a number with no
--     one attached (city_board_checkin_tally), and only when that player had
--     no session or hit there that day. The 2-day check-in itself is never
--     kept longer and never copied with who made it.
--
-- New: tables city_board_active_courts, city_board_active_months,
-- city_board_checkin_tally, city_board_checkin_days (RLS on, no policies, no
-- grants: the app can never read them); private.city_board_court_place(courts)
-- and public.refresh_active_courts() (server only); pg_cron job
-- 'courtside-active-courts' at :08 and :38. Replaced: public.city_page()
-- (197's, plus `active_courts`). Not touched: refresh_city_board() and its
-- job, Busiest courts, every grant (checked).

begin;
set local lock_timeout = '5s';

-- ------------------------------------------------------------------ 0. check
do $$
declare
  bad text;
begin
  if to_regprocedure('public.city_page(text, date)') is null
     or to_regprocedure('public.refresh_city_board()') is null
     or to_regprocedure('private.city_board_friends_only(uuid)') is null
     or to_regclass('public.city_board_members') is null
     or to_regclass('public.court_visits') is null
     or to_regclass('public.hit_requests') is null
     or to_regclass('public.courts') is null
     or to_regnamespace('cron') is null
     or not exists (select 1 from cron.job where jobname = 'courtside-city-board') then
    raise exception 'Migration 198 stopped before changing anything: migrations 196 and 197 (city boards) have to run first.';
  end if;
  -- Everything this rests on, exactly as it is live (Oct 28): city_page as 197
  -- wrote it (or as 198 writes it, for a second run) and the helpers it uses.
  select string_agg(w.sig, ', ') into bad
    from (values
      ('public.city_page(text, date)', array['24bc9c0f69ee4dfd8a68583971d6943e', 'e6c05cc304a90e64a76e2c5d1e65e0c7']),
      ('public.refresh_city_board()', array['259f5a95e81c26cf195f32a4b2425a48']),
      ('private.city_board_named(uuid)', array['f1547d915af2533edc46a3982d239eb6']),
      ('private.city_board_friends_only(uuid)', array['31ca5f2c38a20c73d26c64aecd27ccb3']),
      ('private.city_board_city(double precision, double precision, text)', array['82ed5a396448b393054cab11ce1604ea']),
      ('private.city_board_rules()', array['3e6485797c25f924b6fec8cb31f0a2bf']),
      ('private.local_at(uuid, timestamp with time zone)', array['f6d0685d7b680495bea50055dcacc9ad']),
      ('public.note_court_visit()', array['3484c9caac21b034baa06cf46c9475e0']),
      ('public.forget_court_visits()', array['28975d475f1cad8045b90d1693032748']),
      ('public.known_adult(uuid)', array['a79e745befd4374ea124ccf1692145a2'])
    ) as w(sig, md5s)
   where not exists (select 1 from pg_proc p where p.oid = to_regprocedure(w.sig) and md5(p.prosrc) = any (w.md5s));
  if bad is not null then
    raise exception 'Migration 198 stopped before changing anything: % changed since Oct 28. Ask Claude to look.', bad;
  end if;
  -- What this adds: not there yet, or exactly as 198 writes it (a second run).
  if (to_regprocedure('private.city_board_court_place(public.courts)') is not null
      and (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('private.city_board_court_place(public.courts)')) <> 'd4c768e23cac2c9eb22d9cd596358e99')
     or (to_regprocedure('public.refresh_active_courts()') is not null
      and (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.refresh_active_courts()')) <> 'a5b0db12059871312a373ed5fc09ca34') then
    raise exception 'Migration 198 stopped before changing anything: a Most active courts function is already there and different. Ask Claude to look.';
  end if;
  -- The columns read here.
  if (select count(*) from information_schema.columns
       where table_schema = 'public'
         and ((table_name = 'court_visits' and column_name in ('user_id', 'court_id', 'at', 'day'))
           or (table_name = 'hit_requests' and column_name in ('author_id', 'starts_at', 'place', 'cancelled', 'created_at', 'audience'))
           or (table_name = 'practice_sessions' and column_name in ('user_id', 'day', 'kind', 'court_id', 'created_at'))
           or (table_name = 'courts' and column_name in ('id', 'name', 'lat', 'lng', 'access')))) <> 20 then
    raise exception 'Migration 198 stopped before changing anything: a table it reads is not as expected. Ask Claude to look.';
  end if;
  -- The age helper stays server-only (109).
  if has_function_privilege('authenticated', 'public.known_adult(uuid)', 'execute')
     or has_function_privilege('anon', 'public.known_adult(uuid)', 'execute') then
    raise exception 'Migration 198 stopped before changing anything: known_adult can be called from the app. Ask Claude to look.';
  end if;
  -- Who may call the board functions now; checked unchanged at the end.
  perform set_config('courtside.m198_grants', (
    select string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, '-'), '; ' order by p.oid::regprocedure::text)
      from pg_proc p
     where p.oid in ('public.city_page(text, date)'::regprocedure, 'public.city_board(date)'::regprocedure,
                     'public.refresh_city_board()'::regprocedure, 'private.city_board_named(uuid)'::regprocedure)), true);
end $$;

-- ------------------------------------------------------------- 1. the tables
-- The list itself: one row per court (place_key) per month, written only by
-- refresh_active_courts(), numbers that only ever go up within the month.
create table if not exists public.city_board_active_courts (
  month date not null,
  place_key text not null,          -- city id | the court's name, folded ("raleigh-nc|raleigh raquet club")
  city_id text not null references public.board_cities (id) on delete cascade,
  court_id text not null,           -- the map entry a tap opens (the busiest one under that name)
  name text not null,
  lat double precision not null,
  lng double precision not null,
  visits int not null,              -- only ever goes up, by batches of 3+ different players
  players int not null,             -- the most different players in one batch (order only, never shown)
  released_at timestamptz not null, -- the Monday cut of its last rise: visits logged since then wait for the next batch
  primary key (month, place_key)
);
create index if not exists city_board_active_courts_city on public.city_board_active_courts (month, city_id, visits desc);
-- When each month was last worked out (the Monday 00:00 UTC it was cut at).
create table if not exists public.city_board_active_months (
  month date primary key,
  cut timestamptz not null,
  refreshed_at timestamptz not null,
  took_ms int not null
);
-- "I'm playing here", the day after: per court and day, how many counted
-- players checked in there with no session or hit there that day. A number
-- only; who it was is never kept (the check-in itself still goes after 2 days).
create table if not exists public.city_board_checkin_tally (
  day date not null,
  court_id text not null,
  visits int not null,
  primary key (day, court_id)
);
-- Days whose check-ins have been added up (each day once, never again).
create table if not exists public.city_board_checkin_days (
  day date primary key,
  closed_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['city_board_active_courts', 'city_board_active_months', 'city_board_checkin_tally', 'city_board_checkin_days'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ------------------------------------------------------------ 2. the helper
-- A court's key on Most active courts, or null when it may not be listed:
-- its city (its own position) and its name folded ("The Raleigh Raquet Club"
-- and "Raleigh Raquet Club" are one). Null: no city, someone's home
-- ('private', or named for an apartment, condo, HOA, backyard...; Busiest
-- courts' own list), no name, or only "Tennis courts".
create or replace function private.city_board_court_place(c public.courts)
returns text
language plpgsql stable set search_path = public as $$
declare
  n text := lower(btrim(coalesce(c.name, '')));
  k text;
  city text;
begin
  if c.access = 'private' or n = '' or c.lat is null or c.lng is null then return null; end if;
  if n ~* '(apartment|\mapts?\M|condo|townho|residen|estates|villas|\mhoa\M|homeowner|subdivision|backyard|back yard|\mhome\M|\mhouse\M|private|driveway|family|neighbou?rhood|club ?house|swim ?(and|&|n) ?(racquet|tennis)|\mpool\M)' then
    return null;
  end if;
  k := btrim(regexp_replace(regexp_replace(n, '^the\s+', ''), '[^a-z0-9]+', ' ', 'g'));
  if k = '' or k ~ '^(public )?(tennis )?(courts?|tennis|pickleball)( courts?)?( \d+)?$' then return null; end if;
  city := private.city_board_city(c.lat, c.lng, null);
  if city is null then return null; end if;
  return city || '|' || left(k, 120);
end $$;
revoke all on function private.city_board_court_place(public.courts) from public, anon, authenticated;

-- ------------------------------------------------- 3. the job (pg_cron, :08 and :38)
create or replace function public.refresh_active_courts()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_t0 timestamptz := clock_timestamp();
  v_rules record;
  -- Days end everywhere in the US when Honolulu's do: "yesterday" is Honolulu's.
  v_cutoff date := (now() at time zone 'Pacific/Honolulu')::date - 1;
  v_day_cut timestamptz := ((now() at time zone 'Pacific/Honolulu')::date)::timestamp at time zone 'Pacific/Honolulu';
  -- Worked out once a week, from what was logged before this week began.
  v_cut timestamptz := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
  v_cut_day date := (date_trunc('week', now() at time zone 'UTC'))::date;
  v_months date[];
  v_m date;
  v_end date;
  v_d date;
  v_mt timestamptz;
  v_closed int := 0;
  v_out jsonb := '[]'::jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('refresh_active_courts', 198)) then
    return jsonb_build_object('skipped', 'already running');
  end if;
  select * into v_rules from private.city_board_rules();

  -- 1. Yesterday's "I'm playing here", as numbers with no one attached, once
  --    per day, while the 2-day check-ins still hold it (yesterday, and the
  --    day before if a run was missed). Only counted players' (named adults,
  --    public accounts), at listable courts, made before Honolulu's today
  --    began, and only when that player has no session or hit there that day
  --    (those count already).
  foreach v_d in array array[v_cutoff - 1, v_cutoff] loop
    continue when exists (select 1 from public.city_board_checkin_days cd where cd.day = v_d);
    insert into public.city_board_checkin_tally (day, court_id, visits)
    select v.day, v.court_id, count(distinct v.user_id)::int
      from public.court_visits v
      join public.profiles p on p.id = v.user_id and p.suspended_at is null and not p.is_private
      join public.courts ct on ct.id = v.court_id
      cross join lateral (select private.city_board_court_place(ct) as k) x
     where v.day = v_d and v.at < v_day_cut
       and x.k is not null
       and private.city_board_named(v.user_id)
       and not exists (select 1 from public.practice_sessions s join public.courts c2 on c2.id = s.court_id
                        where s.user_id = v.user_id and s.day = v_d and s.kind in ('practice', 'match', 'drills')
                          and private.city_board_court_place(c2) = x.k)
       and not exists (select 1 from public.hit_requests h join public.courts c3 on c3.id = h.place->>'id'
                        where h.author_id = v.user_id and not h.cancelled and h.audience = 'everyone'
                          and h.starts_at >= (v_d - 2)::timestamp at time zone 'UTC' and h.starts_at < (v_d + 3)::timestamp at time zone 'UTC'
                          and private.local_at(h.author_id, h.starts_at)::date = v_d
                          and private.city_board_court_place(c3) = x.k)
     group by v.day, v.court_id
    on conflict (day, court_id) do nothing;
    insert into public.city_board_checkin_days (day) values (v_d) on conflict (day) do nothing;
    v_closed := v_closed + 1;
  end loop;

  -- 2. The list, once a week per month (the board's months: last month for
  --    its first 3 days, this one, and tomorrow's). Each visit belongs to the
  --    week it was first logged in (a session: when it was logged; an open
  --    hit: when its day had passed; a check-in: when its day was added up).
  --    A court's batch is everything logged since its last rise and before
  --    this Monday's cut; it is added only with 3+ different players on 2+
  --    days, else it waits for next week's (never lost, never shown alone).
  v_months := array(select distinct date_trunc('month', x)::date from unnest(array[current_date - 3, current_date, current_date + 1]) as x order by 1);
  foreach v_m in array v_months loop
    continue when (select am.cut from public.city_board_active_months am where am.month = v_m) is not distinct from v_cut;
    v_mt := clock_timestamp();
    v_end := (v_m + interval '1 month')::date;

    with acts as (
      -- Sessions logged at a court (the board's rules), logged before the cut.
      select k.user_id, k.day, k.court_id, k.created_at as logged
        from (
          select s.user_id, s.day, s.court_id, s.created_at,
                 row_number() over (partition by s.user_id, s.day order by s.created_at, s.id) as n
            from public.practice_sessions s
           where s.day >= v_m and s.day < v_end
             and s.kind in ('practice', 'match', 'drills')
             and s.created_at < (s.day + 8)::timestamp at time zone 'UTC'
             and s.day <= (s.created_at at time zone 'UTC')::date + 1
        ) k
       where k.n <= 2 and k.court_id is not null and k.created_at < v_cut
      union all
      -- Open hits for everyone posted at a court, on the day they were for (the
      -- poster's own day), posted and passed before the cut.
      select h.author_id, private.local_at(h.author_id, h.starts_at)::date, h.place->>'id', greatest(h.created_at, h.starts_at)
        from public.hit_requests h
       where not h.cancelled and h.audience = 'everyone' and nullif(h.place->>'id', '') is not null
         and h.created_at < v_cut and h.starts_at < v_cut
         and h.starts_at >= (v_m - 2)::timestamp at time zone 'UTC' and h.starts_at < (v_end + 2)::timestamp at time zone 'UTC'
    ), placed as (
      -- Whole weeks of this month only; counted players only; listable courts only.
      select a.user_id, a.day, x.k, ct.id as court_id, ct.name, ct.lat, ct.lng, a.logged
        from acts a
        join public.profiles p on p.id = a.user_id and p.suspended_at is null and not p.is_private
        join public.courts ct on ct.id = a.court_id
        cross join lateral (select private.city_board_court_place(ct) as k) x
       where a.day >= v_m and a.day < v_end and a.day < v_cut_day
         and x.k is not null
         and private.city_board_named(a.user_id)
    ), visits as (
      -- One a player a day a court, whatever they did there, in the week it was first logged.
      select pl.user_id, pl.day, pl.k, min(pl.logged) as logged from placed pl group by pl.user_id, pl.day, pl.k
    ), batch as (
      -- Since the court's last rise (all of them, before its first).
      select vi.k, count(*)::int as visits, count(distinct vi.user_id)::int as players, count(distinct vi.day)::int as days
        from visits vi
        left join public.city_board_active_courts t on t.month = v_m and t.place_key = vi.k
       where vi.logged >= coalesce(t.released_at, '-infinity'::timestamptz)
       group by vi.k
    ), checkins as (
      -- "I'm playing here" numbers whose day was added up since the court's last rise.
      select x.k, sum(t.visits)::int as visits
        from public.city_board_checkin_tally t
        join public.city_board_checkin_days cd on cd.day = t.day
        join public.courts ct on ct.id = t.court_id
        cross join lateral (select private.city_board_court_place(ct) as k) x
        left join public.city_board_active_courts a on a.month = v_m and a.place_key = x.k
       where t.day >= v_m and t.day < v_end and t.day < v_cut_day and x.k is not null
         and cd.closed_at < v_cut and cd.closed_at >= coalesce(a.released_at, '-infinity'::timestamptz)
       group by x.k
    ), entry as (
      -- The map entry a tap opens: the one with the most visits under that name.
      select distinct on (pl.k) pl.k, pl.court_id, pl.name, pl.lat, pl.lng
        from (select pl.k, pl.court_id, pl.name, pl.lat, pl.lng, count(*) as n
                from placed pl group by pl.k, pl.court_id, pl.name, pl.lat, pl.lng) pl
       order by pl.k, pl.n desc, pl.court_id
    )
    insert into public.city_board_active_courts as t (month, place_key, city_id, court_id, name, lat, lng, visits, players, released_at)
    select v_m, b.k, split_part(b.k, '|', 1), e.court_id, btrim(e.name), e.lat, e.lng,
           b.visits + coalesce(ci.visits, 0), b.players, v_cut
      from batch b
      join entry e on e.k = b.k
      left join checkins ci on ci.k = b.k
     where b.players >= v_rules.court_min_players and b.days >= 2
    on conflict (month, place_key) do update
      set visits = t.visits + excluded.visits,
          players = greatest(t.players, excluded.players),
          released_at = excluded.released_at,
          court_id = excluded.court_id, name = excluded.name, lat = excluded.lat, lng = excluded.lng;

    insert into public.city_board_active_months (month, cut, refreshed_at, took_ms)
    values (v_m, v_cut, clock_timestamp(), (extract(epoch from clock_timestamp() - v_mt) * 1000)::int)
    on conflict (month) do update set cut = excluded.cut, refreshed_at = excluded.refreshed_at, took_ms = excluded.took_ms;

    v_out := v_out || jsonb_build_object('month', v_m,
      'courts', (select count(*) from public.city_board_active_courts where month = v_m));
  end loop;

  -- Keep it small.
  delete from public.city_board_checkin_tally where day < current_date - 70;
  delete from public.city_board_checkin_days where day < current_date - 70;
  delete from public.city_board_active_courts where month < (date_trunc('month', current_date) - interval '13 months')::date;
  delete from public.city_board_active_months where month < (date_trunc('month', current_date) - interval '13 months')::date;

  return jsonb_build_object('months', v_out, 'days_closed', v_closed,
    'took_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int);
end $$;
revoke all on function public.refresh_active_courts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'courtside-active-courts') then
    perform cron.unschedule('courtside-active-courts');
  end if;
  perform cron.schedule('courtside-active-courts', '8,38 * * * *', 'select public.refresh_active_courts()');
end $$;

-- ---------------------------------------------------- 4. city_page(city, month)
-- As 197, plus `active_courts` (courts only). Nothing else in it changes.
create or replace function public.city_page(p_city text, p_month date)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
  cl record;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.flag_on_for('city-board', me) then return jsonb_build_object('off', true); end if;
  if p_month is null or p_month <> date_trunc('month', p_month)::date
     or p_month not in (date_trunc('month', current_date - 3)::date, date_trunc('month', current_date)::date, date_trunc('month', current_date + 1)::date) then
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
  v_member := coalesce(v_me.sessions, 0) > 0;
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
    v_rest_s := v_c.sessions - case when v_member then v_me.sessions else 0 end
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
           order by a.visits desc, a.players desc, a.place_key
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
end $$;
revoke all on function public.city_page(text, date) from public, anon;
grant execute on function public.city_page(text, date) to authenticated;

-- Warm: the list is filled now, not at the next :08 or :38. (If the job
-- happens to be running this second, this skips and the job fills it.)
select public.refresh_active_courts();

-- ------------------------------------------------------------------ 5. check
do $$
declare
  t text;
begin
  foreach t in array array['city_board_active_courts', 'city_board_active_months', 'city_board_checkin_tally', 'city_board_checkin_days'] loop
    if has_table_privilege('authenticated', 'public.' || t, 'select, insert, update, delete')
       or has_table_privilege('anon', 'public.' || t, 'select, insert, update, delete')
       or not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) then
      raise exception 'Migration 198 stopped: % can be reached from the app. Nothing was changed.', t;
    end if;
  end loop;
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.city_page(text, date)'::regprocedure) <> 'e6c05cc304a90e64a76e2c5d1e65e0c7'
     or (select md5(p.prosrc) from pg_proc p where p.oid = 'public.refresh_active_courts()'::regprocedure) <> 'a5b0db12059871312a373ed5fc09ca34'
     or (select md5(p.prosrc) from pg_proc p where p.oid = 'private.city_board_court_place(public.courts)'::regprocedure) <> 'd4c768e23cac2c9eb22d9cd596358e99'
     or (select md5(p.prosrc) from pg_proc p where p.oid = 'public.refresh_city_board()'::regprocedure) <> '259f5a95e81c26cf195f32a4b2425a48'
     or not (select p.prosecdef from pg_proc p where p.oid = 'public.city_page(text, date)'::regprocedure)
     or not (select p.prosecdef from pg_proc p where p.oid = 'public.refresh_active_courts()'::regprocedure)
     or has_function_privilege('authenticated', 'public.refresh_active_courts()', 'execute')
     or has_function_privilege('anon', 'public.refresh_active_courts()', 'execute')
     or has_function_privilege('authenticated', 'private.city_board_court_place(public.courts)', 'execute')
     or has_function_privilege('anon', 'private.city_board_court_place(public.courts)', 'execute')
     or not exists (select 1 from cron.job where jobname = 'courtside-active-courts' and schedule = '8,38 * * * *')
     or not exists (select 1 from cron.job where jobname = 'courtside-city-board' and schedule = '3,18,33,48 * * * *') then
    raise exception 'Migration 198 stopped: the Most active courts functions did not come out as written. Nothing was changed.';
  end if;
  if (select string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, '-'), '; ' order by p.oid::regprocedure::text)
        from pg_proc p
       where p.oid in ('public.city_page(text, date)'::regprocedure, 'public.city_board(date)'::regprocedure,
                       'public.refresh_city_board()'::regprocedure, 'private.city_board_named(uuid)'::regprocedure))
     is distinct from current_setting('courtside.m198_grants', true) then
    raise exception 'Migration 198 stopped: who may call the city board functions would change. Nothing was changed.';
  end if;
  -- 109's rules still hold: nothing reads the stored age directly, and the age helper is only used by server-only code.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public', 'private') and p.proname in ('city_page', 'refresh_active_courts', 'city_board_court_place')
                and p.prosrc ~* 'age_group')
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname in ('public', 'private') and p.prosrc ~* 'known_adult' and not p.prosecdef) then
    raise exception 'Migration 198 stopped: an age rule from 109 would break. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 6. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
-- (a) This month's Most active courts, every city (courts and numbers only):
-- select a.city_id, a.name, a.visits, a.players from public.city_board_active_courts a
--  where a.month = date_trunc('month', current_date)::date order by a.city_id, a.visits desc;
-- (b) The job ran (expect this week's Monday as cut):
-- select * from public.city_board_active_months order by month desc;
-- (c) The app may call the page and not the job (expect true, false):
-- select has_function_privilege('authenticated', 'public.city_page(text, date)', 'execute') as app_page,
--        has_function_privilege('authenticated', 'public.refresh_active_courts()', 'execute') as app_refresh;
