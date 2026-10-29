-- CourtSide · migration 20261029000202: a new teen's "People you may know"
-- suggests other teens.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. All-or-nothing:
-- if a check fails, it stops and nothing at all changes. Safe to run more
-- than once. Undo: supabase/rollback/202_undo.sql.
--
-- Why (owner, Oct 29): "no coaches for teens for now, if they are teens we
-- could suggest them other teens". Since migration 64 nobody's age reaches
-- the app, so the app cannot pick teens out itself: this list does it on the
-- server and sends back ids only.
--
-- What it adds:
--   * teens_to_suggest(), no arguments: it only ever answers about you.
--   * teen_suggestions, a small table only the server writes or reads (no
--     one can read or change it from the app or the website): the one list
--     each new teen was given, and when.
--
-- The list is worked out ONCE per account and then frozen. The first call
-- picks it (by the town on your profile at that moment) and stores the ids;
-- every later call returns only those stored ids, checked again, and never
-- picks a fresh list. So changing the town on your profile and asking again
-- gives the same people (or fewer): nobody who says they are 15 can walk the
-- list town by town to find out who is a teen where.
--
--   * Asked by a known teen only: 13-17 by the birthday given (user_state
--     .age_group = 'teen'), not suspended, whose account is under 7 days old
--     (it is the sign-up's step 6; a grown-up who said they were 15 gets one
--     short list, once, not a standing way to look teens up). An account with
--     no birthday on file, or a known adult, gets nothing.
--   * Who is listed: known teens only (never an account with no birthday,
--     which may be an adult), public accounts only (a private account is never
--     put in front of someone it has not approved), not suspended, never you,
--     never anyone you already follow, never anyone blocked either way, never
--     anyone muted either way. Each later call checks all of this again on
--     the stored ids, so someone who has since gone private, been suspended,
--     been followed, blocked or muted (either way) drops off.
--   * Order: your town first (the town on both profiles: by the towns' centres
--     when both were picked from the search, within 30 miles, else by the
--     town's name), then the rest; within each, most recently active first
--     (the last day they opened the app, else the day they joined). At most 6.
--   * Only ids come back: never a town, a spot, a distance, a school or an
--     age. Each one listed counts toward the asker's 300 people a day
--     (age_rule_budget, migration 109) on the first call, as any answer about
--     the teen rules does; later calls return the same people and count
--     nothing more. If the first call finds nobody, nothing is stored (it
--     told the asker nothing), and a later call may look again.
--
-- Said plainly: being on this list tells the asker that someone is a teen.
-- That is the feature (teens see teens, as on Instagram), shown only to a
-- known teen, only during their first week, one list of at most 6 people.
--
-- Left as they are: every other function, every grant, every other table. The app's
-- other lists (players_in_town, new_on_courtside, suggestions) are unchanged.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  bad text;
begin
  -- Everything this rests on, exactly as it is live (Oct 29).
  select string_agg(w.sig, ', ') into bad
    from (values
      ('public.known_adult(uuid)', '{a79e745befd4374ea124ccf1692145a2}'::text[]),
      ('public.is_blocked_between(uuid, uuid)', '{f7246d0dbae4888d3a96a1d317c9de5f}'::text[]),
      ('public.age_rule_budget(uuid[])', '{9f020e0237d8c5e61e913cbc6d5f6923}'::text[])
    ) as w(sig, md5s)
   where not exists (select 1 from pg_proc p where p.oid = to_regprocedure(w.sig) and md5(p.prosrc) = any (w.md5s));
  if bad is not null then
    raise exception 'Migration 202 stopped before changing anything: % changed since Oct 29. Ask Claude to look.', bad;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'age_group')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'muted_ids')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'blocked_ids')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_private')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'city_lat')
     or to_regclass('public.app_opens') is null
     or to_regclass('public.follows') is null
     or to_regprocedure('public.km_between(double precision, double precision, double precision, double precision)') is null then
    raise exception 'Migration 202 stopped before changing anything: a table or column it reads is missing. Ask Claude to look.';
  end if;
  -- The age helpers stay server-only (109).
  if has_function_privilege('authenticated', 'public.known_adult(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.age_rule_budget(uuid[])', 'execute') then
    raise exception 'Migration 202 stopped before changing anything: an age helper can be called from the app. Ask Claude to look.';
  end if;
end $$;

-- ------------------------------------------------- 1. the frozen lists
create table if not exists public.teen_suggestions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  ids     uuid[] not null check (cardinality(ids) between 1 and 6),
  set_at  timestamptz not null default now()
);
alter table public.teen_suggestions enable row level security;
revoke all on public.teen_suggestions from public, anon, authenticated;

-- ------------------------------------------------------------- 2. the list
create or replace function public.teens_to_suggest()
returns table (user_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_town text;
  v_lat double precision;
  v_lng double precision;
  v_muted text[];
  v_blocked text[];
  v_ids uuid[];
  v_ok uuid[];
  v_kept uuid[];
begin
  if me is null then return; end if;
  -- A known teen, not suspended, in their first week.
  select lower(btrim(split_part(coalesce(p.location, ''), ',', 1))), p.city_lat, p.city_lng
    into v_town, v_lat, v_lng
    from public.profiles p join public.user_state us on us.user_id = p.id
   where p.id = me and p.suspended_at is null and us.age_group = 'teen'
     and p.created_at > now() - interval '7 days';
  if not found then return; end if;
  select coalesce(us.muted_ids, '{}'), coalesce(us.blocked_ids, '{}') into v_muted, v_blocked
    from public.user_state us where us.user_id = me;
  v_muted := coalesce(v_muted, '{}');
  v_blocked := coalesce(v_blocked, '{}');

  -- Already given a list: only those people, checked again; never a fresh pick.
  select ts.ids into v_kept from public.teen_suggestions ts where ts.user_id = me;
  if not found then
    select coalesce(array_agg(x.id order by x.ord), '{}') into v_ids from (
      select p.id, row_number() over (order by
               coalesce(case when v_lat is not null and v_lng is not null and p.city_lat is not null and p.city_lng is not null
                      then public.km_between(v_lat, v_lng, p.city_lat, p.city_lng) <= 48.28
                    else v_town <> '' and lower(btrim(split_part(coalesce(p.location, ''), ',', 1))) = v_town
               end, false) desc,
               coalesce((select max(o.day) from public.app_opens o where o.user_id = p.id), p.created_at::date) desc,
               p.created_at desc, p.id) as ord
        from public.profiles p join public.user_state us on us.user_id = p.id
       where p.id <> me
         and us.age_group = 'teen'
         and p.suspended_at is null
         and not coalesce(p.is_private, false)
         and not public.is_blocked_between(me, p.id)
         and not (p.id::text = any (v_blocked) or p.id::text = any (v_muted))
         and not (me::text = any (coalesce(us.blocked_ids, '{}')) or me::text = any (coalesce(us.muted_ids, '{}')))
         and not exists (select 1 from public.follows f where f.follower_id = me and f.following_id = p.id)
       order by 2
       limit 6) x;
    if cardinality(v_ids) = 0 then return; end if;
    -- Each one counts toward the day's 300 (109); past it, only those already counted today.
    v_ok := public.age_rule_budget(v_ids);
    select coalesce(array_agg(i order by n), '{}') into v_ids
      from unnest(v_ids) with ordinality as t(i, n) where i = any (v_ok);
    if cardinality(v_ids) = 0 then return; end if;
    -- Freeze it. Two first calls at once: the first stored list wins, and both get it.
    insert into public.teen_suggestions (user_id, ids) values (me, v_ids)
      on conflict on constraint teen_suggestions_pkey do nothing;
    select ts.ids into v_kept from public.teen_suggestions ts where ts.user_id = me;
  end if;

  return query
    select p.id
      from unnest(v_kept) with ordinality as t(i, n)
      join public.profiles p on p.id = t.i
      join public.user_state us on us.user_id = p.id
     where p.id <> me
       and us.age_group = 'teen'
       and p.suspended_at is null
       and not coalesce(p.is_private, false)
       and not public.is_blocked_between(me, p.id)
       and not (p.id::text = any (v_blocked) or p.id::text = any (v_muted))
       and not (me::text = any (coalesce(us.blocked_ids, '{}')) or me::text = any (coalesce(us.muted_ids, '{}')))
       and not exists (select 1 from public.follows f where f.follower_id = me and f.following_id = p.id)
     order by t.n;
end $$;

revoke all on function public.teens_to_suggest() from public, anon, authenticated;
grant execute on function public.teens_to_suggest() to authenticated;

-- ------------------------------------------------------------ 3. the result
do $$
begin
  if to_regprocedure('public.teens_to_suggest()') is null
     or to_regclass('public.teen_suggestions') is null
     or not (select relrowsecurity from pg_class where oid = 'public.teen_suggestions'::regclass)
     or has_table_privilege('anon', 'public.teen_suggestions', 'select, insert, update, delete')
     or has_table_privilege('authenticated', 'public.teen_suggestions', 'select, insert, update, delete')
     or has_function_privilege('anon', 'public.teens_to_suggest()', 'execute')
     or not has_function_privilege('authenticated', 'public.teens_to_suggest()', 'execute')
     or has_function_privilege('authenticated', 'public.known_adult(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.age_rule_budget(uuid[])', 'execute') then
    raise exception 'Migration 202 stopped: the result was not as planned. Nothing was changed.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
