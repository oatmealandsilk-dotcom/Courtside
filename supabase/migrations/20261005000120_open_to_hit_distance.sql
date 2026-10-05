-- CourtSide · migration 120: how far you'd like to go for a hit, next to
-- "Open to hit".
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if the check below fails, it stops and
-- nothing at all changes. Safe to run more than once.
--
-- Why (Oct 5, owner): holding your own ring in the Community tab's "Open to
-- hit" row opens a small sheet: open until any time you like, and a
-- distance you'd like to hit within (5, 10 or 25 miles, or any). The
-- distance is a preference others are shown, never a filter: everyone who
-- could see you before still sees you. Someone farther away who opens your
-- card reads "Robert usually hits within 10 mi of Raleigh. Suggest a court
-- that works for you both." ("Because many times ppl can arrange stuff.")
--
-- What it does:
--   * user_state.open_to_hit_miles: 5, 10 or 25, or empty for any distance.
--     It sits in your own settings row, next to user_state.open_to_hit_until,
--     which only you can read (as every column of that row).
--   * set_open_to_hit_miles(miles): saves your own, and only your own.
--     Anything but 5, 10, 25 or empty is refused.
--   * open_to_hit_miles(ids): someone else's distance, read exactly where
--     their "open until" is already readable, and only while their ring is
--     on: (a) they are on your map (the same rule map_players uses to hand you
--     their open_until: map_pair_ok with their own "who can see you"), or
--     (b) their ring is on their public profile (profiles.open_to_hit_until,
--     which every signed-in account can already read; since migration 78
--     only a known adult's ring is ever there). You always get your own.
--     Anyone else gets nothing back, the same as someone who chose "any".
--     At most 200 people per ask.
--   * Signed out: nothing. Neither function can be called without an account.
--
-- What it cannot tell anyone: where someone is (no spot, no town, no
-- distance from you: just the number they picked) or how old they are (a
-- teen's distance comes back only to the friends who already see their ring
-- on the map; nobody else can tell it apart from "any").
--
-- The app: works before and after. Before this runs, saving a distance
-- keeps it on that phone only, and everyone reads everyone as "any
-- distance" (no line on anyone's card).
--
-- Needs 31, 63, 78 and 105 (all live). Touches no existing function, rule
-- or trigger.

begin;

-- ------------------------------------------------------------------ 0. check
-- Stop before changing anything if the database is not the shape this file
-- was written against, or if a later change rewrote the two functions it adds.
do $$
declare
  expected constant text[][] := array[
    -- name, as this file leaves it (md5 of the body)
    ['open_to_hit_miles',     '76154180d5f3638f868a53f583d3019c'],
    ['set_open_to_hit_miles', 'fa8f11802b6826e597ed84b6ca84172c']
  ];
  i int;
  now_is text;
  wrong text[] := '{}';
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'open_to_hit_until')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'open_to_hit_until')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'last_seen' and column_name = 'visibility') then
    raise exception 'Migration 120 stopped before changing anything: migrations 31, 63 and 78 have to run first.';
  end if;
  if to_regprocedure('public.map_pair_ok(uuid, uuid, text)') is null then
    raise exception 'Migration 120 stopped before changing anything: migration 105 (map_pair_ok) has to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    select md5(p.prosrc) into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1];
    if now_is is not null and now_is <> expected[i][2] then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 120 stopped before changing anything: % changed since it was written. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ---------------------------------------------------------------- 1. column
-- In your own settings row: only you can read it ("read your settings",
-- migration 36), as with open_to_hit_until beside it.
alter table public.user_state add column if not exists open_to_hit_miles smallint;
alter table public.user_state drop constraint if exists user_state_open_to_hit_miles_check;
alter table public.user_state add constraint user_state_open_to_hit_miles_check
  check (open_to_hit_miles is null or open_to_hit_miles in (5, 10, 25));

-- ----------------------------------------------------------------- 2. yours
-- Saves your own distance (null: any distance). Only ever your own row.
create or replace function public.set_open_to_hit_miles(miles integer) returns smallint
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if miles is not null and miles not in (5, 10, 25) then
    raise exception 'miles must be 5, 10, 25 or empty' using errcode = '22023';
  end if;
  insert into public.user_state (user_id, open_to_hit_miles) values (me, miles)
    on conflict (user_id) do update set open_to_hit_miles = excluded.open_to_hit_miles, updated_at = now();
  return miles;
end $$;
revoke all on function public.set_open_to_hit_miles(integer) from public, anon, authenticated;
grant execute on function public.set_open_to_hit_miles(integer) to authenticated;

-- ---------------------------------------------------------------- 3. theirs
-- Someone else's distance, only where their "open until" is already
-- readable and only while their ring is on (see the top of this file).
-- Nobody who picked "any" (or whose distance you may not read) comes back.
create or replace function public.open_to_hit_miles(ids uuid[])
returns table (user_id uuid, miles smallint)
language sql stable security definer set search_path = public as $$
  select us.user_id, us.open_to_hit_miles
  from public.user_state us
  join public.profiles p on p.id = us.user_id
  where auth.uid() is not null
    and us.user_id = any ((ids)[1:200])
    and us.open_to_hit_miles is not null
    and greatest(p.open_to_hit_until, us.open_to_hit_until) > now()
    and (us.user_id = auth.uid()
      or p.open_to_hit_until > now()
      or exists (select 1 from public.last_seen s
                 where s.user_id = us.user_id and s.visibility <> 'none'
                   and public.map_pair_ok(auth.uid(), s.user_id, s.visibility)))
$$;
revoke all on function public.open_to_hit_miles(uuid[]) from public, anon, authenticated;
grant execute on function public.open_to_hit_miles(uuid[]) to authenticated;

commit;

-- Checks afterwards (each should say what is in brackets):
-- select public.open_to_hit_miles(array[]::uuid[]);                        -- (as signed out: permission denied)
-- select count(*) from public.user_state where open_to_hit_miles is not null; -- (how many have picked one)
