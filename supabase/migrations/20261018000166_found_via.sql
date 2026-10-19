-- CourtSide · migration 20261018000166: "How did you find CourtSide?"
-- (Oct 18, owner: "Can we see where the sign up users are coming from", then,
-- about one optional question at sign-up: "Add the question, as long as it's
-- for the benefit of the app and does not take away").
--
-- What it is for: migration 165 counts sign-ups that came through one of our
-- website links. Most people will not: they find us on Instagram or TikTok,
-- hear from a friend, or search the App Store, and then open the app with no
-- link at all. So setup's last page (Your game, above Finish) now has one optional
-- line of chips,
-- "How did you find CourtSide?" (Instagram, TikTok, Facebook, A friend,
-- App Store, Other). Nobody has to answer: Finish works without it. The
-- Links page (Settings -> Admin -> Links) shows how many picked each, for the
-- accounts made in the last 7 or 30 days.
--
-- In plain words, this file:
--   1. found_via: a private list, one line per account that answered: the
--      account, its answer (one of the six), and when it answered. Nobody can
--      read or write it from the app or the website; only the two functions
--      below touch it. (Why not a column on user_state: its owner can change
--      their own user_state row through its own rules, so they could write
--      anything there, and at any time.) Deleting an account deletes its line.
--   2. set_found_via(choice): the one way in, for signed-in accounts only.
--      It saves the account's own answer and nobody else's. Only the six
--      answers are taken; an empty answer takes it back. An answer can be
--      given or changed in the first 7 days after the account was made, then
--      it stays as it is (a quiet no-op, so an old phone retrying does not
--      show an error).
--   3. admin_found_via(days), admins only: for the accounts made in the last
--      N days, how many picked each answer, and how many did not answer.
--      Only counts, never who.
--
-- Nothing here changes anything already saved. Needs migrations 23 (is_admin)
-- and the profiles table (both live). Stops before changing anything if
-- something already uses these names and is not this file's. Safe to run
-- more than once.
--
-- ------------------------------------------------------------- HOW TO RUN IT
-- Supabase -> SQL Editor -> New query, paste this whole file, press Run.
-- "Success. No rows returned" means it is in. Anything else: nothing was
-- changed; the message says why.
--
-- --------------------------------------------- SEEING THE NUMBERS (SQL editor)
-- (a) Answers for accounts made in the last 30 days:
-- select f.choice, count(*) from public.found_via f join public.profiles p on p.id = f.user_id where p.created_at > now() - interval '30 days' group by 1 order by 2 desc;

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  r record;
begin
  if to_regclass('public.profiles') is null or to_regprocedure('public.is_admin()') is null then
    raise exception 'Migration 166 stopped before changing anything: the profiles table and migration 23 (is_admin) have to be there first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'created_at') then
    raise exception 'Migration 166 stopped before changing anything: profiles has no created_at.';
  end if;
  if to_regclass('public.found_via') is not null and (
       select array_agg(column_name::text order by column_name) from information_schema.columns
        where table_schema = 'public' and table_name = 'found_via') is distinct from array['answered_at', 'choice', 'user_id'] then
    raise exception 'Migration 166 stopped before changing anything: public.found_via already exists and is not this file''s.';
  end if;
  for r in select p.proname, p.prosrc as src from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname in ('set_found_via', 'admin_found_via') loop
    if position('found_via_166' in r.src) = 0 then
      raise exception 'Migration 166 stopped before changing anything: public.% already exists and is not this file''s.', r.proname;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------- 1. the private list
create table if not exists public.found_via (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- One of the six chips. The app shows them as Instagram, TikTok, Facebook,
  -- A friend, App Store, Other.
  choice text not null constraint found_via_choice
    check (choice in ('instagram', 'tiktok', 'facebook', 'friend', 'app_store', 'other')),
  answered_at timestamptz not null default now()
);
alter table public.found_via enable row level security;
-- Private: no rule lets anyone read or write it from the app or the website.
revoke all on table public.found_via from public, anon, authenticated;

-- ---------------------------------------------------- 2. the one way in
-- Returns true when the answer was saved (or taken back), false when it was
-- not taken (an answer that is not one of the six, or after the first 7 days).
create or replace function public.set_found_via(p_choice text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  -- found_via_166
  me uuid := auth.uid();
  c text := nullif(lower(btrim(coalesce(p_choice, ''))), '');
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if c is not null and c not in ('instagram', 'tiktok', 'facebook', 'friend', 'app_store', 'other') then
    return false;
  end if;
  -- Only in the first 7 days of the account.
  if not exists (select 1 from public.profiles p where p.id = me and p.created_at > now() - interval '7 days') then
    return false;
  end if;
  if c is null then
    delete from public.found_via where user_id = me;
  else
    insert into public.found_via (user_id, choice, answered_at) values (me, c, now())
    on conflict (user_id) do update set choice = excluded.choice, answered_at = excluded.answered_at;
  end if;
  return true;
end $$;
revoke all on function public.set_found_via(text) from public, anon;
grant execute on function public.set_found_via(text) to authenticated;

-- -------------------------------------------------- 3. the admin numbers
-- Every answer is listed, even at 0, in the order the app shows them, then
-- 'not_answered'.
create or replace function public.admin_found_via(p_days integer default 30)
returns table (choice text, people bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  -- found_via_166
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 3650)));
begin
  if not public.is_admin() then
    raise exception 'Only admins can see these numbers.' using errcode = '42501';
  end if;
  return query
  with joined as (
    select coalesce(f.choice, 'not_answered') as c
      from public.profiles p
      left join public.found_via f on f.user_id = p.id
     where p.created_at >= since
  )
  select k.c, count(j.c)
    from unnest(array['instagram', 'tiktok', 'facebook', 'friend', 'app_store', 'other', 'not_answered']) with ordinality as k(c, n)
    left join joined j on j.c = k.c
   group by k.c, k.n
   order by k.n;
end $$;
revoke all on function public.admin_found_via(integer) from public, anon;
grant execute on function public.admin_found_via(integer) to authenticated;

-- ------------------------------------------------- 4. it did what it says
do $$
begin
  if has_table_privilege('anon', 'public.found_via', 'select') or has_table_privilege('authenticated', 'public.found_via', 'select')
     or has_table_privilege('authenticated', 'public.found_via', 'insert') or has_table_privilege('authenticated', 'public.found_via', 'update') then
    raise exception 'migration 166: the private list can be read or written directly';
  end if;
  if has_function_privilege('anon', 'public.set_found_via(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_found_via(text)', 'execute')
     or has_function_privilege('anon', 'public.admin_found_via(integer)', 'execute') then
    raise exception 'migration 166: who may call the functions is wrong';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ------------------------------------------------------------- DRY RUN
-- To try this file without keeping anything: run it with its "commit;" line
-- (just above) replaced by the lines below, each without its leading "-- ".
-- It pretends to be the newest account for a moment, answers Instagram, then
-- changes it to A friend, shows the answer, then undoes it all.
--
-- do $$ declare me uuid := (select id from public.profiles order by created_at desc limit 1); begin
--   update public.profiles set created_at = now() where id = me;
--   perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
--   perform public.set_found_via('instagram');
--   perform public.set_found_via('friend');
--   raise notice 'dry run: saved answer % (expect friend)', (select choice from public.found_via where user_id = me);
-- end $$;
-- rollback;

-- ------------------------------------------------- 5. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) Who may call what (expect false, true, false):
-- select has_function_privilege('anon', 'public.set_found_via(text)', 'execute'),
--        has_function_privilege('authenticated', 'public.set_found_via(text)', 'execute'),
--        has_table_privilege('authenticated', 'public.found_via', 'select');
--
-- (b) The answers so far (only counts):
-- select choice, count(*) from public.found_via group by 1 order by 2 desc;
