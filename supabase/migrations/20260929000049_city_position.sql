-- Where a profile's city is, so the players map can place anyone from any
-- town (not only the app's built-in list of big cities). Set when someone
-- picks their city from the search; city-level only, never a street.
-- Safe to run more than once.
alter table public.profiles add column if not exists city_lat double precision check (city_lat is null or city_lat between -90 and 90);
alter table public.profiles add column if not exists city_lng double precision check (city_lng is null or city_lng between -180 and 180);
