-- Tennis courts kept in our own database. The map used to ask OpenStreetMap
-- afresh every time; now the "courts" function fetches each area once
-- (squares about 25 km across), keeps every court it found here, and
-- answers from here after that, re-checking an area every couple of months.
-- A court keeps its OpenStreetMap id ("way123456"), the same one players'
-- court notes use. Safe to run more than once.
create table if not exists public.courts (
  id text primary key check (id ~ '^(node|way|relation)[0-9]{1,15}$'),
  name text check (name is null or char_length(name) <= 160),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  lit boolean,
  surface text check (surface is null or char_length(surface) <= 40),
  updated_at timestamptz not null default now()
);
create index if not exists courts_place_idx on public.courts (lat, lng);

alter table public.courts enable row level security;
drop policy if exists "courts are public" on public.courts;
create policy "courts are public" on public.courts for select using (true);
-- No write policies: only the courts function (with the service key) adds courts.

-- Which squares have been fetched, and when. Written and read by the function only.
create table if not exists public.court_areas (
  cell text primary key check (cell ~ '^-?[0-9]{1,3}:-?[0-9]{1,4}$'),
  fetched_at timestamptz not null default now(),
  found integer not null default 0
);
alter table public.court_areas enable row level security;
