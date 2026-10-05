-- CourtSide · migration 120: nobody reads anyone else's town position.
--
-- NOT APPLIED — needs the owner's OK, and it has an ORDER:
--   1. Migration 118 has run (this file checks).
--   2. The app from the branch feat/teens-in-search is live on the website
--      (the GitHub Pages deploy after the push has finished), AND
--   3. it is on the phones too (the over-the-air update is published and
--      testers have opened the app once since).
-- An app from before that branch reads the profile list with "*" (every
-- column); after this file such a read is refused, so that older app would
-- show nobody at all until it updates. Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if the check below fails, it stops and
-- nothing at all changes. Safe to run more than once.
--
-- The problem (live Oct 5): "Use my location" saves a town position on the
-- profile (profiles.city_lat / city_lng; 104 keeps it to about 1 km, often
-- where the phone was at home). Every signed-in account can read every
-- profile row, so anyone who finds a teen in search could read it, even an
-- under-16 who is never on the map. On Oct 5, 7 teens had one, 1 under 16.
-- The app only ever uses your own (since this branch, from my_city_at, 118).
--
-- What it does: signed-in and signed-out readers lose read access to those
-- two columns of profiles, and keep every other column exactly as before
-- (signed out still reads no rows at all, 109). Your own comes from
-- my_city_at(). Nothing else changes: saving your town position works as
-- before (104 still rounds it), and the server's own rules that use town
-- positions (hit alerts near a hit, groups near you) run as the server and
-- are untouched.
--
-- For later: after this, the app must always name the profile columns it
-- reads (src/data/remote.ts, PROFILE_COLUMNS); a read with "*" is refused.
-- A column added to profiles after this is NOT readable by the app until a
-- migration grants it ("grant select (new_column) on public.profiles to
-- authenticated;") and PROFILE_COLUMNS names it.
--
-- To undo (puts back today's read access, town position included):
--   grant select on public.profiles to anon, authenticated;
--
-- Tried on the live database on Oct 5 together with 118, inside a
-- transaction that was then undone (nothing was saved). See 118's end.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  bad text;
begin
  -- 118 has run: your own town position can be asked for.
  if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'my_city_at'
                 and md5(p.prosrc) = 'e9bdf013d7e6283f695e4eafb942774d' and p.prosecdef)
     or not has_function_privilege('authenticated', 'public.my_city_at()', 'execute') then
    raise exception 'Migration 120 stopped before changing anything: run migration 118 first.';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name in ('city_lat', 'city_lng')) <> 2 then
    raise exception 'Migration 120 stopped before changing anything: profiles has no town position (city_lat, city_lng). Ask Claude to look.';
  end if;
  -- Nothing the app's own role runs reads those columns, other than 104's
  -- rounding trigger (which only touches the row being saved): functions
  -- that do not run as the server, row rules, views, live updates.
  select string_agg(n.nspname || '.' || p.proname, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog', 'information_schema') and not p.prosecdef
     and p.prosrc ~* 'city_l(at|ng)' and p.proname <> 'round_city_position';
  if bad is not null then
    raise exception 'Migration 120 stopped before changing anything: % read the town position without running as the server. Ask Claude to look.', bad;
  end if;
  if exists (select 1 from pg_policies where coalesce(qual, '') ~* 'city_l(at|ng)' or coalesce(with_check, '') ~* 'city_l(at|ng)') then
    raise exception 'Migration 120 stopped before changing anything: a row rule reads the town position. Ask Claude to look.';
  end if;
  if exists (select 1 from pg_depend d join pg_rewrite r on r.oid = d.objid
             where d.refobjid = 'public.profiles'::regclass and d.classid = 'pg_rewrite'::regclass and r.ev_class <> 'public.profiles'::regclass) then
    raise exception 'Migration 120 stopped before changing anything: a view reads profiles. Ask Claude to look.';
  end if;
  if exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'profiles') then
    raise exception 'Migration 120 stopped before changing anything: profiles sends live updates. Ask Claude to look.';
  end if;
  -- Profiles are read the way this file says: every row signed in, none signed out.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                 and policyname = 'profiles are public' and cmd = 'SELECT' and permissive = 'PERMISSIVE' and qual = 'true')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                 and policyname = 'signed out see no profiles' and cmd = 'SELECT' and permissive = 'RESTRICTIVE' and roles = '{anon}' and qual = 'false')
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd in ('SELECT', 'ALL')
                and policyname not in ('profiles are public', 'signed out see no profiles')) then
    raise exception 'Migration 120 stopped before changing anything: who can read profiles changed after Oct 5. Ask Claude to look.';
  end if;
  -- Nobody else reads profiles through PUBLIC.
  if has_table_privilege('public', 'public.profiles', 'select') then
    raise exception 'Migration 120 stopped before changing anything: everyone (PUBLIC) can read profiles. Ask Claude to look.';
  end if;
end $$;

-- ------------------------------------------------------- 1. read access
-- Taking away read access on the whole table also takes away any per-column
-- access; then every column but the two is given back, as it was.
revoke select on public.profiles from anon, authenticated;
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name not in ('city_lat', 'city_lng');
  execute format('grant select (%s) on public.profiles to anon, authenticated', cols);
  -- What it left, before it is kept.
  if has_column_privilege('authenticated', 'public.profiles', 'city_lat', 'select')
     or has_column_privilege('authenticated', 'public.profiles', 'city_lng', 'select')
     or has_column_privilege('anon', 'public.profiles', 'city_lat', 'select')
     or not has_column_privilege('authenticated', 'public.profiles', 'handle', 'select')
     or not has_column_privilege('authenticated', 'public.profiles', 'is_private', 'select') then
    raise exception 'Migration 120 stopped: read access did not come out as planned; nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 2. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
-- Expect false, false, true:
-- select has_column_privilege('authenticated', 'public.profiles', 'city_lat', 'select') as town_position,
--        has_column_privilege('anon', 'public.profiles', 'city_lat', 'select') as town_position_signed_out,
--        has_column_privilege('authenticated', 'public.profiles', 'handle', 'select') as handle;
