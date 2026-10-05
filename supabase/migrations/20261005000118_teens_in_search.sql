-- CourtSide · migration 118: teens can be found in search, and someone who
-- blocked you is not; your town position is read only by you.
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if the check below fails, it stops and
-- nothing at all changes. It only adds two small questions, so it can run
-- before or after the app from this branch is live: until it runs, that app
-- works as before (it asks, finds no such question, and carries on).
--
-- The owner, Oct 5: "Also teens should be able to be found in search".
-- The model is Instagram's teen accounts: a teen turns up in search like
-- anyone else, but the account is private to start, people the teen does
-- not follow cannot message or tag them, and they are never put in front of
-- adult strangers on the map.
--
-- What was found (live database, Oct 5, after 109): search already finds
-- teens. People search runs on the phone over the profile rows, and every
-- signed-in account can read every profile row ("profiles are public");
-- since 109 no profile row says how old anyone is, and every row has the
-- same fields. Signed out, nobody reads any profile (109). Nothing in the
-- app left teens out of search either. So this file changes nothing about
-- who can be found or what a profile shows, and nothing about any teen rule.
--
-- The app on the same branch (no database needed):
--   * Search (and the Find Players search) finds people by name or @handle
--     only, never by their town or bio, and no result shows or ranks by a
--     town. The same for every account.
--   * A private account's tennis profile page (/profile-details) opened by
--     its address goes to their profile's private card, like the profile.
--   * "Players you might know" puts someone in front of you only if they
--     follow you, or if you are a known adult and open_to_you (64/109, the
--     300-a-day limit) says you may reach them. So a teen is suggested only
--     to people the teen follows.
--   * Suspended accounts are left out of search (admins still find them).
--
-- What it adds:
--   1. blocked_me(): the accounts that have blocked the signed-in account,
--      so the app leaves them out of Search, the Find Players search, the @
--      list and "Players you might know", the way it leaves out people you
--      blocked. That matters most for a teen: a teen who blocks someone
--      drops out of that person's search, as on Instagram. Said plainly: it
--      is a courtesy of the app, not a protection. The blocker's profile row
--      still reaches the blocked person's phone like everyone's, and a
--      direct link still opens it (the privacy policy says so); what
--      protects the blocker is the server's block rules, as before.
--        * Signed-in accounts only; nothing for signed-out readers.
--        * It answers only about the account asking. It tells nobody
--          anything new: blocked_with(other) (21) already answers "is there
--          a block between me and this account?" for any account.
--        * Nobody's age is read (109's daily limit is for answers that
--          depend on age; this one does not).
--   2. my_city_at(): your own town position (profiles.city_lat/city_lng,
--      kept to about 1 km by 104). The app needs only its own; until now it
--      read everyone's with the profile list, so any signed-in account could
--      read where a teen tapped "Use my location" (7 teens on Oct 5, one
--      under 16). The app on this branch reads the profile list without
--      those two columns and asks this for its own. Migration 120 then
--      takes the two columns away from everyone else; it must wait until
--      that app is on the website and on every phone (see 120).
--
-- Not changed, said plainly (each needs an owner decision):
--   * Whether an account is private stays on every profile row, readable by
--     any signed-in account. A teen account starts private, and on Oct 5
--     every private account was a teen's, so "private" reads as "teen".
--     Hiding it would change how following works for everyone.
--   * The town typed on a profile (location) and the tennis profile
--     (including tournament dates and places) are on every profile row as
--     before; the app shows a private account's tennis profile only to
--     approved followers, and search no longer finds or shows towns.
--   * New on CourtSide (63) still shows public 16 and 17 year olds to
--     adults, by its own rule.
--
-- Tried on the live database on Oct 5, inside a transaction that was then
-- undone (nothing was saved). See the end of this file.
--
-- Needs 21 (blocks), 104 (town position) and 109 (age off the profile
-- rows), all live. Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
-- Stop before changing anything if the database is not the shape this file
-- was written against (Oct 5, after 109).
do $$
declare
  -- md5 of each function's body as this file writes it (so a second run passes).
  mine constant text[][] := array[
    ['blocked_me', 'fdd2149e37ec57150f109a63690eb83a'],
    ['my_city_at', 'e9bdf013d7e6283f695e4eafb942774d']
  ];
  now_is text;
begin
  if to_regclass('public.blocks') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'blocks' and column_name = 'blocker_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'blocks' and column_name = 'blocked_id') then
    raise exception 'Migration 118 stopped before changing anything: the blocks table (migration 21) is not there. Ask Claude to look.';
  end if;
  -- Who blocked whom stays unreadable from the app: row security on, no rules.
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.blocks'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blocks') then
    raise exception 'Migration 118 stopped before changing anything: the blocks table can be read some other way now. Ask Claude to look.';
  end if;
  -- 109 has run: no profile row carries an age.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'age_group') then
    raise exception 'Migration 118 stopped before changing anything: profiles still carry age_group, so migration 109 has to run first.';
  end if;
  -- 49/104: the town position is where my_city_at reads it.
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name in ('city_lat', 'city_lng')) <> 2 then
    raise exception 'Migration 118 stopped before changing anything: profiles has no town position (city_lat, city_lng). Ask Claude to look.';
  end if;
  -- Profiles are read the way this file says: every row signed in, none signed out.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                 and policyname = 'profiles are public' and cmd = 'SELECT' and permissive = 'PERMISSIVE' and qual = 'true')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                 and policyname = 'signed out see no profiles' and cmd = 'SELECT' and permissive = 'RESTRICTIVE' and roles = '{anon}' and qual = 'false')
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd in ('SELECT', 'ALL')
                and policyname not in ('profiles are public', 'signed out see no profiles')) then
    raise exception 'Migration 118 stopped before changing anything: who can read profiles changed after Oct 5. Ask Claude to look.';
  end if;
  -- A blocked_me or my_city_at that is not this file's is never replaced.
  for i in 1 .. array_length(mine, 1) loop
    select md5(p.prosrc) into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = mine[i][1];
    if now_is is not null and now_is <> mine[i][2] then
      raise exception 'Migration 118 stopped before changing anything: a different % already exists. Ask Claude to look.', mine[i][1];
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------- 1. blocked_me
-- The accounts that have blocked you (yours to know, and only yours). Empty
-- signed out.
create or replace function public.blocked_me()
returns setof uuid language sql stable security definer set search_path = public as $$
  select b.blocker_id from public.blocks b
  where auth.uid() is not null and b.blocked_id = auth.uid()
$$;
revoke all on function public.blocked_me() from public, anon;
grant execute on function public.blocked_me() to authenticated;

-- ----------------------------------------------------------- 2. my_city_at
-- Your own town position (about 1 km, 104), and nobody else's. Nothing
-- signed out.
create or replace function public.my_city_at()
returns table (lat double precision, lng double precision) language sql stable security definer set search_path = public as $$
  select p.city_lat, p.city_lng from public.profiles p
  where auth.uid() is not null and p.id = auth.uid()
$$;
revoke all on function public.my_city_at() from public, anon;
grant execute on function public.my_city_at() to authenticated;

commit;

-- ------------------------------------------------------- 3. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) Who may call them (expect anon false, authenticated true, twice):
-- select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
--        has_function_privilege('authenticated', p.oid, 'execute') as signed_in
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('blocked_me', 'my_city_at');
--
-- (b) They read nobody's age (expect false, twice):
-- select proname, prosrc ~* 'age_group|known_adult' from pg_proc where proname in ('blocked_me', 'my_city_at');
--
-- ------------------------------------------------------- 4. what the live try showed (Oct 5)
-- 118 run twice, then 120 run twice, in one transaction, then undone (and
-- checked afterwards: nothing was kept). As a signed-in adult who does not
-- follow @omuchitaletennis (a public teen account) and is not followed by
-- them, reading profiles the way the app now does (named columns): found by
-- the exact handle, part of the handle ("chitale"), the start of the name
-- ("om") and a word of it ("chit"); the teen's row has exactly the same
-- fields as an adult's, none about age or town position; all 26 rows read.
-- After 120: another account's town position (a teen under 16 with one on
-- file) and a read with "*" are refused; their own (my_city_at) comes back,
-- and saving it still works and is still rounded (104); the first-sign-in
-- profile upsert still works; groups near you (discover_groups) still runs.
-- open_to_you (what "Players you might know" asks): the teen closed to that
-- adult, another adult open. The teen's settings row and map spot read as
-- nothing; the map leaves them out; a new chat still says teen_closed; a
-- session tag still says teen_closed (both the question and tag_session).
-- blocked_me(): empty for that adult; for an adult the teen blocked (made
-- inside the test) it lists the teen; the teen's own block is not listed
-- for the teen. Signed out: 0 profiles; blocked_me() and my_city_at()
-- refuse (permission denied). 120 alone (without 118) stops at its check.
--   RESULT md5=fdd2149e37ec57150f109a63690eb83a/e9bdf013d7e6283f695e4eafb942774d
--   stranger_ok=true by_handle=1 by_part_handle=1 by_part_name=1
--   by_name_start=1 shape_same=true age_or_city_keys=0 named_rows=26/26
--   teen_city=[permission denied for table profiles] (u16=true)
--   star=[permission denied for table profiles] my_city=35.78,-78.64
--   (stored 35.78,-78.64) save=[saved / upserted] my_city_after=35.79,-78.65
--   groups=[ran] open_teen=false open_adult=true teen_settings_rows=0
--   teen_spot_rows=0 map_has_teen=0 chat=[teen_closed] tag_refusal=teen_closed
--   tag=[teen_closed] adult_blocked_me=0 blocked_sees_teen_in_list=1
--   teen_own_block_listed=0 teen_own_city=1 anon_profiles=0
--   anon_call=[permission denied for function blocked_me / permission denied
--   for function my_city_at] exec anon=f/f authed=t/t col auth_city=f
--   anon_city=f auth_handle=t auth_private=t
