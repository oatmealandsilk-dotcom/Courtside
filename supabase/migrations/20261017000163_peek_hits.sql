-- CourtSide · migration 20261017000163: the peek, open hits for someone with
-- no account yet (Oct 17, owner: "for the Web version if people are gonna
-- click the link will they be able to find a hit immediately? ... would it
-- be better to have them be able to see all the hits available before they
-- have to make an account", then "Build the peek").
--
-- What it is for: someone taps the Facebook link, lands on the website and
-- taps "See open hits near you". The web app's new page (app.courtsidebase.com
-- /peek) lists the open hits coming up near them before they have an
-- account. Tapping "I'm in" on one asks them to make a free account, and
-- once they have one the app opens on that hit and joins it (when today's
-- join rules let it: see join_hit, migration 124).
--
-- In plain words, this file adds one thing:
--   peek_hits(lat, lng, how many): the open hits a stranger may see, at most
--   30, soonest first, or nearest first when the page passes a spot (the
--   visitor tapped "Use my location"). Anyone may ask, signed in or not.
--
-- Only hits that are safe to show a stranger, all of these at once:
--   * the host is someone a stranger may already see (share_open, migration
--     68): a public account, not suspended, and known to be an adult (a
--     birthday on file saying 18 or over). Never a teen, never an account
--     with no birthday. Signed in, never someone blocked either way.
--   * the hit is open to everyone (hit_is_open, migration 76): never an
--     invite-only hit, never one still waiting for its invited players or
--     the poster's groups, never one only for followers or a group.
--   * it is not called off, it starts in the next 7 days (never one that has
--     started or is over), and it still has a spot.
--   * nobody already in it (or in its chat) is anyone but a known adult. A
--     hit with a teen in it is left out entirely, so the list never hints
--     that a teen is in it, and a new adult is never shown a hit that would
--     then say "That hit is not open to you."
--   * signed in: not your own, and not one you are already in.
-- And only these few things about each hit: when, singles/doubles/hitting,
-- spots left, the level it asks for (and which scale, NTRP/UTR/ITF), the
-- court's name, the court's town (see below), how far away it is when a
-- spot was given, and the host's first name. Never a handle, a photo, a
-- last name, the note, who else is in, or anyone's own location.
--
-- Where things are:
--   * Courts are public places, but no coordinates come back at all. The
--     distance is worked out on the server from the court to the visitor's
--     spot, both rounded to about a kilometre first, and said to a tenth of
--     a kilometre: a hit at a spot typed on the map (not a court on the
--     courts list) can never be found to closer than about a kilometre.
--   * The visitor's spot is used for that one answer and never kept: this
--     function writes nothing and logs nothing.
--   * The court's town is the first part of the host's own city ("Raleigh"
--     from "Raleigh, NC", which their public profile already shows), and only
--     when the court is within 40 km of that city, so a Miami player's hit in
--     San Diego is never labelled Miami.
--
-- Nothing already saved changes. Needs migrations 21, 47, 49, 53, 68, 76,
-- 95 and 109 (all live). Stops before changing anything if the helpers it
-- leans on (known_adult, share_open, share_open_to_me, hit_is_open,
-- is_blocked_between, km_between) have changed since they were written, or
-- if peek_hits already exists and is not this file's. Safe to run more than
-- once.
--
-- ------------------------------------------------------------- HOW TO RUN IT
-- Supabase -> SQL Editor -> New query, paste this whole file, press Run.
-- "Success. No rows returned" means it is in. Anything else: nothing was
-- changed; the message says why.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  -- md5 of each helper's body as its migration left it (all live since Oct 5).
  want constant jsonb := jsonb_build_object(
    'known_adult',        'a79e745befd4374ea124ccf1692145a2',  -- 109
    'is_blocked_between', 'f7246d0dbae4888d3a96a1d317c9de5f',  -- 21
    'share_open',         '4b238dfbfac4f00409d2bf793120f186',  -- 68
    'share_open_to_me',   'f90467236bcd89cfc6798ecb7cf04cd9',  -- 68
    'hit_is_open',        '612f8e8a84adc2445eaa53b687bb4dfe',  -- 76
    'km_between',         'ffcfba4f6d252f977c21a0ee02f0cbd7'); -- 53
  k text;
  r record;
begin
  if to_regclass('public.hit_requests') is null or to_regclass('public.hit_joins') is null
     or to_regclass('public.profiles') is null or to_regclass('public.courts') is null
     or to_regclass('public.conversation_members') is null or to_regclass('public.user_state') is null then
    raise exception 'Migration 163 stopped before changing anything: the hits, courts, chats and profiles tables have to be there first.';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'hit_requests'
       and column_name in ('starts_at', 'place', 'level_min', 'level_max', 'format', 'spots', 'cancelled', 'conversation_id', 'joined_count', 'audience')) <> 10 then
    raise exception 'Migration 163 stopped before changing anything: hit_requests is missing columns migrations 43, 76 and 95 add.';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
       and column_name in ('name', 'location', 'profile', 'city_lat', 'city_lng', 'is_private', 'suspended_at')) <> 7 then
    raise exception 'Migration 163 stopped before changing anything: profiles is missing columns migrations 23 and 49 add.';
  end if;
  for k in select jsonb_object_keys(want) loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = k) then
      raise exception 'Migration 163 stopped before changing anything: public.% is missing.', k;
    end if;
    for r in select md5(p.prosrc) as m from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = k loop
      if r.m <> want->>k then
        raise exception 'Migration 163 stopped before changing anything: public.% has changed since it was written (md5 %). Check that the peek still keeps to its rules first.', k, r.m;
      end if;
    end loop;
  end loop;
  for r in select p.prosrc as src from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'peek_hits' loop
    if position('peek_hits_163' in r.src) = 0 then
      raise exception 'Migration 163 stopped before changing anything: public.peek_hits already exists and is not this file''s. Compare before replacing it.';
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------- 1. peek_hits
drop function if exists public.peek_hits(double precision, double precision, integer);
create function public.peek_hits(p_lat double precision default null, p_lng double precision default null, p_limit integer default 20)
returns table (
  id uuid, starts_at timestamptz, format text, spots_left integer,
  level_min numeric, level_max numeric, skill_system text,
  court_id text, court_name text, area text, km numeric, host_first text
)
language sql stable security definer set search_path = public as $$
  -- peek_hits_163
  with here as (
    -- The visitor's spot, to about a kilometre, only when it is a real one.
    select case when p_lat between -90 and 90 and p_lng between -180 and 180 then round(p_lat::numeric, 2)::double precision end as lat,
           case when p_lat between -90 and 90 and p_lng between -180 and 180 then round(p_lng::numeric, 2)::double precision end as lng
  ),
  open_hits as (
    select h.id, h.starts_at, h.format, greatest(h.spots - h.joined_count, 0) as spots_left,
           h.level_min, h.level_max, h.place,
           p.name as host_name, p.location as host_location, p.city_lat, p.city_lng, p.profile as host_profile,
           -- The court's spot (the courts list's for a picked court, else the place's own), to about a kilometre.
           round(coalesce(c.lat, case when jsonb_typeof(h.place->'lat') = 'number' then (h.place->>'lat')::double precision end)::numeric, 2)::double precision as plat,
           round(coalesce(c.lng, case when jsonb_typeof(h.place->'lng') = 'number' then (h.place->>'lng')::double precision end)::numeric, 2)::double precision as plng
      from public.hit_requests h
      join public.profiles p on p.id = h.author_id
      left join public.courts c on c.id = h.place->>'id'
     where not h.cancelled
       and h.starts_at > now() and h.starts_at < now() + interval '7 days'
       and h.spots - h.joined_count > 0
       and public.hit_is_open(h.id)
       and public.share_open_to_me(h.author_id)
       and (auth.uid() is null or (h.author_id <> auth.uid()
            and not exists (select 1 from public.hit_joins j where j.hit_id = h.id and j.user_id = auth.uid())))
       and not exists (
         select 1 from (
           select j.user_id as who from public.hit_joins j where j.hit_id = h.id
           union
           select m.user_id from public.conversation_members m where m.conversation_id = h.conversation_id
         ) x
         where x.who <> h.author_id and not public.known_adult(x.who))
  )
  select o.id, o.starts_at, o.format, o.spots_left::integer,
         o.level_min, o.level_max,
         case when o.host_profile->>'skillSystem' in ('NTRP', 'UTR', 'ITF') then o.host_profile->>'skillSystem' end,
         case when (o.place->>'id') ~ '^(node|way|relation)[0-9]{1,15}$' then o.place->>'id' end,
         left(o.place->>'name', 120),
         case when o.plat is not null and o.city_lat is not null and o.city_lng is not null
                   and public.km_between(o.plat, o.plng, o.city_lat, o.city_lng) <= 40
              then nullif(left(btrim(split_part(coalesce(o.host_location, ''), ',', 1)), 40), '') end,
         case when here.lat is not null and o.plat is not null
              then round(public.km_between(here.lat, here.lng, o.plat, o.plng)::numeric, 1) end as km,
         coalesce(nullif(left(split_part(btrim(coalesce(o.host_name, '')), ' ', 1), 30), ''), 'A player')
    from open_hits o cross join here
   order by km nulls last, o.starts_at, o.id
   limit least(greatest(coalesce(p_limit, 20), 1), 30)
$$;
revoke all on function public.peek_hits(double precision, double precision, integer) from public;
grant execute on function public.peek_hits(double precision, double precision, integer) to anon, authenticated;

-- ------------------------------------------------- 2. it did what it says
do $$
begin
  if not has_function_privilege('anon', 'public.peek_hits(double precision, double precision, integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.peek_hits(double precision, double precision, integer)', 'execute') then
    raise exception 'migration 163: the website cannot ask for the peek';
  end if;
  if (select p.provolatile from pg_proc p where p.oid = 'public.peek_hits(double precision, double precision, integer)'::regprocedure) <> 's' then
    raise exception 'migration 163: peek_hits must only read';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ------------------------------------------------------------- DRY RUN
-- To try this file without keeping anything: run it with its "commit;" line
-- (just above) replaced by the lines below, each without its leading "-- ".
-- It lists what a stranger would see now (no names but first names), checks
-- that no host in it is a teen or has no birthday, then undoes it all.
--
-- do $$ declare n int; bad int; begin
--   select count(*) into n from public.peek_hits(null, null, 30);
--   select count(*) into bad from public.peek_hits(null, null, 30) x join public.hit_requests h on h.id = x.id where not public.known_adult(h.author_id);
--   raise notice 'dry run: % open hits a stranger would see, % with a host who is not a known adult (expect 0)', n, bad;
--   if bad > 0 then raise exception 'dry run: a host who is not a known adult would show'; end if;
-- end $$;
-- rollback;

-- ------------------------------------------------- 3. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) What the peek shows a stranger right now, soonest first:
-- select starts_at, court_name, area, format, spots_left, host_first from public.peek_hits(null, null, 30);
--
-- (b) The same, nearest first to Raleigh (35.78, -78.64):
-- select court_name, km, starts_at, host_first from public.peek_hits(35.78, -78.64, 30);
--
-- (c) Every host in it is a known adult (expect 0):
-- select count(*) from public.peek_hits(null, null, 30) x join public.hit_requests h on h.id = x.id where not public.known_adult(h.author_id);
--
-- (d) The website may ask, and only read (expect true, s):
-- select has_function_privilege('anon', 'public.peek_hits(double precision, double precision, integer)', 'execute'),
--        (select provolatile from pg_proc where oid = 'public.peek_hits(double precision, double precision, integer)'::regprocedure);
