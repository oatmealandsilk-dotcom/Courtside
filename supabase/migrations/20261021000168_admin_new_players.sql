-- CourtSide · migration 20261021000168: Admin -> Welcome new players lists
-- every new player, not only the ones who posted (Oct 20 sweep, item R4:
-- "Welcome every new player, not just posters").
--
-- What it is for: Settings -> Admin -> Welcome new players only listed first
-- posts, and most new players never post. Of the 15 who joined the week of
-- Oct 12, 2 came back the next day. A follow (and, for adults, a short hello)
-- from a real person on day one is the strongest reason to come back, and at
-- about 15 sign-ups a week it can be done by hand.
--
-- In plain words, this file adds one thing:
--   admin_new_players(days): admins only. Everyone who made an account in
--   the last N days (7 unless asked, never more than 30, at most 200 people),
--   newest first, each with:
--     * id and when they joined (their name, handle, town and photo the app
--       already has, as it has every profile);
--     * adult: true only when their birthday on file says 18 or over
--       (known_adult, migration 109). A teen, or someone who gave no
--       birthday, is false. The app offers "Say hi" (a message) only when it
--       is true; everyone else gets only the Follow button, per the teen
--       rules. Their age itself is never sent, only this yes or no, and only
--       to an admin.
--     * posted: whether they have posted anything yet (a post an admin took
--       down does not count).
--   Left out: suspended accounts, the admin's own account, and anyone the
--   admin has blocked or who has blocked the admin.
--
-- Nothing already saved changes. No alert is sent by this file: a follow
-- sends the usual "started following you" alert, under the person's own
-- alert switches, exactly as any follow does. Needs migrations 21 (blocks),
-- 23 (is_admin, suspended_at) and 109 (known_adult), all live. Stops before
-- changing anything if one is missing, or if admin_new_players already exists
-- and is not this file's. Safe to run more than once.
--
-- ------------------------------------------------------------- HOW TO RUN IT
-- Supabase -> SQL Editor -> New query, paste this whole file, press Run.
-- "Success. No rows returned" means it is in. Anything else: nothing was
-- changed; the message says why.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  r record;
begin
  if to_regclass('public.profiles') is null or to_regclass('public.posts') is null or to_regclass('public.blocks') is null
     or to_regprocedure('public.is_admin()') is null or to_regprocedure('public.known_adult(uuid)') is null then
    raise exception 'Migration 168 stopped before changing anything: the profiles, posts and blocks tables and migrations 23 (is_admin) and 109 (known_adult) have to be there first.';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
       and column_name in ('created_at', 'suspended_at')) <> 2
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'removed_at') then
    raise exception 'Migration 168 stopped before changing anything: profiles.created_at, profiles.suspended_at (23) or posts.removed_at (108) is missing.';
  end if;
  for r in select p.prosrc as src from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'admin_new_players' loop
    if position('new_players_168' in r.src) = 0 then
      raise exception 'Migration 168 stopped before changing anything: public.admin_new_players already exists and is not this file''s.';
    end if;
  end loop;
end $$;

-- ----------------------------------------------------- 1. admin_new_players
drop function if exists public.admin_new_players(integer);
create function public.admin_new_players(p_days integer default 7)
returns table (id uuid, joined_at timestamptz, adult boolean, posted boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  -- new_players_168
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    select p.id, p.created_at, public.known_adult(p.id),
           exists (select 1 from public.posts x where x.author_id = p.id and x.removed_at is null)
    from public.profiles p
    where p.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30))
      and p.suspended_at is null
      and p.id <> auth.uid()
      and not exists (select 1 from public.blocks b
                      where (b.blocker_id = auth.uid() and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
    order by p.created_at desc, p.id
    limit 200;
end $$;

revoke all on function public.admin_new_players(integer) from public, anon, authenticated;
grant execute on function public.admin_new_players(integer) to authenticated;

-- ------------------------------------------------- 2. it did what it says
do $$
begin
  if has_function_privilege('anon', 'public.admin_new_players(integer)', 'execute') then
    raise exception 'migration 168: admin_new_players must not be open to signed-out visitors';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ------------------------------------------------- 3. checks to run afterwards
-- Read-only. As an admin in the app, Settings -> Admin -> Welcome new players
-- shows "Joined this week" above the first posts. In the SQL editor (which
-- runs as no one, so is_admin() is false) the function says "admins only";
-- to count what it would list:
-- select count(*), count(*) filter (where public.known_adult(id)) as adults
-- from public.profiles where created_at > now() - interval '7 days' and suspended_at is null;
