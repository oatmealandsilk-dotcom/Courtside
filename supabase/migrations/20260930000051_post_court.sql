-- Tag the court you played on: a post can carry one court from the map
-- (its OpenStreetMap id, its name, and where it is), so the post shows
-- "Lake Lynn Park" and the court's card on the map shows what was posted there.
-- Safe to run more than once.
alter table public.posts add column if not exists court_id text check (court_id is null or char_length(court_id) <= 40);
alter table public.posts add column if not exists court_name text check (court_name is null or char_length(court_name) <= 160);
alter table public.posts add column if not exists court_lat double precision check (court_lat is null or court_lat between -90 and 90);
alter table public.posts add column if not exists court_lng double precision check (court_lng is null or court_lng between -180 and 180);
-- "What was posted at this court": found by where it is, a few hundred metres either way.
create index if not exists posts_court_spot_idx on public.posts (court_lat, court_lng) where court_lat is not null;
