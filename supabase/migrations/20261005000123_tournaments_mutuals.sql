-- CourtSide · migration 123: tournament plans only for friends who follow
-- each other.
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if a check below fails, it stops and
-- nothing at all changes. Safe to run more than once.
--
-- Order: it can run before or after the app from batch A is live, and
-- works with older apps too (see "Older apps" below). Best right after the
-- website has the batch A app, so nobody sees their own plans missing.
--
-- The owner, Oct 5: tournament plans (the place and date of a tournament
-- someone is going to) must not be readable by people who are not mutual
-- followers, for every account, so they say nothing about anyone's age.
--
-- Until now: the tennis profile is one bundle on the profile row
-- (profiles.profile), and every signed-in account can read every profile
-- row. Tournament plans (name, date, place, surface, level, entered or
-- watching) were inside it, so anyone signed in could read where and when
-- anyone, a teen included, would be. The app only showed a private
-- account's to approved followers, but the row itself was readable. On Oct 5
-- three accounts had plans on file. There is no separate list of past
-- results: the plans are the only tournament data, so all of it moves.
--
-- What it does, the same way migration 19 did for the coach notes:
--   1. Plans never stay on the profile row. As a profile is saved, the
--      database takes the plans out of the bundle and files them in the
--      owner's own settings row (user_state.private_profile), which only
--      they can read. Every plan already on a profile moves there now.
--   2. tournament_plans(): the plans the signed-in account may see: their
--      own, and those of each person they follow who follows them back.
--      Never anyone else's, whatever their age or whether the account is
--      private; never someone blocked either way, never a suspended
--      account's (to anyone but themselves). Nothing signed out. Nobody's
--      age is read, so the answer is the same for every account.
--   3. The app (batch A) reads its own plans from its settings row and
--      everyone else's from tournament_plans(); before this runs it shows
--      another person's plans only when the two follow each other, too.
--
-- Older apps. An app from before batch A does not know the plans moved: it
-- shows its own as empty, and saving the tennis profile sends whatever plans
-- it has (often none). So a save that does not say it knows (the batch A
-- app adds "tournamentsPrivate": true) only adds the plans it brings, or
-- updates the one on file with the same id; it never takes one away, and
-- sending none changes nothing. A save that says it knows keeps exactly
-- the plans it sends (none clears them).
-- A brand-new profile row never carries plans (the sign-up makes it without
-- any); if one ever did, they are dropped, not shown.
--
-- Needs 19 (the private settings bundle) and 21 (blocks). Asks
-- is_blocked_between (21), checked below to be as live on Oct 5. Changes
-- nothing about who can read profiles (so 121 runs as written, before or
-- after this). Adds no column.
--
-- Tried on the live database on Oct 5, inside a transaction that was then
-- undone (nothing was saved), after 116, 118, 119 and 122, run twice. The
-- three real accounts' plans moved to their settings rows exactly as they
-- were (3/3), and no profile row kept any; coach notes untouched (25). With
-- test accounts: a friend who follows each other with the owner saw the
-- plan; someone who follows one way, a stranger, and signed out did not
-- (signed out: refused); no profile row showed plans to anyone. An older
-- app's save with no plans changed nothing; with a new plan, added it; with
-- the same id, updated it. The batch A app's save kept exactly what it sent,
-- cleared with none, and was refused past 16 KB (23514). After a block the
-- friend no longer saw it. Then 121 on top, in a second undone run: its
-- checks passed, a save with plans and a town still worked, the friend
-- still saw the plan, and nobody else's town could be read.
--   RESULT 4_real_moved_exact=3/3 4_plans_left_on_profiles=0 4_M_mutual_sees_P=1
--   4_A_oneway_sees_P=0 4_S_stranger_sees_P=0 4_S_profile_row_has_plans=0/38
--   5_old_app_none=1 5_old_app_add=2 5_old_app_same_id=2 (renamed)
--   5_new_app_exact=[t-3] 5_new_app_clear=[] 5_new_app_too_long=23514
--   5_M_after_block=0 5_anon_plans=permission denied
--   md5 keep_tournaments_private=cceed1821780ab350a2300299f724980
--   tournament_plans=44d0b8787e5c2cdda52c08c5dc0e8f64

begin;

-- ------------------------------------------------------------------ 0. checks
do $$
declare
  -- Made here: absent before, or as this file leaves them (md5 of the body).
  mine constant text[][] := array[
    ['keep_tournaments_private', 'cceed1821780ab350a2300299f724980'],
    ['tournament_plans',         '44d0b8787e5c2cdda52c08c5dc0e8f64']
  ];
  -- Relied on and never rewritten here.
  kept constant text[][] := array[
    ['is_blocked_between',       'f7246d0dbae4888d3a96a1d317c9de5f'],
    ['keep_constraints_private', '2cafdecd2e52c320645d965e2bfc92bd']
  ];
  i int;
  now_is text;
  wrong text[] := '{}';
  bad text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'private_profile')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'profile')
     or to_regclass('public.follows') is null or to_regclass('public.blocks') is null then
    raise exception 'Migration 123 stopped before changing anything: migrations 19 and 21 have to run first.';
  end if;
  for i in 1 .. array_length(mine, 1) loop
    select coalesce(max(md5(p.prosrc)), 'absent') into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = mine[i][1];
    if now_is not in ('absent', mine[i][2]) then
      wrong := wrong || mine[i][1];
    end if;
  end loop;
  for i in 1 .. array_length(kept, 1) loop
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = kept[i][1]) <> 1
       or exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = kept[i][1]
                  and md5(p.prosrc) <> kept[i][2]) then
      wrong := wrong || kept[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 123 stopped before changing anything: % is not as this file expects (changed after Oct 5). Bring this file up to date first.', array_to_string(wrong, ', ');
  end if;
  -- Nothing else on the server reads the plans from the profile row (a
  -- later change would need looking at first).
  select string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname) into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('pg_catalog', 'information_schema') and p.prosrc ~* 'tournament'
      and not (n.nspname = 'public' and p.proname in ('keep_tournaments_private', 'tournament_plans'));
  if bad is not null then
    raise exception 'Migration 123 stopped before changing anything: % read tournament plans. Ask Claude to look.', bad;
  end if;
  select string_agg(viewname, ', ') into bad from pg_views
    where schemaname not in ('pg_catalog', 'information_schema') and definition ~* 'tournament';
  if bad is not null then
    raise exception 'Migration 123 stopped before changing anything: the views % read tournament plans. Ask Claude to look.', bad;
  end if;
  -- The trigger name is free, or this file's.
  if exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
             where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'keep_tournaments_private'
               and p.proname <> 'keep_tournaments_private') then
    raise exception 'Migration 123 stopped before changing anything: another trigger is called keep_tournaments_private. Ask Claude to look.';
  end if;
end $$;

-- ------------------------------------------- 1. plans off the profile row
-- Runs as a profile is saved (and on the move below). Takes the plans (and
-- the batch A app's "tournamentsPrivate" flag) out of the bundle, and files
-- them in the owner's settings row: exactly as sent when the app says it
-- knows; otherwise only plans not already on file are added (an older app
-- never knows what is on file, so it never takes any away).
create or replace function public.keep_tournaments_private()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sent jsonb;
  knows boolean;
  saved jsonb;
  keep jsonb;
begin
  if not (new.profile ? 'tournaments' or new.profile ? 'tournamentsPrivate') then return new; end if;
  sent := case when jsonb_typeof(new.profile -> 'tournaments') = 'array' then new.profile -> 'tournaments' else '[]'::jsonb end;
  knows := coalesce(new.profile ->> 'tournamentsPrivate', '') = 'true';
  -- No bigger than a whole profile may be (16 KB, 101): refused like that limit.
  if pg_column_size(sent) > 16384 then
    raise exception 'tournament plans are too long' using errcode = '23514';
  end if;
  new.profile := new.profile - 'tournaments' - 'tournamentsPrivate';
  -- A new profile row: no settings row can point at it yet (19 does the same).
  if tg_op <> 'UPDATE' then return new; end if;
  select us.private_profile -> 'tournaments' into saved from public.user_state us where us.user_id = new.id;
  if jsonb_typeof(saved) is distinct from 'array' then saved := null; end if;
  if knows then
    keep := sent;
    -- Nothing on file and nothing sent: nothing to write.
    if saved is null and jsonb_array_length(keep) = 0 then return new; end if;
  else
    -- An older app: a plan it sends is added, or replaces the one on file
    -- with the same id; nothing on file is ever taken away.
    if jsonb_array_length(sent) = 0 then return new; end if;
    keep := coalesce((
      select jsonb_agg(coalesce((select e.value from jsonb_array_elements(sent) e
                                  where e.value -> 'id' = s.value -> 'id' limit 1), s.value) order by s.ordinality)
        from jsonb_array_elements(coalesce(saved, '[]'::jsonb)) with ordinality s), '[]'::jsonb)
      || coalesce((
      select jsonb_agg(e.value order by e.ordinality)
        from jsonb_array_elements(sent) with ordinality e
       where not exists (select 1 from jsonb_array_elements(coalesce(saved, '[]'::jsonb)) s
                          where s.value -> 'id' = e.value -> 'id')), '[]'::jsonb);
    if saved is not null and keep = saved then return new; end if;
  end if;
  insert into public.user_state (user_id, private_profile)
    values (new.id, jsonb_build_object('tournaments', keep))
    on conflict (user_id) do update set private_profile = public.user_state.private_profile || excluded.private_profile;
  return new;
end $$;
revoke all on function public.keep_tournaments_private() from public, anon, authenticated;

drop trigger if exists keep_tournaments_private on public.profiles;
create trigger keep_tournaments_private before insert or update of profile on public.profiles
  for each row execute function public.keep_tournaments_private();

-- ------------------------------------------- 2. who may read them
-- Your own plans, and those of each person you follow who follows you back.
-- Only lists with something in them; a list bigger than a profile may hold
-- (16 KB, 101) is left out.
create or replace function public.tournament_plans()
returns table (user_id uuid, tournaments jsonb)
language sql stable security definer set search_path = public as $$
  select us.user_id, us.private_profile -> 'tournaments'
  from public.user_state us
  join public.profiles p on p.id = us.user_id
  where auth.uid() is not null
    and jsonb_typeof(us.private_profile -> 'tournaments') = 'array'
    and jsonb_array_length(us.private_profile -> 'tournaments') > 0
    and pg_column_size(us.private_profile -> 'tournaments') <= 16384
    and (us.user_id = auth.uid()
      or (p.suspended_at is null
          and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = us.user_id)
          and exists (select 1 from public.follows f where f.follower_id = us.user_id and f.following_id = auth.uid())
          and not public.is_blocked_between(auth.uid(), us.user_id)))
$$;
revoke all on function public.tournament_plans() from public, anon;
grant execute on function public.tournament_plans() to authenticated;

-- ------------------------------------------- 3. move what is on profiles now
-- Saving each bundle as it is runs the step above: the plans move to their
-- owner's settings row and leave the profile. Nothing else on the row changes.
update public.profiles set profile = profile where profile ? 'tournaments' or profile ? 'tournamentsPrivate';

-- --------------------------------------------------------------- 4. last check
do $$
declare bad text;
begin
  if exists (select 1 from public.profiles where profile ? 'tournaments' or profile ? 'tournamentsPrivate') then
    raise exception 'Migration 123 stopped: plans are still on a profile row. Nothing was changed.';
  end if;
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and ((p.proname = 'keep_tournaments_private' and md5(p.prosrc) <> 'cceed1821780ab350a2300299f724980')
        or (p.proname = 'tournament_plans' and md5(p.prosrc) <> '44d0b8787e5c2cdda52c08c5dc0e8f64')
        or (p.proname in ('keep_tournaments_private', 'tournament_plans') and (not p.prosecdef or p.prosrc ~* 'age_group|known_adult|birth_date'
            or has_function_privilege('anon', p.oid, 'execute')))
        or (p.proname = 'keep_tournaments_private' and has_function_privilege('authenticated', p.oid, 'execute'))
        or (p.proname = 'tournament_plans' and not has_function_privilege('authenticated', p.oid, 'execute')));
  if bad is not null or (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
                         and p.proname in ('keep_tournaments_private', 'tournament_plans')) <> 2
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'keep_tournaments_private' and t.tgenabled = 'O') then
    raise exception 'Migration 123 stopped: % did not come out as written. Nothing was changed.', coalesce(bad, 'the trigger');
  end if;
end $$;

commit;

-- ------------------------------------------------------- 5. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
-- (a) No plans left on any profile row (expect 0):
-- select count(*) from public.profiles where profile ? 'tournaments';
-- (b) Who may call it (expect anon false, app true):
-- select has_function_privilege('anon', 'public.tournament_plans()', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.tournament_plans()', 'execute') as app;
