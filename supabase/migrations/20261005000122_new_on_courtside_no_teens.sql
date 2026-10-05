-- CourtSide · migration 122: "New on CourtSide" never puts a teen in front
-- of an adult stranger.
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if a check below fails, it stops and
-- nothing at all changes. It changes one list on the server only, so it can
-- run before or after the app from batch A is live (no app needs it).
--
-- The owner, Oct 5: teens must not be pushed to adult strangers.
--
-- Until now (63, as 109 left it): "New on CourtSide" (new_on_courtside)
-- listed who joined in the last two weeks: adults, and 16 and 17 year olds
-- (never under 16s, never anyone with no birthday on file). A known adult
-- saw every adult there and every 16 or 17 year old with a public account,
-- even one they had never met, with a one-tap Follow. Anyone else saw only
-- the people they already follow.
--
-- What changes: a known adult sees only adults there, plus anyone they
-- already follow (a teen they follow included, as before). A teen is never
-- listed to an adult who does not follow them. Nothing else changes: teens
-- still see only the people they follow; under 16s and accounts with no
-- birthday are still never listed; blocks and suspended accounts are still
-- left out; still at most 100 people, newest first.
--
-- Said plainly (the same kind of thing 109 lists): comparing this list with
-- the profile list still shows an adult that a recent account left out of
-- it is not known to be an adult. 109 already said that of the public
-- accounts it left out (under 16, or no birthday); now it is every account
-- that is not a known adult. Hiding that too would mean listing nobody new
-- to strangers at all.
--
-- Replaces new_on_courtside (63/109), as it is live on Oct 5. Asks only
-- known_adult (109) and is_blocked_between (21), checked below to be as
-- live. Nothing here can be called signed out. Safe to run more than once.
--
-- Tried on the live database on Oct 5, inside a transaction that was then
-- undone (nothing was saved), after 116, 118 and 119 and run twice, with
-- test accounts made inside it (a public 17 year old, a 15 year old, adults
-- who do and do not follow them). The list was worked out for every
-- account before and after: nobody was added for anyone; the 115 pairs
-- that went were all a known adult and someone not known to be an adult
-- whom they do not follow; no such pair was left. An adult stranger no
-- longer saw the 17 year old (before: yes); an adult who follows them still
-- did; adults still saw new adults; the 15 year old was listed to nobody;
-- the 17 year old (who follows nobody) saw nobody; signed out was refused.
--   RESULT 3_noc_added=0 3_noc_removed=115 bad0 3_noc_teen_to_adult_stranger=0
--   before_A_sees_T16=true after_A_sees_T16=false after_AF_sees_followed_T16=true
--   after_A_sees_adult=true U15_listed_anywhere=false T16_viewer=none
--   anon=permission denied md5=26ab4c854c38dcf30c369de239d5be75

begin;

-- ------------------------------------------------------------------ 0. checks
-- Stop before changing anything if the live database is not the shape this
-- file was written against (Oct 5, after 109). md5 of each function's body.
do $$
declare
  -- Rewritten here: as live on Oct 5, and as this file leaves it.
  expected constant text[][] := array[
    ['new_on_courtside',   '2239944b413b30b0c54ce850b090b7a0', '26ab4c854c38dcf30c369de239d5be75']
  ];
  -- Relied on and never rewritten here: each must still be exactly as live on Oct 5.
  kept constant text[][] := array[
    ['known_adult',        'a79e745befd4374ea124ccf1692145a2'],
    ['is_blocked_between', 'f7246d0dbae4888d3a96a1d317c9de5f']
  ];
  i int;
  wrong text[] := '{}';
begin
  -- 109 has run: the age lives on the settings row, never on the profile.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'age_group')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'age_group')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'birth_date') then
    raise exception 'Migration 122 stopped before changing anything: migration 109 has to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]) <> 1
       or exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]
                  and md5(p.prosrc) not in (expected[i][2], expected[i][3])) then
      wrong := wrong || expected[i][1];
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
    raise exception 'Migration 122 stopped before changing anything: % changed after Oct 5. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
  -- The helpers stay server-only (109): the app can never ask them directly.
  if has_function_privilege('authenticated', 'public.known_adult(uuid)', 'execute')
     or has_function_privilege('anon', 'public.known_adult(uuid)', 'execute') then
    raise exception 'Migration 122 stopped before changing anything: known_adult can be called from the app. Ask Claude to look.';
  end if;
end $$;

-- ------------------------------------------------------- 1. New on CourtSide
-- Who joined in the last `days` days (14 unless asked; 1 to 60) that you
-- may be shown, newest first, at most 100. Only adults and 16-17 year olds
-- are ever listed; a known adult sees the adults, anyone sees the people
-- they already follow. Never you, never anyone blocked either way, never a
-- suspended account. Nothing signed out.
create or replace function public.new_on_courtside(days integer default 14)
returns table (user_id uuid, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id, public.known_adult(auth.uid()) as adult)
  select p.id, p.created_at
  from public.profiles p cross join me
  left join public.user_state us on us.user_id = p.id
  where me.id is not null and p.id <> me.id
    and p.created_at >= now() - make_interval(days => least(greatest(coalesce(days, 14), 1), 60))
    and p.suspended_at is null
    and not public.is_blocked_between(me.id, p.id)
    and (us.age_group = 'adult' or (us.age_group = 'teen' and us.birth_date is not null and us.birth_date <= (current_date - interval '16 years')::date))
    and (
      exists (select 1 from public.follows f where f.follower_id = me.id and f.following_id = p.id)
      -- A stranger is listed only to a known adult, and only when they are a known adult too.
      or (me.adult and us.age_group = 'adult'))
  order by p.created_at desc, p.id
  limit 100
$$;
revoke all on function public.new_on_courtside(integer) from public, anon;
grant execute on function public.new_on_courtside(integer) to authenticated;

-- --------------------------------------------------------------- 2. last check
do $$
begin
  if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'new_on_courtside'
                 and md5(p.prosrc) = '26ab4c854c38dcf30c369de239d5be75' and p.prosecdef)
     or has_function_privilege('anon', 'public.new_on_courtside(integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.new_on_courtside(integer)', 'execute') then
    raise exception 'Migration 122 stopped: new_on_courtside did not come out as written. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 3. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
-- (a) Who may call it (expect anon false, app true):
-- select has_function_privilege('anon', 'public.new_on_courtside(integer)', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.new_on_courtside(integer)', 'execute') as app;
