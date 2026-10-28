-- CourtSide · migration 20261028000196: city boards ("New rank city sessions
-- is good", owner, Oct 28), the server half.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. All-or-nothing:
-- if a check fails, it stops and nothing at all changes. Safe to run more
-- than once. Undo: supabase/rollback/196_undo.sql.
-- Number: 192 is free everywhere; 193 (auto_log_mutuals, branch), 194
-- (review_accounts_ready, scratch) and 195 (blocked_chats_hidden, main, live)
-- are taken, so this is 196.
--
-- What it adds (nothing changes for anyone until the flag is on for them):
--   * board_cities + board_city_places: the only places that can ever have a
--     row. US metro areas (Census metro list, each by its main city) with
--     their other principal cities and best-known suburbs as extra places, so
--     Fort Worth folds into Dallas–Fort Worth and Cary into Raleigh. No
--     typed-in town name can ever show on a board.
--   * city_board_* tables (eight), filled only by refresh_city_board() (pg_cron,
--     :03/:18/:33/:48), read only through city_board() and city_page().
--     RLS on with no policies and no grants: the app can never read them.
--   * user_state.city_boards ("Show me on city boards", default on).
--   * flag:city-board = 'admins' (the King of the Court pattern).
--
-- Which city a player counts for: the town on their PROFILE only (never GPS,
-- never where a session was logged, never a court). A town picked from the
-- search: the nearest board place within 30 miles (48.28 km, the app's
-- IN_TOWN_MILES). A typed town: the town name AND its US state must match a
-- board place ("Cary, NC", "Cary, North Carolina", "Cary NC"); no state, no
-- city. A city needs 5 players with a counted session that month before it
-- gets a row (city_board_rules().min_players).
--
-- Who is ever named (on Top players, the Up to hit fill, the clip): a known
-- adult (a birthday on file saying 18+), with "Show me on city boards" on and
-- activity status on, not suspended. Teens and anyone with no birthday on
-- file: never, to anyone, not even mutual friends (board lists are made to be
-- screenshotted; a teen's name + town + routine is exactly what to keep off).
-- Everyone counted is still in their city's totals. Per viewer, on top:
-- never yourself (your row comes separately), never anyone blocked either
-- way or muted by you, a private account only once you follow it, a teen
-- viewer sees friends who follow each other only, and an adult viewer's
-- strangers cost the day's age-check allowance (109), as on King of the Court.
-- Top players names at most players - 2 (- 1 more when you are in the city
-- yourself), and fewer still when the rest's total would say every one of
-- them has exactly 1, so nobody's own number can be worked out from the
-- total. Your own place is among the rows you are shown, never among people
-- you are not shown.
-- As of yesterday: every number anyone else sees (city totals, players,
-- Top players, the order of faces, news, movement) counts only days up to
-- yesterday in Hawaii, logged before today began there, so what others see
-- changes once a day (10:00 UTC) and never because someone played or logged
-- today. Only your own row is up to the minute (city_board().me /
-- city_page().me: `sessions` with today, `in_total` what your city holds).
-- A month's city sticks: your sessions count for the city on your profile at
-- your first counted session of the month; after a move they stay there,
-- unnamed, so a town change never shifts one person's month between totals.
-- Busiest courts: courts only, worked out once a week (Monday 00:00 UTC)
-- from what was logged before it, a park-week counted only with 3+ different
-- players on 2+ different days, only named courts that are not someone's
-- home, and only sessions by adults who may be named, with public accounts
-- (teens, private accounts and anyone switched off never feed a court).
-- Clip of the month: a post guest mode would show (164's guest_post_ok:
-- public adult author, everyone tagged an adult, not removed, archived,
-- group-only or pushed to the bottom), a video, posted that month, by a named
-- adult, carrying no court and no typed place, and everyone tagged on it may
-- be named too; for you, never one tagging someone blocked either way.

begin;
set local lock_timeout = '5s';   -- the "Show me" column below waits at most 5 s for user_state, never stalls the app

-- ------------------------------------------------------------------ 0. check
do $$
declare
  bad text;
begin
  if to_regprocedure('public.km_between(double precision, double precision, double precision, double precision)') is null
     or to_regprocedure('public.follow_each_other(uuid, uuid)') is null
     or to_regprocedure('public.is_blocked_between(uuid, uuid)') is null
     or to_regprocedure('public.known_adult(uuid)') is null
     or to_regprocedure('public.can_view(uuid)') is null
     or to_regprocedure('public.age_rule_budget(uuid[])') is null
     or to_regprocedure('public.flag_on_for(text, uuid)') is null
     or to_regprocedure('public.players_in_town()') is null
     or to_regprocedure('public.share_open(uuid)') is null
     or to_regprocedure('private.guest_post_ok(public.posts)') is null
     or to_regclass('public.post_demotions') is null
     or to_regclass('public.server_settings') is null
     or to_regnamespace('private') is null
     or to_regnamespace('cron') is null
     or (select count(*) from information_schema.columns where table_schema = 'public' and (table_name, column_name) in
          (('practice_sessions', 'court_id'), ('practice_sessions', 'activity_id'), ('detected_activities', 'tz_offset_min'),
           ('user_state', 'tz'), ('user_state', 'show_activity'), ('user_state', 'muted_ids'), ('profiles', 'city_lat'),
           ('profiles', 'suspended_at'), ('profiles', 'open_to_hit_until'), ('posts', 'removed_at'), ('posts', 'group_id'),
           ('courts', 'access'))) <> 12 then
    raise exception 'Migration 196 stopped before changing anything: migrations 58, 108, 109, 130, 152, 164, 190 and 191 have to run first.';
  end if;
  -- The helpers the boards' privacy rests on, exactly as they are live (Oct 28).
  -- If one changed, what a board shows may change with it: look before running.
  select string_agg(w.sig, ', ') into bad
    from (values
      ('public.can_view(uuid)', 'bc84d0d3557df1b7eea9bfd353bcc9a2'),
      ('public.is_blocked_between(uuid, uuid)', 'f7246d0dbae4888d3a96a1d317c9de5f'),
      ('public.follow_each_other(uuid, uuid)', '1bc1148421d20a5927824dc7ef3ad967'),
      ('public.known_adult(uuid)', 'a79e745befd4374ea124ccf1692145a2'),
      ('public.age_rule_budget(uuid[])', '9f020e0237d8c5e61e913cbc6d5f6923'),
      ('public.flag_on_for(text, uuid)', 'c6b2562859282d7fbda907465cd70ba4'),
      ('public.km_between(double precision, double precision, double precision, double precision)', 'ffcfba4f6d252f977c21a0ee02f0cbd7'),
      ('public.players_in_town()', '44acd9501c759a6f6ba3478131f2deae'),
      ('public.share_open(uuid)', '4b238dfbfac4f00409d2bf793120f186'),
      ('private.guest_post_ok(public.posts)', '713ead48f9af3fd2abd49619fd382781')
    ) as w(sig, md5)
   where not exists (select 1 from pg_proc p where p.oid = to_regprocedure(w.sig) and md5(p.prosrc) = w.md5);
  if bad is not null then
    raise exception 'Migration 196 stopped before changing anything: % changed since Oct 28. Ask Claude to look.', bad;
  end if;
  -- The age helper stays server-only (109).
  if has_function_privilege('authenticated', 'public.known_adult(uuid)', 'execute')
     or has_function_privilege('anon', 'public.known_adult(uuid)', 'execute') then
    raise exception 'Migration 196 stopped before changing anything: known_adult can be called from the app. Ask Claude to look.';
  end if;
end $$;

-- --------------------------------------------------------- 1. the board's places
create table if not exists public.board_cities (
  id text primary key check (id ~ '^[a-z0-9-]{2,60}$'),
  name text not null,
  region text not null,
  country text not null default 'US'
);
-- Where a city is: its main city and its other principal cities / suburbs.
-- `place` is the lower-case town name, `region` the 2-letter US state.
create table if not exists public.board_city_places (
  place text not null,
  region text not null,
  city_id text not null references public.board_cities (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  primary key (place, region)
);
create index if not exists board_city_places_lat on public.board_city_places (lat, lng);

-- ----------------------------------------------------- 2. what the job works out
create table if not exists public.city_board_months (
  month date primary key check (month = date_trunc('month', month)::date),
  refreshed_at timestamptz not null default now(),
  took_ms int,
  courts_cut timestamptz            -- Busiest courts were last worked out for this week start (Monday 00:00 UTC)
);
-- One row per player with a counted session that month. `city_id`: the city
-- their sessions count for this month (null: none), fixed at their first
-- counted session of the month, so changing the town on a profile never
-- moves a month of sessions from one city's total to another's at once (one
-- jump the size of one person's month is that person's number). `sessions`:
-- counted days up to yesterday in Hawaii, the only number anyone else ever
-- sees or that goes into a city's totals; `sessions_now`: with today too, for
-- the player's own row only. `named`: may ever be named to anyone else
-- (adult, switch on, activity on, not suspended, and still in that city).
create table if not exists public.city_board_members (
  month date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  city_id text references public.board_cities (id) on delete cascade,
  sessions int not null check (sessions >= 0),
  sessions_now int not null check (sessions_now > 0),
  last_day date,
  habit text check (habit in ('weekends', 'evenings', 'mornings')),
  named boolean not null default false,
  primary key (month, user_id)
);
create index if not exists city_board_members_city on public.city_board_members (month, city_id, sessions desc);
create table if not exists public.city_board_cities (
  month date not null,
  city_id text not null references public.board_cities (id) on delete cascade,
  sessions int not null,
  players int not null,
  rank int,                       -- null: not ranked (fewer than min_players)
  per_value numeric(7, 1) not null,
  per_rank int,
  week_ago_rank int,
  run int not null default 0,
  primary key (month, city_id)
);
-- One snapshot a day (movement and runs), kept 70 days.
create table if not exists public.city_board_daily (
  month date not null,
  day date not null,
  city_id text not null references public.board_cities (id) on delete cascade,
  rank int,
  sessions int not null,
  players int not null,
  primary key (month, day, city_id)
);
-- "Austin passed Los Angeles", kept 14 days.
create table if not exists public.city_board_events (
  id bigint generated always as identity primary key,
  month date not null,
  at timestamptz not null,
  city_id text not null references public.board_cities (id) on delete cascade,
  passed_id text not null references public.board_cities (id) on delete cascade
);
create index if not exists city_board_events_month on public.city_board_events (month, at desc);
-- Busiest courts: parks (the app's ~250 m fold), courts only, top 3 per city.
create table if not exists public.city_board_courts (
  month date not null,
  city_id text not null references public.board_cities (id) on delete cascade,
  park_key text not null,
  court_id text not null,
  name text,
  courts int not null,
  sessions int not null,
  players int not null,
  primary key (month, city_id, park_key)
);
-- The park-weeks Busiest courts adds up: each written once, the Monday after
-- its week, and never changed or taken back after (a court's number only grows).
create table if not exists public.city_board_court_weeks (
  month date not null,
  wk date not null,                -- the Monday the week began
  park_key text not null,
  city_id text not null references public.board_cities (id) on delete cascade,
  court_id text not null,
  name text,
  courts int not null,
  sessions int not null,
  players int not null,
  primary key (month, wk, park_key)
);
-- Clip of the month: the top 3 candidates per city (one per author), so a
-- viewer who blocked the first still gets one.
create table if not exists public.city_board_clips (
  month date not null,
  city_id text not null references public.board_cities (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  views int not null,
  place smallint not null,
  primary key (month, city_id, post_id)
);

do $$
declare
  t text;
begin
  foreach t in array array['board_cities', 'board_city_places', 'city_board_months', 'city_board_members', 'city_board_cities',
                           'city_board_daily', 'city_board_events', 'city_board_courts', 'city_board_court_weeks', 'city_board_clips'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
  execute 'revoke all on sequence public.city_board_events_id_seq from public, anon, authenticated';
end $$;

-- ------------------------------------------------- 3. the places (seeded once)
insert into public.board_cities (id, name, region, country) values
  ('new-york-ny', 'New York', 'NY', 'US'),
  ('los-angeles-ca', 'Los Angeles', 'CA', 'US'),
  ('chicago-il', 'Chicago', 'IL', 'US'),
  ('dallas-tx', 'Dallas–Fort Worth', 'TX', 'US'),
  ('houston-tx', 'Houston', 'TX', 'US'),
  ('washington-dc', 'Washington', 'DC', 'US'),
  ('philadelphia-pa', 'Philadelphia', 'PA', 'US'),
  ('miami-fl', 'Miami', 'FL', 'US'),
  ('atlanta-ga', 'Atlanta', 'GA', 'US'),
  ('boston-ma', 'Boston', 'MA', 'US'),
  ('phoenix-az', 'Phoenix', 'AZ', 'US'),
  ('san-francisco-ca', 'San Francisco', 'CA', 'US'),
  ('riverside-ca', 'Riverside', 'CA', 'US'),
  ('detroit-mi', 'Detroit', 'MI', 'US'),
  ('seattle-wa', 'Seattle', 'WA', 'US'),
  ('minneapolis-mn', 'Minneapolis–St. Paul', 'MN', 'US'),
  ('san-diego-ca', 'San Diego', 'CA', 'US'),
  ('tampa-fl', 'Tampa', 'FL', 'US'),
  ('denver-co', 'Denver', 'CO', 'US'),
  ('baltimore-md', 'Baltimore', 'MD', 'US'),
  ('st-louis-mo', 'St. Louis', 'MO', 'US'),
  ('orlando-fl', 'Orlando', 'FL', 'US'),
  ('charlotte-nc', 'Charlotte', 'NC', 'US'),
  ('san-antonio-tx', 'San Antonio', 'TX', 'US'),
  ('portland-or', 'Portland', 'OR', 'US'),
  ('sacramento-ca', 'Sacramento', 'CA', 'US'),
  ('pittsburgh-pa', 'Pittsburgh', 'PA', 'US'),
  ('austin-tx', 'Austin', 'TX', 'US'),
  ('las-vegas-nv', 'Las Vegas', 'NV', 'US'),
  ('cincinnati-oh', 'Cincinnati', 'OH', 'US'),
  ('kansas-city-mo', 'Kansas City', 'MO', 'US'),
  ('columbus-oh', 'Columbus', 'OH', 'US'),
  ('indianapolis-in', 'Indianapolis', 'IN', 'US'),
  ('cleveland-oh', 'Cleveland', 'OH', 'US'),
  ('san-jose-ca', 'San Jose', 'CA', 'US'),
  ('nashville-tn', 'Nashville', 'TN', 'US'),
  ('virginia-beach-va', 'Virginia Beach', 'VA', 'US'),
  ('providence-ri', 'Providence', 'RI', 'US'),
  ('jacksonville-fl', 'Jacksonville', 'FL', 'US'),
  ('milwaukee-wi', 'Milwaukee', 'WI', 'US'),
  ('raleigh-nc', 'Raleigh', 'NC', 'US'),
  ('oklahoma-city-ok', 'Oklahoma City', 'OK', 'US'),
  ('memphis-tn', 'Memphis', 'TN', 'US'),
  ('richmond-va', 'Richmond', 'VA', 'US'),
  ('louisville-ky', 'Louisville', 'KY', 'US'),
  ('new-orleans-la', 'New Orleans', 'LA', 'US'),
  ('salt-lake-city-ut', 'Salt Lake City', 'UT', 'US'),
  ('hartford-ct', 'Hartford', 'CT', 'US'),
  ('buffalo-ny', 'Buffalo', 'NY', 'US'),
  ('birmingham-al', 'Birmingham', 'AL', 'US'),
  ('rochester-ny', 'Rochester', 'NY', 'US'),
  ('grand-rapids-mi', 'Grand Rapids', 'MI', 'US'),
  ('tucson-az', 'Tucson', 'AZ', 'US'),
  ('honolulu-hi', 'Honolulu', 'HI', 'US'),
  ('tulsa-ok', 'Tulsa', 'OK', 'US'),
  ('fresno-ca', 'Fresno', 'CA', 'US'),
  ('worcester-ma', 'Worcester', 'MA', 'US'),
  ('omaha-ne', 'Omaha', 'NE', 'US'),
  ('bridgeport-ct', 'Bridgeport–Stamford', 'CT', 'US'),
  ('greenville-sc', 'Greenville', 'SC', 'US'),
  ('albuquerque-nm', 'Albuquerque', 'NM', 'US'),
  ('bakersfield-ca', 'Bakersfield', 'CA', 'US'),
  ('albany-ny', 'Albany', 'NY', 'US'),
  ('knoxville-tn', 'Knoxville', 'TN', 'US'),
  ('el-paso-tx', 'El Paso', 'TX', 'US'),
  ('baton-rouge-la', 'Baton Rouge', 'LA', 'US'),
  ('mcallen-tx', 'McAllen', 'TX', 'US'),
  ('new-haven-ct', 'New Haven', 'CT', 'US'),
  ('allentown-pa', 'Allentown', 'PA', 'US'),
  ('oxnard-ca', 'Oxnard–Ventura', 'CA', 'US'),
  ('columbia-sc', 'Columbia', 'SC', 'US'),
  ('sarasota-fl', 'Sarasota', 'FL', 'US'),
  ('dayton-oh', 'Dayton', 'OH', 'US'),
  ('charleston-sc', 'Charleston', 'SC', 'US'),
  ('greensboro-nc', 'Greensboro', 'NC', 'US'),
  ('stockton-ca', 'Stockton', 'CA', 'US'),
  ('cape-coral-fl', 'Cape Coral–Fort Myers', 'FL', 'US'),
  ('boise-id', 'Boise', 'ID', 'US'),
  ('colorado-springs-co', 'Colorado Springs', 'CO', 'US'),
  ('little-rock-ar', 'Little Rock', 'AR', 'US'),
  ('lakeland-fl', 'Lakeland', 'FL', 'US'),
  ('akron-oh', 'Akron', 'OH', 'US'),
  ('des-moines-ia', 'Des Moines', 'IA', 'US'),
  ('springfield-ma', 'Springfield', 'MA', 'US'),
  ('ogden-ut', 'Ogden', 'UT', 'US'),
  ('madison-wi', 'Madison', 'WI', 'US'),
  ('winston-salem-nc', 'Winston-Salem', 'NC', 'US'),
  ('daytona-beach-fl', 'Daytona Beach', 'FL', 'US'),
  ('syracuse-ny', 'Syracuse', 'NY', 'US'),
  ('provo-ut', 'Provo', 'UT', 'US'),
  ('toledo-oh', 'Toledo', 'OH', 'US'),
  ('wichita-ks', 'Wichita', 'KS', 'US'),
  ('durham-nc', 'Durham–Chapel Hill', 'NC', 'US'),
  ('augusta-ga', 'Augusta', 'GA', 'US'),
  ('palm-bay-fl', 'Palm Bay–Melbourne', 'FL', 'US'),
  ('jackson-ms', 'Jackson', 'MS', 'US'),
  ('harrisburg-pa', 'Harrisburg', 'PA', 'US'),
  ('spokane-wa', 'Spokane', 'WA', 'US'),
  ('scranton-pa', 'Scranton', 'PA', 'US'),
  ('chattanooga-tn', 'Chattanooga', 'TN', 'US'),
  ('lancaster-pa', 'Lancaster', 'PA', 'US'),
  ('modesto-ca', 'Modesto', 'CA', 'US'),
  ('portland-me', 'Portland', 'ME', 'US'),
  ('fayetteville-ar', 'Fayetteville', 'AR', 'US'),
  ('lexington-ky', 'Lexington', 'KY', 'US'),
  ('fayetteville-nc', 'Fayetteville', 'NC', 'US'),
  ('pensacola-fl', 'Pensacola', 'FL', 'US'),
  ('lansing-mi', 'Lansing', 'MI', 'US'),
  ('huntsville-al', 'Huntsville', 'AL', 'US'),
  ('santa-rosa-ca', 'Santa Rosa', 'CA', 'US'),
  ('myrtle-beach-sc', 'Myrtle Beach', 'SC', 'US'),
  ('port-st-lucie-fl', 'Port St. Lucie', 'FL', 'US'),
  ('reno-nv', 'Reno', 'NV', 'US'),
  ('asheville-nc', 'Asheville', 'NC', 'US'),
  ('ann-arbor-mi', 'Ann Arbor', 'MI', 'US'),
  ('wilmington-nc', 'Wilmington', 'NC', 'US'),
  ('savannah-ga', 'Savannah', 'GA', 'US'),
  ('naples-fl', 'Naples', 'FL', 'US'),
  ('tallahassee-fl', 'Tallahassee', 'FL', 'US'),
  ('corpus-christi-tx', 'Corpus Christi', 'TX', 'US'),
  ('anchorage-ak', 'Anchorage', 'AK', 'US'),
  ('fort-wayne-in', 'Fort Wayne', 'IN', 'US'),
  ('boulder-co', 'Boulder', 'CO', 'US'),
  ('gainesville-fl', 'Gainesville', 'FL', 'US'),
  ('santa-barbara-ca', 'Santa Barbara', 'CA', 'US'),
  ('hilton-head-sc', 'Hilton Head', 'SC', 'US'),
  ('tyler-tx', 'Tyler', 'TX', 'US'),
  ('athens-ga', 'Athens', 'GA', 'US'),
  ('charlottesville-va', 'Charlottesville', 'VA', 'US'),
  ('montgomery-al', 'Montgomery', 'AL', 'US'),
  ('manchester-nh', 'Manchester', 'NH', 'US'),
  ('burlington-vt', 'Burlington', 'VT', 'US'),
  ('charleston-wv', 'Charleston', 'WV', 'US'),
  ('lincoln-ne', 'Lincoln', 'NE', 'US'),
  ('sioux-falls-sd', 'Sioux Falls', 'SD', 'US'),
  ('fargo-nd', 'Fargo', 'ND', 'US'),
  ('billings-mt', 'Billings', 'MT', 'US'),
  ('springfield-mo', 'Springfield', 'MO', 'US'),
  ('columbia-mo', 'Columbia', 'MO', 'US'),
  ('peoria-il', 'Peoria', 'IL', 'US'),
  ('champaign-il', 'Champaign', 'IL', 'US'),
  ('bloomington-in', 'Bloomington', 'IN', 'US'),
  ('south-bend-in', 'South Bend', 'IN', 'US'),
  ('evansville-in', 'Evansville', 'IN', 'US'),
  ('kalamazoo-mi', 'Kalamazoo', 'MI', 'US'),
  ('flint-mi', 'Flint', 'MI', 'US'),
  ('rockford-il', 'Rockford', 'IL', 'US'),
  ('green-bay-wi', 'Green Bay', 'WI', 'US'),
  ('cedar-rapids-ia', 'Cedar Rapids', 'IA', 'US'),
  ('davenport-ia', 'Davenport', 'IA', 'US'),
  ('shreveport-la', 'Shreveport', 'LA', 'US'),
  ('lafayette-la', 'Lafayette', 'LA', 'US'),
  ('mobile-al', 'Mobile', 'AL', 'US'),
  ('beaumont-tx', 'Beaumont', 'TX', 'US'),
  ('killeen-tx', 'Killeen', 'TX', 'US'),
  ('waco-tx', 'Waco', 'TX', 'US'),
  ('lubbock-tx', 'Lubbock', 'TX', 'US'),
  ('amarillo-tx', 'Amarillo', 'TX', 'US'),
  ('brownsville-tx', 'Brownsville', 'TX', 'US'),
  ('laredo-tx', 'Laredo', 'TX', 'US'),
  ('college-station-tx', 'College Station', 'TX', 'US'),
  ('midland-tx', 'Midland', 'TX', 'US'),
  ('salem-or', 'Salem', 'OR', 'US'),
  ('eugene-or', 'Eugene', 'OR', 'US'),
  ('bend-or', 'Bend', 'OR', 'US'),
  ('olympia-wa', 'Olympia', 'WA', 'US'),
  ('kennewick-wa', 'Kennewick', 'WA', 'US'),
  ('visalia-ca', 'Visalia', 'CA', 'US'),
  ('salinas-ca', 'Salinas', 'CA', 'US'),
  ('san-luis-obispo-ca', 'San Luis Obispo', 'CA', 'US'),
  ('santa-cruz-ca', 'Santa Cruz', 'CA', 'US'),
  ('redding-ca', 'Redding', 'CA', 'US'),
  ('chico-ca', 'Chico', 'CA', 'US'),
  ('yuma-az', 'Yuma', 'AZ', 'US'),
  ('prescott-az', 'Prescott', 'AZ', 'US'),
  ('flagstaff-az', 'Flagstaff', 'AZ', 'US'),
  ('las-cruces-nm', 'Las Cruces', 'NM', 'US'),
  ('santa-fe-nm', 'Santa Fe', 'NM', 'US'),
  ('st-george-ut', 'St. George', 'UT', 'US'),
  ('fort-collins-co', 'Fort Collins', 'CO', 'US'),
  ('greeley-co', 'Greeley', 'CO', 'US'),
  ('pueblo-co', 'Pueblo', 'CO', 'US'),
  ('topeka-ks', 'Topeka', 'KS', 'US'),
  ('lawrence-ks', 'Lawrence', 'KS', 'US'),
  ('portsmouth-nh', 'Portsmouth', 'NH', 'US'),
  ('trenton-nj', 'Trenton', 'NJ', 'US'),
  ('atlantic-city-nj', 'Atlantic City', 'NJ', 'US'),
  ('salisbury-md', 'Salisbury', 'MD', 'US'),
  ('hagerstown-md', 'Hagerstown', 'MD', 'US'),
  ('reading-pa', 'Reading', 'PA', 'US'),
  ('york-pa', 'York', 'PA', 'US'),
  ('state-college-pa', 'State College', 'PA', 'US'),
  ('erie-pa', 'Erie', 'PA', 'US'),
  ('utica-ny', 'Utica', 'NY', 'US'),
  ('binghamton-ny', 'Binghamton', 'NY', 'US'),
  ('ithaca-ny', 'Ithaca', 'NY', 'US'),
  ('poughkeepsie-ny', 'Poughkeepsie', 'NY', 'US'),
  ('kingsport-tn', 'Kingsport–Johnson City', 'TN', 'US'),
  ('clarksville-tn', 'Clarksville', 'TN', 'US'),
  ('roanoke-va', 'Roanoke', 'VA', 'US'),
  ('lynchburg-va', 'Lynchburg', 'VA', 'US'),
  ('greenville-nc', 'Greenville', 'NC', 'US'),
  ('hickory-nc', 'Hickory', 'NC', 'US'),
  ('spartanburg-sc', 'Spartanburg', 'SC', 'US'),
  ('macon-ga', 'Macon', 'GA', 'US'),
  ('columbus-ga', 'Columbus', 'GA', 'US'),
  ('tuscaloosa-al', 'Tuscaloosa', 'AL', 'US'),
  ('gulfport-ms', 'Gulfport', 'MS', 'US'),
  ('ocala-fl', 'Ocala', 'FL', 'US'),
  ('panama-city-fl', 'Panama City', 'FL', 'US'),
  ('vero-beach-fl', 'Vero Beach', 'FL', 'US'),
  ('punta-gorda-fl', 'Punta Gorda', 'FL', 'US'),
  ('key-west-fl', 'Key West', 'FL', 'US'),
  ('kahului-hi', 'Maui', 'HI', 'US')
on conflict (id) do update set name = excluded.name, region = excluded.region, country = excluded.country;

insert into public.board_city_places (city_id, place, region, lat, lng) values
  ('new-york-ny', 'new york', 'NY', 40.71, -74.01),
  ('new-york-ny', 'manhattan', 'NY', 40.78, -73.97),
  ('new-york-ny', 'brooklyn', 'NY', 40.68, -73.94),
  ('new-york-ny', 'queens', 'NY', 40.73, -73.79),
  ('new-york-ny', 'bronx', 'NY', 40.84, -73.86),
  ('new-york-ny', 'the bronx', 'NY', 40.84, -73.86),
  ('new-york-ny', 'staten island', 'NY', 40.58, -74.15),
  ('new-york-ny', 'yonkers', 'NY', 40.93, -73.90),
  ('new-york-ny', 'white plains', 'NY', 41.03, -73.76),
  ('new-york-ny', 'hempstead', 'NY', 40.71, -73.62),
  ('new-york-ny', 'huntington', 'NY', 40.87, -73.43),
  ('new-york-ny', 'newark', 'NJ', 40.74, -74.17),
  ('new-york-ny', 'jersey city', 'NJ', 40.73, -74.08),
  ('new-york-ny', 'hoboken', 'NJ', 40.74, -74.03),
  ('new-york-ny', 'paterson', 'NJ', 40.92, -74.17),
  ('new-york-ny', 'edison', 'NJ', 40.52, -74.41),
  ('new-york-ny', 'new brunswick', 'NJ', 40.49, -74.45),
  ('new-york-ny', 'montclair', 'NJ', 40.81, -74.21),
  ('los-angeles-ca', 'los angeles', 'CA', 34.05, -118.24),
  ('los-angeles-ca', 'long beach', 'CA', 33.77, -118.19),
  ('los-angeles-ca', 'anaheim', 'CA', 33.84, -117.91),
  ('los-angeles-ca', 'santa ana', 'CA', 33.75, -117.87),
  ('los-angeles-ca', 'irvine', 'CA', 33.68, -117.83),
  ('los-angeles-ca', 'santa monica', 'CA', 34.02, -118.49),
  ('los-angeles-ca', 'pasadena', 'CA', 34.15, -118.14),
  ('los-angeles-ca', 'glendale', 'CA', 34.14, -118.26),
  ('los-angeles-ca', 'burbank', 'CA', 34.18, -118.31),
  ('los-angeles-ca', 'torrance', 'CA', 33.84, -118.34),
  ('los-angeles-ca', 'santa clarita', 'CA', 34.39, -118.54),
  ('los-angeles-ca', 'west covina', 'CA', 34.07, -117.94),
  ('los-angeles-ca', 'newport beach', 'CA', 33.62, -117.93),
  ('los-angeles-ca', 'beverly hills', 'CA', 34.07, -118.40),
  ('los-angeles-ca', 'malibu', 'CA', 34.03, -118.78),
  ('los-angeles-ca', 'manhattan beach', 'CA', 33.88, -118.41),
  ('chicago-il', 'chicago', 'IL', 41.88, -87.63),
  ('chicago-il', 'naperville', 'IL', 41.75, -88.15),
  ('chicago-il', 'elgin', 'IL', 42.04, -88.28),
  ('chicago-il', 'evanston', 'IL', 42.05, -87.69),
  ('chicago-il', 'schaumburg', 'IL', 42.03, -88.08),
  ('chicago-il', 'joliet', 'IL', 41.53, -88.08),
  ('chicago-il', 'waukegan', 'IL', 42.36, -87.84),
  ('chicago-il', 'gary', 'IN', 41.59, -87.35),
  ('dallas-tx', 'dallas', 'TX', 32.78, -96.80),
  ('dallas-tx', 'fort worth', 'TX', 32.76, -97.33),
  ('dallas-tx', 'arlington', 'TX', 32.74, -97.11),
  ('dallas-tx', 'plano', 'TX', 33.02, -96.70),
  ('dallas-tx', 'irving', 'TX', 32.81, -96.95),
  ('dallas-tx', 'frisco', 'TX', 33.15, -96.82),
  ('dallas-tx', 'denton', 'TX', 33.21, -97.13),
  ('dallas-tx', 'mckinney', 'TX', 33.20, -96.62),
  ('houston-tx', 'houston', 'TX', 29.76, -95.37),
  ('houston-tx', 'the woodlands', 'TX', 30.17, -95.46),
  ('houston-tx', 'sugar land', 'TX', 29.62, -95.63),
  ('houston-tx', 'katy', 'TX', 29.79, -95.82),
  ('houston-tx', 'pearland', 'TX', 29.56, -95.29),
  ('houston-tx', 'galveston', 'TX', 29.30, -94.80),
  ('washington-dc', 'washington', 'DC', 38.91, -77.04),
  ('washington-dc', 'arlington', 'VA', 38.88, -77.10),
  ('washington-dc', 'alexandria', 'VA', 38.80, -77.05),
  ('washington-dc', 'fairfax', 'VA', 38.85, -77.31),
  ('washington-dc', 'reston', 'VA', 38.96, -77.36),
  ('washington-dc', 'mclean', 'VA', 38.93, -77.18),
  ('washington-dc', 'bethesda', 'MD', 38.98, -77.10),
  ('washington-dc', 'silver spring', 'MD', 38.99, -77.03),
  ('washington-dc', 'rockville', 'MD', 39.08, -77.15),
  ('philadelphia-pa', 'philadelphia', 'PA', 39.95, -75.17),
  ('philadelphia-pa', 'king of prussia', 'PA', 40.09, -75.40),
  ('philadelphia-pa', 'camden', 'NJ', 39.93, -75.12),
  ('philadelphia-pa', 'cherry hill', 'NJ', 39.93, -75.03),
  ('philadelphia-pa', 'wilmington', 'DE', 39.74, -75.55),
  ('miami-fl', 'miami', 'FL', 25.76, -80.19),
  ('miami-fl', 'fort lauderdale', 'FL', 26.12, -80.14),
  ('miami-fl', 'west palm beach', 'FL', 26.72, -80.05),
  ('miami-fl', 'boca raton', 'FL', 26.37, -80.13),
  ('miami-fl', 'delray beach', 'FL', 26.46, -80.07),
  ('miami-fl', 'hollywood', 'FL', 26.01, -80.15),
  ('miami-fl', 'coral gables', 'FL', 25.72, -80.27),
  ('miami-fl', 'miami beach', 'FL', 25.79, -80.13),
  ('miami-fl', 'key biscayne', 'FL', 25.69, -80.16),
  ('miami-fl', 'jupiter', 'FL', 26.93, -80.09),
  ('miami-fl', 'pompano beach', 'FL', 26.24, -80.12),
  ('miami-fl', 'palm beach gardens', 'FL', 26.82, -80.14),
  ('atlanta-ga', 'atlanta', 'GA', 33.75, -84.39),
  ('atlanta-ga', 'marietta', 'GA', 33.95, -84.55),
  ('atlanta-ga', 'alpharetta', 'GA', 34.08, -84.29),
  ('atlanta-ga', 'sandy springs', 'GA', 33.92, -84.38),
  ('atlanta-ga', 'decatur', 'GA', 33.77, -84.30),
  ('atlanta-ga', 'roswell', 'GA', 34.02, -84.36),
  ('atlanta-ga', 'duluth', 'GA', 34.00, -84.14),
  ('atlanta-ga', 'peachtree city', 'GA', 33.40, -84.60),
  ('boston-ma', 'boston', 'MA', 42.36, -71.06),
  ('boston-ma', 'cambridge', 'MA', 42.37, -71.11),
  ('boston-ma', 'newton', 'MA', 42.34, -71.21),
  ('boston-ma', 'quincy', 'MA', 42.25, -71.00),
  ('boston-ma', 'brookline', 'MA', 42.33, -71.12),
  ('boston-ma', 'lowell', 'MA', 42.63, -71.32),
  ('boston-ma', 'framingham', 'MA', 42.28, -71.42),
  ('boston-ma', 'nashua', 'NH', 42.77, -71.47),
  ('phoenix-az', 'phoenix', 'AZ', 33.45, -112.07),
  ('phoenix-az', 'mesa', 'AZ', 33.42, -111.83),
  ('phoenix-az', 'scottsdale', 'AZ', 33.49, -111.93),
  ('phoenix-az', 'chandler', 'AZ', 33.31, -111.84),
  ('phoenix-az', 'tempe', 'AZ', 33.43, -111.94),
  ('phoenix-az', 'gilbert', 'AZ', 33.35, -111.79),
  ('phoenix-az', 'glendale', 'AZ', 33.54, -112.19),
  ('phoenix-az', 'peoria', 'AZ', 33.58, -112.24),
  ('san-francisco-ca', 'san francisco', 'CA', 37.77, -122.42),
  ('san-francisco-ca', 'oakland', 'CA', 37.80, -122.27),
  ('san-francisco-ca', 'berkeley', 'CA', 37.87, -122.27),
  ('san-francisco-ca', 'walnut creek', 'CA', 37.91, -122.06),
  ('san-francisco-ca', 'san mateo', 'CA', 37.56, -122.32),
  ('san-francisco-ca', 'redwood city', 'CA', 37.49, -122.24),
  ('san-francisco-ca', 'menlo park', 'CA', 37.45, -122.18),
  ('san-francisco-ca', 'hayward', 'CA', 37.67, -122.08),
  ('san-francisco-ca', 'fremont', 'CA', 37.55, -121.99),
  ('san-francisco-ca', 'san rafael', 'CA', 37.97, -122.53),
  ('san-francisco-ca', 'pleasanton', 'CA', 37.66, -121.87),
  ('san-francisco-ca', 'san ramon', 'CA', 37.78, -121.98),
  ('riverside-ca', 'riverside', 'CA', 33.95, -117.40),
  ('riverside-ca', 'san bernardino', 'CA', 34.11, -117.29),
  ('riverside-ca', 'ontario', 'CA', 34.06, -117.65),
  ('riverside-ca', 'temecula', 'CA', 33.49, -117.15),
  ('riverside-ca', 'palm springs', 'CA', 33.83, -116.55),
  ('riverside-ca', 'palm desert', 'CA', 33.72, -116.37),
  ('riverside-ca', 'indian wells', 'CA', 33.72, -116.34),
  ('detroit-mi', 'detroit', 'MI', 42.33, -83.05),
  ('detroit-mi', 'troy', 'MI', 42.61, -83.15),
  ('detroit-mi', 'dearborn', 'MI', 42.32, -83.18),
  ('detroit-mi', 'livonia', 'MI', 42.37, -83.35),
  ('seattle-wa', 'seattle', 'WA', 47.61, -122.33),
  ('seattle-wa', 'tacoma', 'WA', 47.25, -122.44),
  ('seattle-wa', 'bellevue', 'WA', 47.61, -122.20),
  ('seattle-wa', 'everett', 'WA', 47.98, -122.20),
  ('seattle-wa', 'redmond', 'WA', 47.67, -122.12),
  ('seattle-wa', 'kirkland', 'WA', 47.68, -122.21),
  ('minneapolis-mn', 'minneapolis', 'MN', 44.98, -93.27),
  ('minneapolis-mn', 'st. paul', 'MN', 44.95, -93.09),
  ('minneapolis-mn', 'saint paul', 'MN', 44.95, -93.09),
  ('minneapolis-mn', 'bloomington', 'MN', 44.84, -93.30),
  ('san-diego-ca', 'san diego', 'CA', 32.72, -117.16),
  ('san-diego-ca', 'carlsbad', 'CA', 33.16, -117.35),
  ('san-diego-ca', 'chula vista', 'CA', 32.64, -117.08),
  ('san-diego-ca', 'escondido', 'CA', 33.12, -117.09),
  ('san-diego-ca', 'la jolla', 'CA', 32.84, -117.27),
  ('san-diego-ca', 'oceanside', 'CA', 33.20, -117.38),
  ('tampa-fl', 'tampa', 'FL', 27.95, -82.46),
  ('tampa-fl', 'st. petersburg', 'FL', 27.77, -82.64),
  ('tampa-fl', 'saint petersburg', 'FL', 27.77, -82.64),
  ('tampa-fl', 'clearwater', 'FL', 27.97, -82.80),
  ('tampa-fl', 'brandon', 'FL', 27.94, -82.29),
  ('tampa-fl', 'wesley chapel', 'FL', 28.24, -82.33),
  ('denver-co', 'denver', 'CO', 39.74, -104.99),
  ('denver-co', 'aurora', 'CO', 39.73, -104.83),
  ('denver-co', 'lakewood', 'CO', 39.70, -105.08),
  ('denver-co', 'littleton', 'CO', 39.61, -105.02),
  ('denver-co', 'highlands ranch', 'CO', 39.55, -104.97),
  ('denver-co', 'castle rock', 'CO', 39.37, -104.86),
  ('baltimore-md', 'baltimore', 'MD', 39.29, -76.61),
  ('baltimore-md', 'columbia', 'MD', 39.20, -76.86),
  ('baltimore-md', 'towson', 'MD', 39.40, -76.60),
  ('baltimore-md', 'annapolis', 'MD', 38.98, -76.49),
  ('st-louis-mo', 'st. louis', 'MO', 38.63, -90.20),
  ('st-louis-mo', 'saint louis', 'MO', 38.63, -90.20),
  ('st-louis-mo', 'clayton', 'MO', 38.64, -90.32),
  ('st-louis-mo', 'chesterfield', 'MO', 38.66, -90.58),
  ('st-louis-mo', 'st. charles', 'MO', 38.78, -90.48),
  ('orlando-fl', 'orlando', 'FL', 28.54, -81.38),
  ('orlando-fl', 'kissimmee', 'FL', 28.29, -81.41),
  ('orlando-fl', 'winter park', 'FL', 28.60, -81.34),
  ('orlando-fl', 'sanford', 'FL', 28.80, -81.27),
  ('charlotte-nc', 'charlotte', 'NC', 35.23, -80.84),
  ('charlotte-nc', 'concord', 'NC', 35.41, -80.58),
  ('charlotte-nc', 'gastonia', 'NC', 35.26, -81.19),
  ('charlotte-nc', 'huntersville', 'NC', 35.41, -80.84),
  ('charlotte-nc', 'waxhaw', 'NC', 34.92, -80.74),
  ('charlotte-nc', 'matthews', 'NC', 35.12, -80.72),
  ('charlotte-nc', 'rock hill', 'SC', 34.92, -81.03),
  ('san-antonio-tx', 'san antonio', 'TX', 29.42, -98.49),
  ('san-antonio-tx', 'new braunfels', 'TX', 29.70, -98.12),
  ('portland-or', 'portland', 'OR', 45.52, -122.68),
  ('portland-or', 'beaverton', 'OR', 45.49, -122.80),
  ('portland-or', 'lake oswego', 'OR', 45.42, -122.67),
  ('portland-or', 'hillsboro', 'OR', 45.52, -122.99),
  ('portland-or', 'vancouver', 'WA', 45.64, -122.66),
  ('sacramento-ca', 'sacramento', 'CA', 38.58, -121.49),
  ('sacramento-ca', 'roseville', 'CA', 38.75, -121.29),
  ('sacramento-ca', 'folsom', 'CA', 38.68, -121.18),
  ('sacramento-ca', 'davis', 'CA', 38.54, -121.74),
  ('sacramento-ca', 'elk grove', 'CA', 38.41, -121.37),
  ('pittsburgh-pa', 'pittsburgh', 'PA', 40.44, -79.99),
  ('austin-tx', 'austin', 'TX', 30.27, -97.74),
  ('austin-tx', 'round rock', 'TX', 30.51, -97.68),
  ('austin-tx', 'cedar park', 'TX', 30.51, -97.82),
  ('austin-tx', 'georgetown', 'TX', 30.63, -97.68),
  ('austin-tx', 'san marcos', 'TX', 29.88, -97.94),
  ('las-vegas-nv', 'las vegas', 'NV', 36.17, -115.14),
  ('las-vegas-nv', 'henderson', 'NV', 36.04, -114.98),
  ('cincinnati-oh', 'cincinnati', 'OH', 39.10, -84.51),
  ('cincinnati-oh', 'mason', 'OH', 39.36, -84.31),
  ('cincinnati-oh', 'covington', 'KY', 39.08, -84.51),
  ('kansas-city-mo', 'kansas city', 'MO', 39.10, -94.58),
  ('kansas-city-mo', 'lee''s summit', 'MO', 38.91, -94.38),
  ('kansas-city-mo', 'kansas city', 'KS', 39.11, -94.63),
  ('kansas-city-mo', 'overland park', 'KS', 38.98, -94.67),
  ('kansas-city-mo', 'olathe', 'KS', 38.88, -94.82),
  ('columbus-oh', 'columbus', 'OH', 39.96, -83.00),
  ('columbus-oh', 'dublin', 'OH', 40.10, -83.11),
  ('columbus-oh', 'westerville', 'OH', 40.13, -82.93),
  ('indianapolis-in', 'indianapolis', 'IN', 39.77, -86.16),
  ('indianapolis-in', 'carmel', 'IN', 39.98, -86.12),
  ('indianapolis-in', 'fishers', 'IN', 39.96, -86.01),
  ('cleveland-oh', 'cleveland', 'OH', 41.50, -81.69),
  ('cleveland-oh', 'westlake', 'OH', 41.46, -81.93),
  ('cleveland-oh', 'solon', 'OH', 41.39, -81.44),
  ('san-jose-ca', 'san jose', 'CA', 37.34, -121.89),
  ('san-jose-ca', 'palo alto', 'CA', 37.44, -122.14),
  ('san-jose-ca', 'mountain view', 'CA', 37.39, -122.08),
  ('san-jose-ca', 'sunnyvale', 'CA', 37.37, -122.04),
  ('san-jose-ca', 'santa clara', 'CA', 37.35, -121.96),
  ('san-jose-ca', 'cupertino', 'CA', 37.32, -122.03),
  ('san-jose-ca', 'los gatos', 'CA', 37.23, -121.97),
  ('nashville-tn', 'nashville', 'TN', 36.16, -86.78),
  ('nashville-tn', 'franklin', 'TN', 35.93, -86.87),
  ('nashville-tn', 'brentwood', 'TN', 36.03, -86.78),
  ('nashville-tn', 'murfreesboro', 'TN', 35.85, -86.39),
  ('virginia-beach-va', 'virginia beach', 'VA', 36.85, -75.98),
  ('virginia-beach-va', 'norfolk', 'VA', 36.85, -76.29),
  ('virginia-beach-va', 'chesapeake', 'VA', 36.77, -76.29),
  ('virginia-beach-va', 'newport news', 'VA', 36.98, -76.43),
  ('virginia-beach-va', 'hampton', 'VA', 37.03, -76.35),
  ('virginia-beach-va', 'williamsburg', 'VA', 37.27, -76.71),
  ('providence-ri', 'providence', 'RI', 41.82, -71.41),
  ('providence-ri', 'newport', 'RI', 41.49, -71.31),
  ('providence-ri', 'warwick', 'RI', 41.70, -71.42),
  ('jacksonville-fl', 'jacksonville', 'FL', 30.33, -81.66),
  ('jacksonville-fl', 'ponte vedra beach', 'FL', 30.24, -81.39),
  ('jacksonville-fl', 'st. augustine', 'FL', 29.90, -81.31),
  ('milwaukee-wi', 'milwaukee', 'WI', 43.04, -87.91),
  ('milwaukee-wi', 'waukesha', 'WI', 43.01, -88.23),
  ('raleigh-nc', 'raleigh', 'NC', 35.78, -78.64),
  ('raleigh-nc', 'cary', 'NC', 35.79, -78.78),
  ('raleigh-nc', 'wake forest', 'NC', 35.98, -78.51),
  ('raleigh-nc', 'apex', 'NC', 35.73, -78.85),
  ('raleigh-nc', 'holly springs', 'NC', 35.65, -78.83),
  ('raleigh-nc', 'garner', 'NC', 35.71, -78.61),
  ('raleigh-nc', 'morrisville', 'NC', 35.82, -78.83),
  ('raleigh-nc', 'knightdale', 'NC', 35.79, -78.48),
  ('raleigh-nc', 'fuquay-varina', 'NC', 35.58, -78.80),
  ('oklahoma-city-ok', 'oklahoma city', 'OK', 35.47, -97.52),
  ('oklahoma-city-ok', 'norman', 'OK', 35.22, -97.44),
  ('oklahoma-city-ok', 'edmond', 'OK', 35.65, -97.48),
  ('memphis-tn', 'memphis', 'TN', 35.15, -90.05),
  ('memphis-tn', 'germantown', 'TN', 35.09, -89.81),
  ('richmond-va', 'richmond', 'VA', 37.54, -77.44),
  ('louisville-ky', 'louisville', 'KY', 38.25, -85.76),
  ('new-orleans-la', 'new orleans', 'LA', 29.95, -90.07),
  ('new-orleans-la', 'metairie', 'LA', 29.98, -90.15),
  ('salt-lake-city-ut', 'salt lake city', 'UT', 40.76, -111.89),
  ('salt-lake-city-ut', 'sandy', 'UT', 40.57, -111.86),
  ('hartford-ct', 'hartford', 'CT', 41.76, -72.67),
  ('hartford-ct', 'west hartford', 'CT', 41.76, -72.74),
  ('buffalo-ny', 'buffalo', 'NY', 42.89, -78.88),
  ('birmingham-al', 'birmingham', 'AL', 33.52, -86.80),
  ('birmingham-al', 'hoover', 'AL', 33.41, -86.81),
  ('rochester-ny', 'rochester', 'NY', 43.16, -77.61),
  ('grand-rapids-mi', 'grand rapids', 'MI', 42.96, -85.67),
  ('tucson-az', 'tucson', 'AZ', 32.22, -110.97),
  ('honolulu-hi', 'honolulu', 'HI', 21.31, -157.86),
  ('tulsa-ok', 'tulsa', 'OK', 36.15, -95.99),
  ('fresno-ca', 'fresno', 'CA', 36.74, -119.79),
  ('worcester-ma', 'worcester', 'MA', 42.26, -71.80),
  ('omaha-ne', 'omaha', 'NE', 41.26, -95.93),
  ('bridgeport-ct', 'bridgeport', 'CT', 41.19, -73.20),
  ('bridgeport-ct', 'stamford', 'CT', 41.05, -73.54),
  ('bridgeport-ct', 'norwalk', 'CT', 41.12, -73.41),
  ('bridgeport-ct', 'greenwich', 'CT', 41.03, -73.63),
  ('bridgeport-ct', 'darien', 'CT', 41.08, -73.47),
  ('bridgeport-ct', 'westport', 'CT', 41.14, -73.36),
  ('bridgeport-ct', 'fairfield', 'CT', 41.14, -73.26),
  ('greenville-sc', 'greenville', 'SC', 34.85, -82.40),
  ('albuquerque-nm', 'albuquerque', 'NM', 35.08, -106.65),
  ('bakersfield-ca', 'bakersfield', 'CA', 35.37, -119.02),
  ('albany-ny', 'albany', 'NY', 42.65, -73.76),
  ('albany-ny', 'saratoga springs', 'NY', 43.08, -73.78),
  ('knoxville-tn', 'knoxville', 'TN', 35.96, -83.92),
  ('el-paso-tx', 'el paso', 'TX', 31.76, -106.49),
  ('baton-rouge-la', 'baton rouge', 'LA', 30.45, -91.15),
  ('mcallen-tx', 'mcallen', 'TX', 26.20, -98.23),
  ('new-haven-ct', 'new haven', 'CT', 41.31, -72.92),
  ('allentown-pa', 'allentown', 'PA', 40.60, -75.49),
  ('allentown-pa', 'bethlehem', 'PA', 40.63, -75.37),
  ('oxnard-ca', 'oxnard', 'CA', 34.20, -119.18),
  ('oxnard-ca', 'ventura', 'CA', 34.27, -119.23),
  ('oxnard-ca', 'thousand oaks', 'CA', 34.17, -118.84),
  ('oxnard-ca', 'camarillo', 'CA', 34.22, -119.04),
  ('columbia-sc', 'columbia', 'SC', 34.00, -81.03),
  ('sarasota-fl', 'sarasota', 'FL', 27.34, -82.53),
  ('sarasota-fl', 'bradenton', 'FL', 27.50, -82.57),
  ('sarasota-fl', 'north port', 'FL', 27.04, -82.24),
  ('dayton-oh', 'dayton', 'OH', 39.76, -84.19),
  ('charleston-sc', 'charleston', 'SC', 32.78, -79.93),
  ('charleston-sc', 'mount pleasant', 'SC', 32.83, -79.83),
  ('charleston-sc', 'kiawah island', 'SC', 32.61, -80.08),
  ('greensboro-nc', 'greensboro', 'NC', 36.07, -79.79),
  ('greensboro-nc', 'high point', 'NC', 35.96, -80.01),
  ('stockton-ca', 'stockton', 'CA', 37.96, -121.29),
  ('cape-coral-fl', 'cape coral', 'FL', 26.56, -81.95),
  ('cape-coral-fl', 'fort myers', 'FL', 26.64, -81.87),
  ('cape-coral-fl', 'bonita springs', 'FL', 26.34, -81.78),
  ('boise-id', 'boise', 'ID', 43.62, -116.20),
  ('boise-id', 'meridian', 'ID', 43.61, -116.39),
  ('colorado-springs-co', 'colorado springs', 'CO', 38.83, -104.82),
  ('little-rock-ar', 'little rock', 'AR', 34.75, -92.29),
  ('lakeland-fl', 'lakeland', 'FL', 28.04, -81.95),
  ('akron-oh', 'akron', 'OH', 41.08, -81.52),
  ('des-moines-ia', 'des moines', 'IA', 41.59, -93.62),
  ('springfield-ma', 'springfield', 'MA', 42.10, -72.59),
  ('ogden-ut', 'ogden', 'UT', 41.22, -111.97),
  ('madison-wi', 'madison', 'WI', 43.07, -89.40),
  ('winston-salem-nc', 'winston-salem', 'NC', 36.10, -80.24),
  ('daytona-beach-fl', 'daytona beach', 'FL', 29.21, -81.02),
  ('daytona-beach-fl', 'deltona', 'FL', 28.90, -81.26),
  ('syracuse-ny', 'syracuse', 'NY', 43.05, -76.15),
  ('provo-ut', 'provo', 'UT', 40.23, -111.66),
  ('provo-ut', 'orem', 'UT', 40.30, -111.69),
  ('toledo-oh', 'toledo', 'OH', 41.65, -83.54),
  ('wichita-ks', 'wichita', 'KS', 37.69, -97.34),
  ('durham-nc', 'durham', 'NC', 35.99, -78.90),
  ('durham-nc', 'chapel hill', 'NC', 35.91, -79.06),
  ('durham-nc', 'carrboro', 'NC', 35.91, -79.08),
  ('durham-nc', 'hillsborough', 'NC', 36.08, -79.10),
  ('augusta-ga', 'augusta', 'GA', 33.47, -81.97),
  ('palm-bay-fl', 'palm bay', 'FL', 28.03, -80.59),
  ('palm-bay-fl', 'melbourne', 'FL', 28.08, -80.61),
  ('jackson-ms', 'jackson', 'MS', 32.30, -90.18),
  ('harrisburg-pa', 'harrisburg', 'PA', 40.27, -76.88),
  ('spokane-wa', 'spokane', 'WA', 47.66, -117.43),
  ('scranton-pa', 'scranton', 'PA', 41.41, -75.66),
  ('chattanooga-tn', 'chattanooga', 'TN', 35.05, -85.31),
  ('lancaster-pa', 'lancaster', 'PA', 40.04, -76.31),
  ('modesto-ca', 'modesto', 'CA', 37.64, -121.00),
  ('portland-me', 'portland', 'ME', 43.66, -70.26),
  ('fayetteville-ar', 'fayetteville', 'AR', 36.06, -94.16),
  ('fayetteville-ar', 'rogers', 'AR', 36.33, -94.12),
  ('fayetteville-ar', 'bentonville', 'AR', 36.37, -94.21),
  ('fayetteville-ar', 'springdale', 'AR', 36.19, -94.13),
  ('lexington-ky', 'lexington', 'KY', 38.04, -84.50),
  ('fayetteville-nc', 'fayetteville', 'NC', 35.05, -78.88),
  ('pensacola-fl', 'pensacola', 'FL', 30.42, -87.22),
  ('lansing-mi', 'lansing', 'MI', 42.73, -84.56),
  ('lansing-mi', 'east lansing', 'MI', 42.74, -84.48),
  ('huntsville-al', 'huntsville', 'AL', 34.73, -86.59),
  ('santa-rosa-ca', 'santa rosa', 'CA', 38.44, -122.71),
  ('santa-rosa-ca', 'windsor', 'CA', 38.55, -122.82),
  ('santa-rosa-ca', 'petaluma', 'CA', 38.23, -122.64),
  ('myrtle-beach-sc', 'myrtle beach', 'SC', 33.69, -78.89),
  ('port-st-lucie-fl', 'port st. lucie', 'FL', 27.27, -80.35),
  ('port-st-lucie-fl', 'stuart', 'FL', 27.20, -80.25),
  ('reno-nv', 'reno', 'NV', 39.53, -119.81),
  ('asheville-nc', 'asheville', 'NC', 35.60, -82.55),
  ('ann-arbor-mi', 'ann arbor', 'MI', 42.28, -83.74),
  ('wilmington-nc', 'wilmington', 'NC', 34.23, -77.94),
  ('savannah-ga', 'savannah', 'GA', 32.08, -81.09),
  ('naples-fl', 'naples', 'FL', 26.14, -81.79),
  ('naples-fl', 'marco island', 'FL', 25.94, -81.72),
  ('tallahassee-fl', 'tallahassee', 'FL', 30.44, -84.28),
  ('corpus-christi-tx', 'corpus christi', 'TX', 27.80, -97.40),
  ('anchorage-ak', 'anchorage', 'AK', 61.22, -149.90),
  ('fort-wayne-in', 'fort wayne', 'IN', 41.08, -85.14),
  ('boulder-co', 'boulder', 'CO', 40.01, -105.27),
  ('gainesville-fl', 'gainesville', 'FL', 29.65, -82.32),
  ('santa-barbara-ca', 'santa barbara', 'CA', 34.42, -119.70),
  ('hilton-head-sc', 'hilton head', 'SC', 32.22, -80.75),
  ('hilton-head-sc', 'hilton head island', 'SC', 32.22, -80.75),
  ('hilton-head-sc', 'bluffton', 'SC', 32.24, -80.86),
  ('tyler-tx', 'tyler', 'TX', 32.35, -95.30),
  ('athens-ga', 'athens', 'GA', 33.96, -83.38),
  ('charlottesville-va', 'charlottesville', 'VA', 38.03, -78.48),
  ('montgomery-al', 'montgomery', 'AL', 32.38, -86.30),
  ('manchester-nh', 'manchester', 'NH', 42.99, -71.46),
  ('burlington-vt', 'burlington', 'VT', 44.48, -73.21),
  ('charleston-wv', 'charleston', 'WV', 38.35, -81.63),
  ('lincoln-ne', 'lincoln', 'NE', 40.81, -96.70),
  ('sioux-falls-sd', 'sioux falls', 'SD', 43.54, -96.73),
  ('fargo-nd', 'fargo', 'ND', 46.88, -96.79),
  ('billings-mt', 'billings', 'MT', 45.78, -108.50),
  ('springfield-mo', 'springfield', 'MO', 37.21, -93.29),
  ('columbia-mo', 'columbia', 'MO', 38.95, -92.33),
  ('peoria-il', 'peoria', 'IL', 40.69, -89.59),
  ('champaign-il', 'champaign', 'IL', 40.12, -88.24),
  ('bloomington-in', 'bloomington', 'IN', 39.17, -86.53),
  ('south-bend-in', 'south bend', 'IN', 41.68, -86.25),
  ('evansville-in', 'evansville', 'IN', 37.97, -87.57),
  ('kalamazoo-mi', 'kalamazoo', 'MI', 42.29, -85.59),
  ('flint-mi', 'flint', 'MI', 43.01, -83.69),
  ('rockford-il', 'rockford', 'IL', 42.27, -89.09),
  ('green-bay-wi', 'green bay', 'WI', 44.51, -88.01),
  ('cedar-rapids-ia', 'cedar rapids', 'IA', 41.98, -91.67),
  ('davenport-ia', 'davenport', 'IA', 41.52, -90.58),
  ('shreveport-la', 'shreveport', 'LA', 32.53, -93.75),
  ('lafayette-la', 'lafayette', 'LA', 30.22, -92.02),
  ('mobile-al', 'mobile', 'AL', 30.69, -88.04),
  ('beaumont-tx', 'beaumont', 'TX', 30.08, -94.10),
  ('killeen-tx', 'killeen', 'TX', 31.12, -97.73),
  ('waco-tx', 'waco', 'TX', 31.55, -97.15),
  ('lubbock-tx', 'lubbock', 'TX', 33.58, -101.86),
  ('amarillo-tx', 'amarillo', 'TX', 35.22, -101.83),
  ('brownsville-tx', 'brownsville', 'TX', 25.90, -97.50),
  ('laredo-tx', 'laredo', 'TX', 27.51, -99.51),
  ('college-station-tx', 'college station', 'TX', 30.63, -96.33),
  ('midland-tx', 'midland', 'TX', 32.00, -102.08),
  ('salem-or', 'salem', 'OR', 44.94, -123.04),
  ('eugene-or', 'eugene', 'OR', 44.05, -123.09),
  ('bend-or', 'bend', 'OR', 44.06, -121.32),
  ('olympia-wa', 'olympia', 'WA', 47.04, -122.90),
  ('kennewick-wa', 'kennewick', 'WA', 46.21, -119.14),
  ('visalia-ca', 'visalia', 'CA', 36.33, -119.29),
  ('salinas-ca', 'salinas', 'CA', 36.68, -121.66),
  ('salinas-ca', 'monterey', 'CA', 36.60, -121.89),
  ('salinas-ca', 'carmel-by-the-sea', 'CA', 36.56, -121.92),
  ('san-luis-obispo-ca', 'san luis obispo', 'CA', 35.28, -120.66),
  ('santa-cruz-ca', 'santa cruz', 'CA', 36.97, -122.03),
  ('redding-ca', 'redding', 'CA', 40.59, -122.39),
  ('chico-ca', 'chico', 'CA', 39.73, -121.84),
  ('yuma-az', 'yuma', 'AZ', 32.69, -114.63),
  ('prescott-az', 'prescott', 'AZ', 34.54, -112.47),
  ('flagstaff-az', 'flagstaff', 'AZ', 35.20, -111.65),
  ('las-cruces-nm', 'las cruces', 'NM', 32.32, -106.76),
  ('santa-fe-nm', 'santa fe', 'NM', 35.69, -105.94),
  ('st-george-ut', 'st. george', 'UT', 37.10, -113.58),
  ('fort-collins-co', 'fort collins', 'CO', 40.59, -105.08),
  ('greeley-co', 'greeley', 'CO', 40.42, -104.71),
  ('pueblo-co', 'pueblo', 'CO', 38.25, -104.61),
  ('topeka-ks', 'topeka', 'KS', 39.05, -95.68),
  ('lawrence-ks', 'lawrence', 'KS', 38.97, -95.24),
  ('portsmouth-nh', 'portsmouth', 'NH', 43.07, -70.76),
  ('trenton-nj', 'trenton', 'NJ', 40.22, -74.76),
  ('trenton-nj', 'princeton', 'NJ', 40.35, -74.66),
  ('atlantic-city-nj', 'atlantic city', 'NJ', 39.36, -74.42),
  ('salisbury-md', 'salisbury', 'MD', 38.37, -75.60),
  ('hagerstown-md', 'hagerstown', 'MD', 39.64, -77.72),
  ('reading-pa', 'reading', 'PA', 40.34, -75.93),
  ('york-pa', 'york', 'PA', 39.96, -76.73),
  ('state-college-pa', 'state college', 'PA', 40.79, -77.86),
  ('erie-pa', 'erie', 'PA', 42.13, -80.09),
  ('utica-ny', 'utica', 'NY', 43.10, -75.23),
  ('binghamton-ny', 'binghamton', 'NY', 42.10, -75.91),
  ('ithaca-ny', 'ithaca', 'NY', 42.44, -76.50),
  ('poughkeepsie-ny', 'poughkeepsie', 'NY', 41.70, -73.92),
  ('kingsport-tn', 'kingsport', 'TN', 36.55, -82.56),
  ('kingsport-tn', 'johnson city', 'TN', 36.31, -82.35),
  ('clarksville-tn', 'clarksville', 'TN', 36.53, -87.36),
  ('roanoke-va', 'roanoke', 'VA', 37.27, -79.94),
  ('lynchburg-va', 'lynchburg', 'VA', 37.41, -79.14),
  ('greenville-nc', 'greenville', 'NC', 35.61, -77.37),
  ('hickory-nc', 'hickory', 'NC', 35.73, -81.34),
  ('spartanburg-sc', 'spartanburg', 'SC', 34.95, -81.93),
  ('macon-ga', 'macon', 'GA', 32.84, -83.63),
  ('columbus-ga', 'columbus', 'GA', 32.46, -84.99),
  ('tuscaloosa-al', 'tuscaloosa', 'AL', 33.21, -87.57),
  ('gulfport-ms', 'gulfport', 'MS', 30.37, -89.09),
  ('ocala-fl', 'ocala', 'FL', 29.19, -82.14),
  ('panama-city-fl', 'panama city', 'FL', 30.16, -85.66),
  ('vero-beach-fl', 'vero beach', 'FL', 27.64, -80.40),
  ('punta-gorda-fl', 'punta gorda', 'FL', 26.93, -82.05),
  ('key-west-fl', 'key west', 'FL', 24.56, -81.78),
  ('kahului-hi', 'kahului', 'HI', 20.89, -156.47),
  ('kahului-hi', 'wailuku', 'HI', 20.89, -156.50),
  ('kahului-hi', 'lahaina', 'HI', 20.88, -156.68)
on conflict (place, region) do update set city_id = excluded.city_id, lat = excluded.lat, lng = excluded.lng;

-- ------------------------------------- 4. the switch, the flag and the month scan
-- "Show me on city boards" (Privacy center). Off: your sessions still count
-- for your city, your name and clips stay off every board. Decision 1: on by
-- default for adults (teens are never named whatever it says).
alter table public.user_state add column if not exists city_boards boolean not null default true;

-- Server half of the admin-first flag (the app half is CITY_BOARD_FOR_EVERYONE).
-- To open it to everyone later: update public.server_settings set value = 'on' where key = 'flag:city-board';
insert into public.server_settings (key, value) values ('flag:city-board', 'admins')
  on conflict (key) do nothing;

create index if not exists practice_sessions_tennis_day on public.practice_sessions (day)
  where kind in ('practice', 'match', 'drills');

-- ------------------------------------------------------------ 5. small helpers
-- Every rule a decision can move, in one place (one line each).
create or replace function private.city_board_rules(
  out min_players int,              -- players with a counted session before a city gets a row (decision 6)
  out top_max int,                  -- Top players rows at most
  out fill_to int,                  -- faces in the Up to hit row, ringed + filled
  out up_strangers_elsewhere boolean, -- ringed players on another city's page: false = friends who follow each other only (decision 4)
  out court_min_players int,        -- Busiest courts: different players before a park is listed
  out radius_km double precision)   -- a town belongs to a board place this close (30 mi, IN_TOWN_MILES)
language sql immutable as $$
  select 5, 5, 8, false, 3, 48.28::double precision
$$;

-- A US state as its 2-letter code: 'NC', 'nc', 'N.C.', 'North Carolina', 'NC 27601'. Anything else: null.
create or replace function private.us_state(t text)
returns text
language sql immutable as $$
  select upper(s.code)
    from (values
      ('al', 'alabama'), ('ak', 'alaska'), ('az', 'arizona'), ('ar', 'arkansas'), ('ca', 'california'), ('co', 'colorado'),
      ('ct', 'connecticut'), ('de', 'delaware'), ('dc', 'district of columbia'), ('fl', 'florida'), ('ga', 'georgia'),
      ('hi', 'hawaii'), ('id', 'idaho'), ('il', 'illinois'), ('in', 'indiana'), ('ia', 'iowa'), ('ks', 'kansas'),
      ('ky', 'kentucky'), ('la', 'louisiana'), ('me', 'maine'), ('md', 'maryland'), ('ma', 'massachusetts'),
      ('mi', 'michigan'), ('mn', 'minnesota'), ('ms', 'mississippi'), ('mo', 'missouri'), ('mt', 'montana'),
      ('ne', 'nebraska'), ('nv', 'nevada'), ('nh', 'new hampshire'), ('nj', 'new jersey'), ('nm', 'new mexico'),
      ('ny', 'new york'), ('nc', 'north carolina'), ('nd', 'north dakota'), ('oh', 'ohio'), ('ok', 'oklahoma'),
      ('or', 'oregon'), ('pa', 'pennsylvania'), ('ri', 'rhode island'), ('sc', 'south carolina'), ('sd', 'south dakota'),
      ('tn', 'tennessee'), ('tx', 'texas'), ('ut', 'utah'), ('vt', 'vermont'), ('va', 'virginia'), ('wa', 'washington'),
      ('wv', 'west virginia'), ('wi', 'wisconsin'), ('wy', 'wyoming')
    ) as s(code, name)
   where lower(btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(t, ''), '\.', '', 'g'), '\s*\d{5}(-\d{4})?\s*$', ''), '\s+', ' ', 'g')))
         in (s.code, s.name)
$$;

-- The board city of a profile town (the profile's town centre and its text),
-- or null. Never a live position: profiles.city_lat/lng is the town picked in
-- Edit profile, rounded to a town (191). Also used for a court's own position.
create or replace function private.city_board_city(p_lat double precision, p_lng double precision, p_location text)
returns text
language plpgsql stable set search_path = public as $$
declare
  r double precision := (select radius_km from private.city_board_rules());
  span double precision;
  loc text := lower(regexp_replace(btrim(coalesce(p_location, '')), '\s+', ' ', 'g'));
  town text;
  st text;
  m text[];
  hit text;
begin
  if p_lat is not null and p_lng is not null then
    -- Picked from the search: its position alone decides.
    span := r / 111.2;
    select b.city_id into hit
      from public.board_city_places b
     where b.lat between p_lat - span and p_lat + span
       and b.lng between p_lng - span / greatest(cos(radians(p_lat)), 0.2) and p_lng + span / greatest(cos(radians(p_lat)), 0.2)
       and public.km_between(p_lat, p_lng, b.lat, b.lng) <= r
     order by public.km_between(p_lat, p_lng, b.lat, b.lng), b.city_id
     limit 1;
    return hit;
  end if;
  if loc = '' then return null; end if;
  -- Typed: the town and a US state must both match ("Cary, NC", "Cary, North Carolina", "Cary NC").
  town := btrim(split_part(loc, ',', 1));
  st := private.us_state(split_part(loc, ',', 2));
  if st is null and position(',' in loc) = 0 then
    m := regexp_match(town, '^(.*\S)\s+([a-z]{2})$');
    if m is not null and private.us_state(m[2]) is not null then
      town := m[1];
      st := private.us_state(m[2]);
    end if;
  end if;
  if st is null or town = '' then return null; end if;
  select b.city_id into hit from public.board_city_places b where b.place = town and b.region = st;
  return hit;
end $$;

-- A stored time zone name the server can use, else null (checked by trying it, never by pg_timezone_names, which reads every zone file).
create or replace function private.safe_tz(t text)
returns text
language plpgsql stable as $$
begin
  if t is null or t !~ '^[A-Za-z][A-Za-z0-9_+/-]{1,63}$' then return null; end if;
  perform now() at time zone t;
  return t;
exception when others then
  return null;
end $$;

-- May this player ever be named on a board (to anyone but themselves)?
create or replace function private.city_board_named(u uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.known_adult(u)
     and coalesce((select us.city_boards and us.show_activity from public.user_state us where us.user_id = u), false)
     and exists (select 1 from public.profiles p where p.id = u and p.suspended_at is null)
$$;

-- Everyone whose name is on a post: its tags and its session's "with" list.
create or replace function private.city_board_post_people(p public.posts)
returns uuid[]
language sql stable set search_path = public as $$
  select coalesce(array_agg(distinct x.u), '{}')
    from (select t.u from unnest(coalesce(p.tagged_user_ids, '{}'::uuid[])) as t(u)
          union all
          select (w.e->>'id')::uuid
            from jsonb_array_elements(case when jsonb_typeof(p.session->'with') = 'array' then p.session->'with' else '[]'::jsonb end) as w(e)
           where coalesce(w.e->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') x
   where x.u is not null
$$;

-- May this post ever be a city's clip of the month (to anyone)? A post guest
-- mode would show, a video, by someone who may be named, with no court and no
-- typed place on it (a clip is a person and a time already), and everyone
-- named on it may be named on a board too.
create or replace function private.city_board_clip_ok(p public.posts)
returns boolean
language sql stable security definer set search_path = public as $$
  select p.id is not null
     and nullif(p.video_url, '') is not null
     and p.court_id is null and p.court_lat is null and nullif(btrim(coalesce(p.court_name, '')), '') is null
     and nullif(btrim(coalesce(p.location, '')), '') is null
     and private.guest_post_ok(p)
     and private.city_board_named(p.author_id)
     and not exists (select 1 from unnest(private.city_board_post_people(p)) as t(u) where not private.city_board_named(t.u))
$$;

-- "Needs N more": never says whether exactly one other player is counted
-- there (one other, to a player in a small town, is a person). `players`: the
-- city's players as of yesterday; `counted_me`: you are one of them.
create or replace function private.city_board_needs(players int, counted_me boolean)
returns int
language sql immutable as $$
  select greatest(1, r.min_players - m.me - case when m.others >= 2 then m.others else 0 end)
    from private.city_board_rules() as r,
         lateral (select case when counted_me then 1 else 0 end as me,
                         greatest(0, coalesce(players, 0) - case when counted_me then 1 else 0 end) as others) as m
$$;

revoke all on function private.city_board_rules() from public, anon, authenticated;
revoke all on function private.us_state(text) from public, anon, authenticated;
revoke all on function private.city_board_city(double precision, double precision, text) from public, anon, authenticated;
revoke all on function private.city_board_named(uuid) from public, anon, authenticated;
revoke all on function private.safe_tz(text) from public, anon, authenticated;
revoke all on function private.city_board_post_people(public.posts) from public, anon, authenticated;
revoke all on function private.city_board_clip_ok(public.posts) from public, anon, authenticated;
revoke all on function private.city_board_needs(int, boolean) from public, anon, authenticated;

-- ------------------------------------------------------- 6. the refresh (pg_cron)
-- Recomputes the open months: this month, next month once it has begun
-- anywhere, and last month until the 3rd (late logs), then it freezes.
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

-- --------------------------------------------------------- 7. city_board(month)
-- The standings (Find Players card and the full board). Cities and counts
-- only: no person anywhere. `p_month` is the phone's own local month; last
-- month stays available until the 3rd (UTC), so on the 1st, before this
-- month has a counted day, the phone can show last month's final board.
create or replace function public.city_board(p_month date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
  if p_month is null or p_month <> date_trunc('month', p_month)::date
     or p_month not in (date_trunc('month', current_date - 3)::date, date_trunc('month', current_date)::date, date_trunc('month', current_date + 1)::date) then
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
    'open_until', to_char((p_month + interval '1 month')::date + 2, 'YYYY-MM-DD'),
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
end $$;
revoke all on function public.city_board(date) from public, anon;
grant execute on function public.city_board(date) to authenticated;

-- ---------------------------------------------------- 8. city_page(city, month)
-- One city: Top players, Up to hit (ringed + filled), Busiest courts, the
-- clip. Only a ranked city, or your own. Every person is checked again here,
-- for this viewer, right now. Every number but your own is as of yesterday.
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

-- ------------------------------------------------------------ 9. the schedule
do $$
begin
  if exists (select 1 from cron.job where jobname = 'courtside-city-board') then
    perform cron.unschedule('courtside-city-board');
  end if;
  perform cron.schedule('courtside-city-board', '3,18,33,48 * * * *', 'select public.refresh_city_board()');
end $$;

-- Warm: the boards are filled now, not 15 minutes from now.
select public.refresh_city_board();

-- ------------------------------------------------------------------ 10. check
do $$
declare
  t text;
begin
  foreach t in array array['board_cities', 'board_city_places', 'city_board_months', 'city_board_members', 'city_board_cities',
                           'city_board_daily', 'city_board_events', 'city_board_courts', 'city_board_court_weeks', 'city_board_clips'] loop
    if has_table_privilege('authenticated', 'public.' || t, 'select, insert, update, delete')
       or has_table_privilege('anon', 'public.' || t, 'select, insert, update, delete')
       or not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) then
      raise exception 'Migration 196 stopped: % can be reached from the app. Nothing was changed.', t;
    end if;
  end loop;
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.city_board(date)'::regprocedure)
     or not (select p.prosecdef from pg_proc p where p.oid = 'public.city_page(text, date)'::regprocedure)
     or not (select p.prosecdef from pg_proc p where p.oid = 'public.refresh_city_board()'::regprocedure)
     or has_function_privilege('anon', 'public.city_board(date)', 'execute')
     or has_function_privilege('anon', 'public.city_page(text, date)', 'execute')
     or not has_function_privilege('authenticated', 'public.city_board(date)', 'execute')
     or not has_function_privilege('authenticated', 'public.city_page(text, date)', 'execute')
     or has_function_privilege('authenticated', 'public.refresh_city_board()', 'execute')
     or has_function_privilege('anon', 'public.refresh_city_board()', 'execute')
     or has_function_privilege('authenticated', 'private.city_board_named(uuid)', 'execute')
     or has_function_privilege('authenticated', 'private.city_board_city(double precision, double precision, text)', 'execute')
     or has_function_privilege('authenticated', 'private.city_board_rules()', 'execute')
     or has_function_privilege('authenticated', 'private.us_state(text)', 'execute')
     or has_function_privilege('authenticated', 'private.safe_tz(text)', 'execute')
     or has_function_privilege('authenticated', 'private.city_board_post_people(public.posts)', 'execute')
     or has_function_privilege('authenticated', 'private.city_board_clip_ok(public.posts)', 'execute')
     or has_function_privilege('authenticated', 'private.city_board_needs(int, boolean)', 'execute')
     or has_function_privilege('anon', 'private.city_board_clip_ok(public.posts)', 'execute')
     or has_function_privilege('anon', 'private.city_board_named(uuid)', 'execute')
     or not exists (select 1 from cron.job where jobname = 'courtside-city-board' and schedule = '3,18,33,48 * * * *')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'city_boards')
     or (select value from public.server_settings where key = 'flag:city-board') is null then
    raise exception 'Migration 196 stopped: the city board functions did not come out as written. Nothing was changed.';
  end if;
  -- 109's rules still hold: nothing reads the stored age directly, and the age helper is only used by server-only code.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public', 'private') and p.proname in ('city_board', 'city_page', 'refresh_city_board', 'city_board_named', 'city_board_city',
                                                                          'city_board_clip_ok', 'city_board_post_people', 'city_board_needs')
                and p.prosrc ~* 'age_group')
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname in ('public', 'private') and p.prosrc ~* 'known_adult' and not p.prosecdef) then
    raise exception 'Migration 196 stopped: an age rule from 109 would break. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 11. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
-- (a) Who may call what (expect false, true, true, false):
-- select has_function_privilege('anon', 'public.city_board(date)', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.city_board(date)', 'execute') as app_board,
--        has_function_privilege('authenticated', 'public.city_page(text, date)', 'execute') as app_page,
--        has_function_privilege('authenticated', 'public.refresh_city_board()', 'execute') as app_refresh;
-- (b) This month's board (cities and counts only):
-- select c.city_id, c.sessions, c.players, c.rank from public.city_board_cities c
--  where c.month = date_trunc('month', current_date)::date order by c.rank nulls last, c.sessions desc;
-- (c) The job ran (expect a refreshed_at within 15 minutes and a took_ms):
-- select * from public.city_board_months order by month desc;
-- (d) The flag (expect 'admins'):
-- select value from public.server_settings where key = 'flag:city-board';
