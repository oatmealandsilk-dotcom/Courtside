-- CourtSide · migration 20261017000162: the birthday becomes optional
-- (Oct 17: Apple turned down build 17 under guideline 5.1.1(v): "Update the
-- app to not require users to provide the following personal information:
-- Date of birth.")
--
-- What it is for: until now every account had to give a birthday before it
-- could go any further. Now the birthday page has a "Skip for now" choice:
-- the player says "I'm 13 or older" (a yes/no, not personal information) and
-- goes on without a birthday. This file is the server's half of that:
--
--   1. user_state.age_skipped_at: when an account skipped the birthday. It
--      is what stops the app asking again on every launch, on every phone.
--      Only skip_birthday() below can set it (a guard puts back whatever an
--      app tries to write there itself), the same way only set_birth_date()
--      can set a birthday.
--   2. skip_birthday(): "I'm 13 or older, no birthday for now". It notes the
--      skip once and makes the account private to start with, the same as
--      a teen account starts private (set_birth_date, migration 109).
--      Why private: with no birthday nobody knows whether this is a
--      13-year-old, so it gets the teen rules, and teens start private. The
--      player can make it public again in Settings at any time.
--      An account whose age is already on file is left exactly as it is.
--
-- Nothing else changes, because the server already treats "no birthday" as
-- "not known to be an adult" everywhere. Checked Oct 17, every function that
-- reads an age: they all go through known_adult(), which answers false when
-- there is no age (coalesce(..., false)), or they ask for age_group = 'adult'
-- outright (new_on_courtside), so an account with no birthday gets the teen
-- rules: strangers cannot message it or tag it, it is not on the map for
-- strangers, its Hidden words stay on, it is not in "Players joining near
-- you" or "New on CourtSide", and it cannot check in at a court. Step 0 below
-- stops if known_adult() has changed since then.
--
-- Needs migration 109 (live). Safe to run more than once.
--
-- ------------------------------------------------------------- HOW TO RUN IT
-- Supabase -> SQL Editor -> New query, paste this whole file, press Run.
-- "Success. No rows returned" means it is in. Anything else: nothing was
-- changed; the message says why.
--
-- DRY RUN first (changes nothing): paste the whole file, change the very
-- last line from "commit;" to "rollback;", press Run. Success there means
-- the real run will work too.
--
-- To see how many accounts have skipped (paste without the leading "-- "):
-- select count(*) filter (where age_skipped_at is not null and age_group is null) as skipped_no_birthday, count(*) filter (where age_group is not null) as birthday_on_file from public.user_state;

begin;

-- ------------------------------------------------------------------ 0. check
do $$
begin
  if to_regclass('public.user_state') is null or to_regclass('public.profiles') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'user_state' and column_name = 'age_group')
     or to_regprocedure('public.known_adult(uuid)') is null
     or to_regprocedure('public.set_birth_date(date)') is null then
    raise exception 'Migration 162 stopped before changing anything: migration 109 has to run first.';
  end if;
  -- known_adult as migration 109 wrote it (the same body migration 119 checked):
  -- no age on file is not an adult. If it changed, this file's reading is out of date.
  if (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'known_adult')
     <> 'a79e745befd4374ea124ccf1692145a2' then
    raise exception 'Migration 162 stopped before changing anything: known_adult changed after Oct 5. Ask Claude to check that no birthday still means not an adult.';
  end if;
  if public.known_adult(gen_random_uuid()) then
    raise exception 'Migration 162 stopped before changing anything: an account with no age counts as an adult. Ask Claude to look.';
  end if;
  if to_regprocedure('public.skip_birthday()') is not null
     and not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'skip_birthday'
                     and p.prosrc like '%courtside.age_skip%') then
    raise exception 'Migration 162 stopped before changing anything: a skip_birthday function that is not this file''s is already there.';
  end if;
end $$;

-- -------------------------------------------------------- 1. the skip column
alter table public.user_state add column if not exists age_skipped_at timestamptz;

-- Only skip_birthday() writes it: anything else the app sends there is put back.
create or replace function public.guard_age_skipped()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('courtside.age_skip', true), '') <> 'on' then
    if tg_op = 'UPDATE' then new.age_skipped_at := old.age_skipped_at;
    else new.age_skipped_at := null;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_age_skipped() from public, anon, authenticated;
drop trigger if exists guard_age_skipped on public.user_state;
create trigger guard_age_skipped before insert or update on public.user_state
  for each row execute function public.guard_age_skipped();

-- -------------------------------------------------------- 2. skip_birthday()
-- Returns 'teen' or 'adult' when the age is already on file (nothing
-- changes), or 'skipped'. The first skip makes the account private; a
-- second one (another phone, say) changes nothing.
create or replace function public.skip_birthday()
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  had_age text;
  had_skip timestamptz;
begin
  if me is null then raise exception 'not signed in'; end if;
  select age_group, age_skipped_at into had_age, had_skip from public.user_state where user_id = me;
  if had_age is not null then return had_age; end if;
  if had_skip is not null then return 'skipped'; end if;
  perform set_config('courtside.age_skip', 'on', true);
  insert into public.user_state (user_id, age_skipped_at) values (me, now())
    on conflict (user_id) do update set age_skipped_at = coalesce(public.user_state.age_skipped_at, excluded.age_skipped_at);
  perform set_config('courtside.age_skip', 'off', true);
  -- No birthday: the teen rules, so private to start with, as a teen account is.
  update public.profiles set is_private = true where id = me;
  return 'skipped';
end $$;
revoke all on function public.skip_birthday() from public, anon;
grant execute on function public.skip_birthday() to authenticated;

-- ------------------------------------------------------------------ 3. check
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.user_state'::regclass and tgname = 'guard_age_skipped' and not tgisinternal)
     or not has_function_privilege('authenticated', 'public.skip_birthday()', 'execute')
     or has_function_privilege('anon', 'public.skip_birthday()', 'execute') then
    raise exception 'Migration 162 did not finish as expected. Nothing was changed.';
  end if;
end $$;

commit;
