-- CourtSide · migration 94: someone who is not signed in no longer sees
-- teens' profiles (security review, Oct 5).
--
-- The problem: profile rows are public ("profiles are public", migration 1),
-- age_group included, and the database answers people who are not signed in
-- too. So anyone with the app's public key (it ships inside every copy of the
-- app and the website) could ask for every account with age_group = 'teen'
-- and get each one's name, photo, town, city on the map and upcoming
-- tournaments, without ever making an account. 11 teen accounts today.
--
-- What changes: signed out, only profiles known to belong to adults come
-- back. Nothing in the app or on the website reads profiles while signed out
-- (the app asks you to sign in first; the waitlist page never reads them),
-- so nobody sees any difference. The link-preview worker (not switched on
-- yet) still gets adults' names for its cards; a teen's link shows the
-- plain CourtSide card.
--
-- What this does NOT do: anyone signed in still receives every profile
-- with its age_group. Migration 64 (written, waiting on the app version that
-- comes with it) is what takes the age off profile rows for everyone. Until
-- then a free account still gets the list; this closes the door for people
-- who have not even signed up.
--
-- The check asks known_adult through a small helper of its own, so it keeps
-- working after migration 64 changes who may call known_adult.
-- Safe to run more than once.

create or replace function public.shown_signed_out(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.known_adult(u)
$$;
revoke all on function public.shown_signed_out(uuid) from public;
grant execute on function public.shown_signed_out(uuid) to anon, authenticated;

-- Restrictive: it narrows "profiles are public" for signed-out readers only.
drop policy if exists "signed out see adults only" on public.profiles;
create policy "signed out see adults only" on public.profiles
  as restrictive for select to anon
  using (public.shown_signed_out(id));

-- Check after running, as a signed-out reader (expect 0):
-- begin; set local role anon;
--   select count(*) from public.profiles where age_group is distinct from 'adult';
-- rollback;
