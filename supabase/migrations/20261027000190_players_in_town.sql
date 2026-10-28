-- CourtSide · migration 20261027000190: "Near me" lists the players whose
-- own profile town is yours, by the town only.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. All-or-nothing:
-- if a check fails, it stops and nothing at all changes. Safe to run more
-- than once. Undo: supabase/rollback/190_undo.sql.
--
-- Why (owner, Oct 27): "Near me should show people that have their location
-- set in the area, like the city". Apple (Oct 27, Guideline 5.1.2(i)) keeps
-- the map itself friends only and Check in only (migration 189), so this is
-- a list, never a pin: the town each player chose for their profile, never
-- anyone's live spot, never a distance.
--
-- What it adds: players_in_town(), one list for the signed-in player, with no
-- arguments (it can only ever be asked about your own town, so nobody can
-- walk it across other towns):
--   * Your town is the one on your profile. Someone is in it when both towns
--     were picked from the search and their centres are within 30 miles
--     (48.28 km, the app's IN_TOWN_MILES), else when the town names match
--     ("Raleigh, NC" and "Raleigh").
--   * Who: friends who follow each other with you, any age; anyone else only
--     a known adult, and only to a known adult. So a teen (or an account
--     with no birthday on file) is never listed to a stranger, and a teen
--     sees only friends here. The same rule as New on CourtSide (122), made
--     stricter for teens: a teen who follows you but you do not follow back
--     is not listed either.
--   * Never you, anyone blocked either way, or a suspended account.
--   * Most recently active first (the last day they opened the app, else the
--     day they joined), at most 60. Only ids come back: no time, no spot, no
--     distance, no age.
--
-- Said plainly (the same thing 122 says of New on CourtSide): comparing this
-- list with the profiles in your town shows that someone left out of it is
-- not known to be an adult. Only for your own town, and hiding it too would
-- mean listing no strangers at all.
--
-- Left as they are: everything on the map (189), new_on_courtside, the
-- profiles' town and its position (121: a town's position never reaches the
-- app; only this list is worked out from it, on the server).

begin;

-- ------------------------------------------------------------------ 0. check
do $$
begin
  if to_regprocedure('public.km_between(double precision, double precision, double precision, double precision)') is null
     or to_regprocedure('public.follow_each_other(uuid, uuid)') is null
     or to_regprocedure('public.is_blocked_between(uuid, uuid)') is null
     or to_regprocedure('public.known_adult(uuid)') is null
     or to_regclass('public.app_opens') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'city_lat')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'suspended_at') then
    raise exception 'Migration 190 stopped before changing anything: migrations 21, 49, 98, 109 and 110 have to run first.';
  end if;
  -- The age helper stays server-only (109): the app can never ask it directly.
  if has_function_privilege('authenticated', 'public.known_adult(uuid)', 'execute')
     or has_function_privilege('anon', 'public.known_adult(uuid)', 'execute') then
    raise exception 'Migration 190 stopped before changing anything: known_adult can be called from the app. Ask Claude to look.';
  end if;
end $$;

-- ------------------------------------------------------- 1. players in your town
create or replace function public.players_in_town()
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, p.city_lat, p.city_lng,
           lower(btrim(split_part(coalesce(p.location, ''), ',', 1))) as town,
           public.known_adult(p.id) as adult
    from public.profiles p
    where auth.uid() is not null and p.id = auth.uid()
  )
  select p.id
  from public.profiles p cross join me
  where p.id <> me.id
    and p.suspended_at is null
    and not public.is_blocked_between(me.id, p.id)
    -- In your town: by the towns' centres when both were picked from the search, else by the town's name.
    and case
      when me.city_lat is not null and me.city_lng is not null and p.city_lat is not null and p.city_lng is not null
        then public.km_between(me.city_lat, me.city_lng, p.city_lat, p.city_lng) <= 48.28
      else me.town <> '' and lower(btrim(split_part(coalesce(p.location, ''), ',', 1))) = me.town
    end
    -- Friends who follow each other with you, any age; a stranger only a known adult, and only to a known adult.
    and (public.follow_each_other(me.id, p.id) or (me.adult and public.known_adult(p.id)))
  order by coalesce((select max(o.day) from public.app_opens o where o.user_id = p.id), p.created_at::date) desc,
           p.created_at desc, p.id
  limit 60
$$;
revoke all on function public.players_in_town() from public, anon;
grant execute on function public.players_in_town() to authenticated;

-- ------------------------------------------------------------------ 2. check
do $$
begin
  if to_regprocedure('public.players_in_town()') is null
     or not (select p.prosecdef from pg_proc p where p.oid = 'public.players_in_town()'::regprocedure)
     or has_function_privilege('anon', 'public.players_in_town()', 'execute')
     or not has_function_privilege('authenticated', 'public.players_in_town()', 'execute') then
    raise exception 'Migration 190 stopped: players_in_town did not come out as written. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 3. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
-- (a) Who may call it (expect anon false, app true):
-- select has_function_privilege('anon', 'public.players_in_town()', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.players_in_town()', 'execute') as app;
