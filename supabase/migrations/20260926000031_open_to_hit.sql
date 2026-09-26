-- "Open to hit": a player can say they are up for a hit today; the map shows
-- a green ring around them until the moment stored here. Profiles are public,
-- so everyone who can see the map can see it. Safe to run more than once.
alter table public.profiles add column if not exists open_to_hit_until timestamptz;
