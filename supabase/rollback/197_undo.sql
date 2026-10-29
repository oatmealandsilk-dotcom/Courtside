-- CourtSide · undo for migration 20261028000197_city_board_teen_friends.
--
-- NOT A MIGRATION (it belongs in supabase/rollback/, outside supabase/migrations
-- on purpose). Run it in the Supabase SQL editor as one piece only to take 197
-- back out. All-or-nothing; safe to run more than once.
--
-- It puts city_page() and refresh_city_board() back exactly as 196 wrote them
-- (checked letter for letter at the end), and removes what 197 added: the
-- friends_only column on city_board_members (worked out again by the job, so
-- nothing is lost) and private.city_board_friends_only(). After it, teens are
-- named on city boards to no one again, as under 196; their sessions still
-- count in the totals. Nothing else is touched (no session, post, profile,
-- follow or setting). The app needs no change either way.

begin;
set local lock_timeout = '5s';   -- dropping the column waits at most 5 s for city_board_members

do $$
begin
  if to_regprocedure('public.city_page(text, date)') is null
     or to_regprocedure('public.refresh_city_board()') is null then
    raise exception 'Undo 197 stopped before changing anything: the city boards (196) are not there. Nothing to undo.';
  end if;
  -- Only 197's versions (or 196's already, on a second run) are replaced.
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.city_page(text, date)'::regprocedure)
       not in ('07d764417e3a251e9c955b6e3fc42e31', '24bc9c0f69ee4dfd8a68583971d6943e')
     or (select md5(p.prosrc) from pg_proc p where p.oid = 'public.refresh_city_board()'::regprocedure)
       not in ('6ebe060c9378c7d31c1202b1b4bfc6b7', '259f5a95e81c26cf195f32a4b2425a48') then
    raise exception 'Undo 197 stopped before changing anything: city_page or refresh_city_board changed after 197. Ask Claude to look.';
  end if;
  perform set_config('courtside.u197_grants', (
    select string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, '-'), '; ' order by p.oid::regprocedure::text)
      from pg_proc p
     where p.oid in ('public.city_page(text, date)'::regprocedure, 'public.refresh_city_board()'::regprocedure)), true);
end $$;

-- 196's two functions, exactly as 196 wrote them.
create or replace function public.refresh_city_board()
returns jsonb
language plpgsql security definer set search_path = public as $$
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
begin
  if not pg_try_advisory_xact_lock(hashtextextended('refresh_city_board', 196)) then
    return jsonb_build_object('skipped', 'already running');
  end if;
  select * into v_rules from private.city_board_rules();
  v_months := array(select distinct date_trunc('month', x)::date from unnest(array[current_date - 3, current_date, current_date + 1]) as x order by 1);

  foreach v_m in array v_months loop
    v_mt := clock_timestamp();
    v_end := (v_m + interval '1 month')::date;

    -- 1. Players: counted sessions, by the PROFILE town. Tennis only; logged
    --    within 7 days of the day played and not for a later day; at most 2 a
    --    day; not suspended. Teens, private and switched-off players count here
    --    (totals) and are never named (`named`). `sessions` stops at yesterday
    --    in Hawaii (what others see); `sessions_now` has today (yours only).
    --    A player keeps the city (or no city) of their first counted session
    --    this month; after a town change they still count there, unnamed.
    select coalesce(jsonb_object_agg(mb.user_id::text, mb.city_id), '{}'::jsonb) into v_was
      from public.city_board_members mb where mb.month = v_m;
    delete from public.city_board_members where month = v_m;
    insert into public.city_board_members (month, user_id, city_id, sessions, sessions_now, named)
    select v_m, x.user_id, y.city_id, x.sessions, x.sessions_now,
           y.city_id is not null and y.city_id = x.city_now and private.city_board_named(x.user_id)
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

    -- 2. The words under a filled face, for named players only: "Usually
    --    weekends / evenings / mornings" (6 of their last 10, at least 4 that
    --    say), else the last day they played (never today, at most a week back).
    with tzs as materialized (
      select x.tz as name
        from (select distinct us.tz from public.user_state us
                join public.city_board_members mb on mb.month = v_m and mb.user_id = us.user_id and mb.named
               where us.tz is not null) x
       where private.safe_tz(x.tz) is not null
    ), recent as (
      select s.user_id, s.day, s.created_at, s.activity_id,
             row_number() over (partition by s.user_id order by s.day desc, s.created_at desc, s.id) as n
        from public.practice_sessions s
        join public.city_board_members mb on mb.month = v_m and mb.user_id = s.user_id and mb.named
       where s.kind in ('practice', 'match', 'drills')
         and s.day <= v_cutoff and s.day > v_cutoff - 90
         and s.created_at < v_day_cut
         and s.created_at < (s.day + 8)::timestamp at time zone 'UTC'
    ), ten as (
      select r.user_id, r.day, extract(isodow from r.day) >= 6 as weekend,
             -- The hour it started: a tracker's own start in its own offset; else
             -- when it was logged, in the player's time zone, if logged that same day.
             coalesce(extract(hour from (a.started_at at time zone 'UTC') + make_interval(mins => a.tz_offset_min))::int,
                      case when z.name is not null and (r.created_at at time zone z.name)::date = r.day
                           then extract(hour from r.created_at at time zone z.name)::int end) as hour
        from recent r
        left join public.detected_activities a on a.id = r.activity_id and a.tz_offset_min is not null
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

  -- Keep it small.
  delete from public.city_board_daily where day < current_date - 70;
  delete from public.city_board_events where at < now() - interval '14 days';
  delete from public.city_board_members where month < (date_trunc('month', current_date) - interval '13 months')::date;
  delete from public.city_board_cities where month < (date_trunc('month', current_date) - interval '13 months')::date;
  delete from public.city_board_courts where month < (date_trunc('month', current_date) - interval '13 months')::date;
  delete from public.city_board_court_weeks where month < (date_trunc('month', current_date) - interval '13 months')::date;
  delete from public.city_board_clips where month < (date_trunc('month', current_date) - interval '13 months')::date;
  delete from public.city_board_months where month < (date_trunc('month', current_date) - interval '13 months')::date;

  return jsonb_build_object('months', v_out, 'events', v_events,
    'took_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int);
end $$;
revoke all on function public.refresh_city_board() from public, anon, authenticated;

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
  v_clip jsonb;
  v_city jsonb;
  v_me_json jsonb;
  v_rest_n int;
  v_rest_s int;
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

  -- Everyone who may be named to you here, most sessions (as of yesterday) first.
  select coalesce(array_agg(x.user_id order by x.sessions desc, x.last_day desc nulls last, x.user_id), '{}') into v_cands
    from (select mb.user_id, mb.sessions, mb.last_day
            from public.city_board_members mb
           where mb.month = p_month and mb.city_id = p_city and mb.named and mb.sessions > 0 and mb.user_id <> me
             and not (mb.user_id::text = any (v_muted))
           order by mb.sessions desc, mb.last_day desc nulls last, mb.user_id
           limit 200) x
   where private.city_board_named(x.user_id)                 -- still adult, switch on, activity on, not suspended
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
                           where p.open_to_hit_until > now() and not (u.x = any (v_up)) order by u.o);
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
    'up', to_jsonb(v_up), 'courts', v_courts, 'clip', v_clip);
end $$;
revoke all on function public.city_page(text, date) from public, anon;
grant execute on function public.city_page(text, date) to authenticated;

drop function if exists private.city_board_friends_only(uuid);
alter table public.city_board_members drop column if exists friends_only;   -- its one-tier check goes with it

-- Warm: the boards are worked out by 196's rules now, not 15 minutes from now.
select public.refresh_city_board();

do $$
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.city_page(text, date)'::regprocedure) <> '07d764417e3a251e9c955b6e3fc42e31'
     or (select md5(p.prosrc) from pg_proc p where p.oid = 'public.refresh_city_board()'::regprocedure) <> '6ebe060c9378c7d31c1202b1b4bfc6b7'
     or to_regprocedure('private.city_board_friends_only(uuid)') is not null
     or exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'city_board_members' and column_name = 'friends_only')
     or exists (select 1 from pg_constraint where conname = 'city_board_members_one_tier')
     or (select string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, '-'), '; ' order by p.oid::regprocedure::text)
           from pg_proc p
          where p.oid in ('public.city_page(text, date)'::regprocedure, 'public.refresh_city_board()'::regprocedure))
        is distinct from current_setting('courtside.u197_grants', true) then
    raise exception 'Undo 197 stopped: 196 did not come back exactly. Nothing was changed.';
  end if;
end $$;

commit;
