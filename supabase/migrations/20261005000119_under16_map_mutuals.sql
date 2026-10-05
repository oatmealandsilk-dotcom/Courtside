-- CourtSide · migration 119: under 16s on the map, only for friends who
-- follow each other.
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if any check below fails, it stops and
-- nothing at all changes.
--
-- The owner, Oct 5: "Can we make under 16? To show their location if
-- they're mutuals." (And, unchanged: a teen is never shown or suggested to
-- adult strangers.)
--
-- Until now (78, 98, 105): an account whose birthday says under 16 is never
-- on the map and sees nobody on it; "Who can see you on the map?" refused
-- them ('under_16'). 16 and 17 year olds (and anyone with no birthday on
-- file) share only with people they follow who follow them back, and only
-- after turning it on themselves.
--
-- What changes: under 16s get exactly the 16 and 17 year olds' rule.
--   * They can turn it on themselves in "Who can see you on the map?"
--     (set_map_visibility no longer refuses them). Their choices are the
--     teens' two: friends who follow you back, or Only me. "Players nearby"
--     is kept as friends only, as it already is for anyone not known to be
--     an adult.
--   * Someone sees them only when the two follow each other, the under 16
--     has turned it on themselves (and not chosen Only me), neither has
--     blocked or muted the other, and neither account is suspended. Never a
--     stranger: the map rule never reads "Players nearby" for anyone not
--     known to be an adult, so even a 'nearby' left on file means friends
--     only.
--   * They see the friends who follow each other with them and share their
--     spot (adults or teens), the same as 16 and 17 year olds. Never anyone
--     else.
--   * Only their rough area (about a kilometre), the last place they shared,
--     with "ago", as for every teen: their exact spot is never kept
--     (mark_last_seen keeps one only for known adults), they cannot check in
--     at a court (check_in_at_court: adults only), so they are never put on
--     a court. Location off still deletes the spot (forget_last_seen).
--   * "(Friend) is up for a hit today" can go between them and friends who
--     follow each other with them, only while the friend may see them on the
--     map (send_map_alert asks this same rule), as for 16 and 17 year olds.
--     Every other map alert stays adults only.
--
-- Off until they turn it on. Nothing of an under 16's is shared until they
-- answer "Who can see you on the map?" themselves after this runs: any
-- answer already on file for an under 16 (other than Only me) is cleared on
-- the first run, so the app asks them, and they stay off the map until they
-- answer. A second run clears nothing (an under 16 who turned it on after
-- the first run stays as they chose).
--
-- Left exactly as they are, and checked below to be as live on Oct 5:
-- who may read a spot (last_seen's rule, spot_shown_to), the map
-- (map_players), where a spot is kept and how exactly (mark_last_seen,
-- exact_spots and court_checkins readable only by their owner), checking in
-- and who is at a court (check_in_at_court, court_right_now: adults only),
-- court pages (shows_at_court: a teen's posts only to friends who follow
-- each other), the alerts (send_map_alert, tell_friends_up_for_hit,
-- tell_followers_up_for_hit, tell_adults_new_player, tell_map_about_hit,
-- notify_joined_nearby: new players, open hits and "joined near you" only
-- ever from adults), and the age helpers (known_adult, map_under_16).
--
-- Replaces map_pair_ok (105), minor_shares_spot (78) and set_map_visibility
-- (78), as they are live. map_under_16 stays, for the first run's clearing;
-- no rule asks it after this. Mentions nobody's age group (109 looks for
-- that). Nothing here can be called signed out.
--
-- Tried on the live database on Oct 5, inside a transaction that was then
-- undone (nothing was saved), with test accounts made inside it (a 14 year
-- old, a 13 year old, a 15 year old with an old answer on file, a 17 year
-- old, and three adults: a friend who follows each other with the 14 year
-- old, one who follows them one way, and a stranger on "Players nearby" in
-- the same area). For every account already there, the rule for every
-- pair, the map (with no box and with a box round every spot), last_seen
-- read directly and who is at a court came out the same before and after,
-- except that the two real under 16s now see the friends who follow each
-- other with them and share (nobody sees them: they had not chosen). The
-- 14 year old stayed hidden until choosing; then only the friend, the 17
-- year old friend and the other under 16 friend saw them, roughly, never
-- the one-way follower or the stranger (map with and without a box,
-- last_seen, "Players nearby" forced on file); blocks, mutes, suspension,
-- Only me and Location off each hid them; checking in was refused; their
-- "up for a hit" went only to friends who follow each other; no "joined"
-- or "new player" alert came from them; signed out saw nothing. Running it
-- twice changed nothing more.
--
-- After this has run, do not run 78 or 105 again (they would put the under
-- 16 refusal back); if one ever is, run this again.
-- Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. checks
-- Stop before changing anything if the live database is not the shape this
-- file was written against (Oct 5, after 109). md5 of each function's body.
do $$
declare
  -- Rewritten here: as live on Oct 5, and as this file leaves it.
  expected constant text[][] := array[
    ['map_pair_ok',        '2bd16ef6506b6e20eb407779fa83d963', '7b34dc4562bc459a5cd91b25f83caed2'],
    ['minor_shares_spot',  'd2cc3ea975c9ff7baa30515b0dcad191', 'b86963ed22e7dd428bf5eeba1627c3dc'],
    ['set_map_visibility', '3f6a1311e1ebc3b3fe5477a495735ec2', 'd6ce61651f329fdd331efd8194f126d6']
  ];
  -- Relied on and never rewritten here: each must still be exactly as live
  -- on Oct 5, or opening the map to under 16s could open more than this.
  kept constant text[][] := array[
    ['known_adult',               'a79e745befd4374ea124ccf1692145a2'],
    ['map_under_16',              '2e6933844fb31db422e925216effd43e'],
    ['follow_each_other',         '1bc1148421d20a5927824dc7ef3ad967'],
    ['is_blocked_between',        'f7246d0dbae4888d3a96a1d317c9de5f'],
    ['map_hushed',                '1715d703582a04cb3ed6b1976f6dacda'],
    ['spot_shown_to',             '576d16a22ca04acbe96f9a60647d5873'],
    ['map_players',               'c13b583876670c99892696cdbe9e0746'],
    ['mark_last_seen',            'b97f108ece9f30c7de387938b5c310b4'],
    ['sync_spot_settings',        'f3a0645d3297cff89078a272e14a63b8'],
    ['guard_map_state',           '69d2d9177cade12b344fb05fdd0a3d92'],
    ['check_in_at_court',         '04bcd23bbcfdb4e5f2f3c5d61330bc8e'],
    ['court_right_now',           'eafcfcfa02c39c05a54ccbbc4c7de2bf'],
    ['shows_at_court',            'b325f768cd4001366038723b73c94fbd'],
    ['send_map_alert',            '5001fc787e20679b6d0d5474c6d7bc93'],
    ['tell_friends_up_for_hit',   '0f567946f43b924d545f2c33d272365a'],
    ['tell_followers_up_for_hit', 'b72440b06c45afe6dd3ea4667796798a'],
    ['tell_adults_new_player',    '23900e6aa0a7e3ff561f27c64c397c83'],
    ['tell_map_about_hit',        '281db33a3247e05422be20ffe41a6f62'],
    ['notify_joined_nearby',      'b8ca4082a343d262557abbc1fc79cc37']
  ];
  i int;
  wrong text[] := '{}';
  bad text;
begin
  if to_regclass('public.last_seen') is null or to_regclass('public.exact_spots') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'user_state' and column_name = 'map_answered_at')
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'user_state' and column_name = 'age_group') then
    raise exception 'Migration 119 stopped before changing anything: migrations 78 and 109 have to run first.';
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
  -- The helper the rule on last_seen asks (109's, in the private area).
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'private' and p.proname = 'spot_shown_to_you'
                   and md5(p.prosrc) = 'b0225e84dee18f183091409c94b91794') then
    wrong := wrong || 'private.spot_shown_to_you'::text;
  end if;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 119 stopped before changing anything: % changed after Oct 5. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;

  -- Nothing else keeps under 16s off the map by asking map_under_16 (a
  -- later change would need looking at first).
  select string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname) into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosrc ~ 'map_under_16'
      and p.proname not in ('map_pair_ok', 'minor_shares_spot', 'set_map_visibility');
  if bad is not null then
    raise exception 'Migration 119 stopped before changing anything: % also ask map_under_16. Bring this file up to date first.', bad;
  end if;

  -- Who can read a spot, an exact spot and a check-in: as on Oct 5.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'last_seen'
                 and policyname = 'who sees a spot' and cmd = 'SELECT' and roles = '{authenticated}'
                 and regexp_replace(qual, '\s+', ' ', 'g') = '((user_id = auth.uid()) OR private.spot_shown_to_you(user_id))')
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'last_seen' and cmd in ('SELECT', 'ALL')) <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'exact_spots'
                    and cmd = 'SELECT' and qual = '(user_id = auth.uid())')
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'exact_spots' and cmd in ('SELECT', 'ALL')) <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'court_checkins'
                    and cmd = 'SELECT' and qual = '(user_id = auth.uid())')
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'court_checkins' and cmd in ('SELECT', 'ALL')) <> 1 then
    raise exception 'Migration 119 stopped before changing anything: who can read spots or check-ins is not as on Oct 5. Ask Claude to look.';
  end if;
end $$;

-- ------------------------------------------- 1. off until they turn it on
-- First run only (while minor_shares_spot is still the one that keeps under
-- 16s off): every under 16 who has an answer on file other than Only me
-- goes back to "never answered". Nobody can set map_answered_at but
-- set_map_visibility (guard_map_state), so from here an under 16 is shared
-- only after they choose it in the app themselves.
do $$
begin
  if (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'minor_shares_spot')
     = 'd2cc3ea975c9ff7baa30515b0dcad191' then
    update public.user_state us set map_visibility = null, map_answered_at = null
     where public.map_under_16(us.user_id) and not public.known_adult(us.user_id)
       and (us.map_visibility in ('nearby', 'mutuals') or (us.map_visibility is null and us.map_answered_at is not null));
    if exists (select 1 from public.user_state us
               where public.map_under_16(us.user_id) and not public.known_adult(us.user_id)
                 and us.map_answered_at is not null and us.map_visibility is distinct from 'none') then
      raise exception 'Migration 119 stopped: an under 16 still has an answer on file from before. Nothing was changed.';
    end if;
  end if;
end $$;

-- ------------------------------------------------------------- 2. the rule
-- Whether `viewer` may see `owner` on the map, given the owner's choice
-- (`vis`, as copied onto their spot). Never yourself (the callers handle
-- that), never across a block, never Only me, never a suspended account.
--   Both known adults: they follow each other, or the owner chose Players
--   nearby (105, unchanged).
--   Anyone else, whatever their age: they follow each other, neither has
--   muted or blocked the other, and an owner who is not known to be an
--   adult has turned sharing on themselves. (105's, without "neither is
--   under 16".)
create or replace function public.map_pair_ok(viewer uuid, owner uuid, vis text) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and owner is not null and viewer <> owner
    and coalesce(vis, 'nearby') <> 'none'
    and not public.is_blocked_between(viewer, owner)
    and not exists (select 1 from public.profiles p where p.id in (viewer, owner) and p.suspended_at is not null)
    and case
      when public.known_adult(viewer) and public.known_adult(owner)
        then public.follow_each_other(viewer, owner) or coalesce(vis, 'nearby') = 'nearby'
      else (public.known_adult(owner) or public.minor_shares_spot(owner))
        and public.follow_each_other(viewer, owner)
        and not public.map_hushed(viewer, owner)
    end
$$;
revoke all on function public.map_pair_ok(uuid, uuid, text) from public, anon, authenticated;

-- Someone not known to be an adult who turned sharing on themselves: they
-- answered "Who can see you on the map?" and did not pick Only me. (78's,
-- without "and not under 16".)
create or replace function public.minor_shares_spot(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_state s
                 where s.user_id = u and s.map_answered_at is not null and s.map_visibility in ('nearby', 'mutuals'))
$$;
revoke all on function public.minor_shares_spot(uuid) from public, anon, authenticated;

-- ------------------------------------------ 3. "Who can see you on the map?"
-- 78's, without the under 16 refusal: for anyone not known to be an adult,
-- Players nearby is kept as Only people you follow back, and the answer is
-- noted (that is what turns sharing on). Returns what was kept.
create or replace function public.set_map_visibility(v text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  adult boolean;
begin
  if me is null then raise exception 'not signed in'; end if;
  if v is null or v not in ('nearby', 'mutuals', 'none') then raise exception 'visibility?'; end if;
  adult := public.known_adult(me);
  if not adult and v = 'nearby' then v := 'mutuals'; end if;
  perform set_config('courtside.map_state', 'on', true);
  insert into public.user_state (user_id, map_visibility, map_answered_at) values (me, v, case when adult then null else now() end)
    on conflict (user_id) do update set map_visibility = excluded.map_visibility,
      map_answered_at = case when adult then public.user_state.map_answered_at else now() end;
  perform set_config('courtside.map_state', 'off', true);
  return v;
end $$;
revoke all on function public.set_map_visibility(text) from public, anon;
grant execute on function public.set_map_visibility(text) to authenticated;

-- --------------------------------------------------------------- 4. last check
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and ((p.proname = 'map_pair_ok' and md5(p.prosrc) <> '7b34dc4562bc459a5cd91b25f83caed2')
        or (p.proname = 'minor_shares_spot' and md5(p.prosrc) <> 'b86963ed22e7dd428bf5eeba1627c3dc')
        or (p.proname = 'set_map_visibility' and md5(p.prosrc) <> 'd6ce61651f329fdd331efd8194f126d6')
        or (p.proname in ('map_pair_ok', 'minor_shares_spot', 'set_map_visibility')
            and (p.prosrc ~* 'age_group' or not p.prosecdef or has_function_privilege('anon', p.oid, 'execute')))
        or (p.proname in ('map_pair_ok', 'minor_shares_spot') and has_function_privilege('authenticated', p.oid, 'execute'))
        or (p.proname = 'set_map_visibility' and not has_function_privilege('authenticated', p.oid, 'execute')));
  if bad is not null then
    raise exception 'Migration 119 stopped: % did not come out as written. Nothing was changed.', bad;
  end if;
end $$;

commit;

-- ------------------------------------------------------- 5. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) No one who is not known to be an adult is shown to someone they do not follow each other with (expect 0):
-- select count(*) from public.last_seen o join public.profiles v on v.id <> o.user_id
--   where public.map_pair_ok(v.id, o.user_id, o.visibility)
--     and not (public.known_adult(v.id) and public.known_adult(o.user_id))
--     and not public.follow_each_other(v.id, o.user_id);
--
-- (b) No under 16 is shared without having answered since this ran (expect 0):
-- select count(*) from public.user_state where public.map_under_16(user_id)
--   and map_visibility in ('nearby', 'mutuals') and map_answered_at is null;
--
-- (c) Who may call what (expect set_map_visibility: app true, anon false; map_pair_ok, minor_shares_spot: both false):
-- select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') app
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('set_map_visibility', 'map_pair_ok', 'minor_shares_spot') order by 1;
