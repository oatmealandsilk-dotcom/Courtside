-- CourtSide · migration 118: teens can be found in search, and someone who
-- blocked you is not.
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if the check below fails, it stops and
-- nothing at all changes. Until it runs, the app works exactly as before (it
-- asks for the list this file adds, finds no such function, and carries on).
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
-- since 109 no profile row says how old anyone is, so search cannot tell a
-- teen from an adult and every row has the same fields. Signed out, nobody
-- reads any profile (109). Nothing in the app left teens out of search
-- either. So this file changes nothing about who can be found or what a
-- profile shows, and nothing about any teen rule.
--
-- What it adds: the one thing search could not do on the phone. It left out
-- people you blocked, but not people who blocked you, because who blocked
-- you lives in a table nobody can read from the app (public.blocks, 21).
-- That matters most for a teen: a teen who blocks someone should drop out of
-- that person's search, the way Instagram does it. blocked_me() hands the
-- signed-in account the list of accounts that have blocked it, and the app
-- (same branch) leaves them out of Search, the Find Players search, the @
-- list and "Players you might know" (the same rule for every account, so it
-- says nothing about anyone's age). The app also leaves suspended accounts
-- out of those lists (their page already only says "unavailable"); that
-- needs nothing from the database.
--   * Signed-in accounts only; nothing for signed-out readers.
--   * It answers only about the account asking, never about anyone else.
--   * It tells nobody anything new: blocked_with(other) (21) already answers
--     "is there a block between me and this account?" for any account, one
--     at a time. This is the same answer for all of them at once.
--   * Nobody's age is read or needed (109's daily limit is for answers that
--     depend on age; this one does not).
--
-- Not changed (said plainly): a teen's profile shows strangers exactly what
-- it did before (a private account: name, handle, photo, bio, city and the
-- Follow button, which sends a request); new chats, tags, the map, court
-- pages, New on CourtSide and every other teen rule are untouched.
--
-- Tried on the live database on Oct 5, inside a transaction that was then
-- undone (nothing was saved). See the end of this file.
--
-- Needs 21 (blocks) and 109 (age off the profile rows), both live. Safe to
-- run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
-- Stop before changing anything if the database is not the shape this file
-- was written against (Oct 5, after 109).
do $$
declare
  -- md5 of blocked_me()'s body as this file writes it (so a second run passes).
  mine constant text := 'fdd2149e37ec57150f109a63690eb83a';
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
  -- Profiles are read the way this file says: every row signed in, none signed out.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                 and policyname = 'profiles are public' and cmd = 'SELECT' and permissive = 'PERMISSIVE' and qual = 'true')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                 and policyname = 'signed out see no profiles' and cmd = 'SELECT' and permissive = 'RESTRICTIVE' and roles = '{anon}' and qual = 'false')
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd in ('SELECT', 'ALL')
                and policyname not in ('profiles are public', 'signed out see no profiles')) then
    raise exception 'Migration 118 stopped before changing anything: who can read profiles changed after Oct 5. Ask Claude to look.';
  end if;
  -- A blocked_me that is not this file's is never replaced.
  select md5(p.prosrc) into now_is from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'blocked_me';
  if now_is is not null and now_is <> mine then
    raise exception 'Migration 118 stopped before changing anything: a different blocked_me already exists. Ask Claude to look.';
  end if;
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

commit;

-- ------------------------------------------------------- 2. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) Who may call it (expect anon false, authenticated true):
-- select has_function_privilege('anon', 'public.blocked_me()', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.blocked_me()', 'execute') as signed_in;
--
-- (b) It reads nobody's age (expect false):
-- select prosrc ~* 'age_group|known_adult' from pg_proc where proname = 'blocked_me';
--
-- ------------------------------------------------------- 3. what the live try showed (Oct 5)
-- Run twice in one transaction, then undone. As a signed-in adult who does
-- not follow @omuchitaletennis (a public teen account) and is not followed
-- by them: found by the exact handle, by part of the handle ("chitale"), by
-- the start of the name ("om") and by a word of it ("chit"); the teen's
-- profile row has exactly the same fields as an adult's, none about age;
-- their settings row (age, birthday) and map spot read as nothing; the map
-- (map_players over all of North Carolina) leaves them out; a new chat
-- still says teen_closed; a session tag still says teen_closed (both the
-- question and tag_session itself). blocked_me(): empty for that adult;
-- for an adult the teen blocked (made inside the test), it lists the teen;
-- the teen's own block is not listed for the teen. Signed out: 0 profiles,
-- and blocked_me() refuses (permission denied).
--   RESULT md5=fdd2149e37ec57150f109a63690eb83a stranger_ok=true by_handle=1
--   by_part_handle=1 by_part_name=1 by_name_start=1 shape_same=true
--   age_keys=0 teen_settings_rows=0 teen_spot_rows=0 map_has_teen=0
--   chat=[teen_closed] tag_refusal=teen_closed tag=[teen_closed]
--   adult_blocked_me=0 blocked_sees_teen_in_list=1 teen_own_block_listed=0
--   anon_profiles=0 anon_call=[permission denied for function blocked_me]
--   anon_exec=f authed_exec=t
