-- CourtSide · migration 104: a profile's town is a town, not a spot
-- (security review, Oct 5).
--
-- The problem: "Use my location" (onboarding and Edit Profile) saved the
-- phone's own GPS fix, to 13 decimals, as the profile's town position
-- (profiles.city_lat / city_lng). Profiles are public, so anyone could read
-- where that phone was, which skips every map rule (the rough spot, the
-- teen rules). The app now sends only two decimals (about 1 km).
--
-- What this does: every saved town position is rounded to two decimals,
-- now and on every future save, whatever an app version sends.
-- Safe to run more than once.

create or replace function public.round_city_position() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.city_lat is not null then new.city_lat := round(new.city_lat::numeric, 2)::double precision; end if;
  if new.city_lng is not null then new.city_lng := round(new.city_lng::numeric, 2)::double precision; end if;
  return new;
end $$;
revoke all on function public.round_city_position() from public, anon, authenticated;

drop trigger if exists round_city_position on public.profiles;
create trigger round_city_position before insert or update of city_lat, city_lng on public.profiles
  for each row execute function public.round_city_position();

-- The ones already saved.
update public.profiles
   set city_lat = round(city_lat::numeric, 2)::double precision,
       city_lng = round(city_lng::numeric, 2)::double precision
 where (city_lat is not null and city_lat <> round(city_lat::numeric, 2)::double precision)
    or (city_lng is not null and city_lng <> round(city_lng::numeric, 2)::double precision);

-- Check afterwards (expect 0):
-- select count(*) from public.profiles where city_lat <> round(city_lat::numeric, 2)::double precision or city_lng <> round(city_lng::numeric, 2)::double precision;

-- And a profile picture's address must be a plain https address with
-- nothing in it that could break out of the map pins' HTML (the app now
-- checks too; this covers app versions that do not yet). NOT VALID: rows
-- already saved are not re-checked, new saves are.
alter table public.profiles drop constraint if exists avatar_url_plain;
alter table public.profiles add constraint avatar_url_plain
  check (avatar_url is null or (char_length(avatar_url) <= 2000 and avatar_url ~ '^https://[^[:space:]''"()\\<>]+$')) not valid;
