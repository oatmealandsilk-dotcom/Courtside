-- CourtSide · migration 20261007000147: the affiliate dashboard (Oct 6,
-- owner, looking at Admin → Invites: "This screen is good. But for
-- affiliates their screen looks kind ass to see their referrals").
--
-- What it is for: the paid invite partners (the affiliates) open the same
-- Invites page everyone does (Settings → Invites), but for them it now shows
-- what they have earned, what has been paid and what is owed, how close they
-- are to the next reward, and who joined through them. Everyone else keeps
-- the plain "Invite friends" page with no money on it.
--
--   1. Who is an affiliate: one row in the private server_settings table,
--      'affiliates', their @handles separated by commas (no @ needed, any
--      case, spaces ignored; an account's id works too). It starts with the
--      seven partners of Oct 6. The owner changes it in the SQL editor, no
--      new app needed:
--        add someone:
--          update public.server_settings set value = value || ',theirhandle', updated_at = now() where key = 'affiliates';
--        see the list:
--          select value from public.server_settings where key = 'affiliates';
--      Someone who changes their @handle drops off the list until the new
--      handle is added (the money already counted for them stays).
--   2. my_affiliate_stats(): what the app asks. It answers only about the
--      person asking, never anyone else:
--        not an affiliate: {"affiliate": false}, nothing more;
--        an affiliate: {"affiliate": true} with the same numbers Admin →
--        Invites shows for them (migration 71's invite_counts): joined,
--        set up, counted ("qualified", migration 80's rule), paid (players
--        and cents), owed, when they were last paid, plus earnedCents
--        (paid + owed) and the rate ($1 a player, in cents).
--      Like my_invitees (migration 85) it first writes down anyone of theirs
--      who has counted since last time, so the numbers match the list.
--
-- Nothing here pays anyone, changes who counts, or touches the payout
-- records: it only reads them for the person themselves. The app works
-- without this file (everyone then sees the plain page).
--
-- Needs migrations 35 (server_settings), 71 (invite_counts, invite_payouts)
-- and 80 (invite_settle). Adds two functions and one settings row; replaces
-- nothing. Stops before changing anything if either function already exists
-- and is not this file's. Safe to run more than once: the list of affiliates
-- is never overwritten once it is there.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  r record;
begin
  if to_regclass('public.server_settings') is null or to_regclass('public.invite_payouts') is null or to_regclass('public.invite_qualifications') is null then
    raise exception 'Migration 147 stopped before changing anything: migrations 35 and 71 have to run first.';
  end if;
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'invite_counts')
     or not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'invite_settle')
     or not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'invite_rate_cents') then
    raise exception 'Migration 147 stopped before changing anything: migrations 71 and 80 have to run first.';
  end if;
  for r in select p.proname, p.prosrc from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname in ('is_affiliate', 'my_affiliate_stats') loop
    if position('affiliate_stats_147' in r.prosrc) = 0 then
      raise exception 'Migration 147 stopped before changing anything: public.% already exists and is not this file''s. Compare before replacing it.', r.proname;
    end if;
  end loop;
end $$;

-- -------------------------------------------------------- 1. the affiliates
-- The seven partners of Oct 6. Never changes a list already there.
insert into public.server_settings (key, value)
values ('affiliates', 'tp,omuchitaletennis,smyanvjay,jah,ponci,william,gips')
on conflict (key) do nothing;

-- Is this account on the list? Server only: the app asks my_affiliate_stats.
create or replace function public.is_affiliate(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- affiliate_stats_147
  select coalesce((
    select lower(p.handle) = any (l.names) or p.id::text = any (l.names)
    from public.profiles p
    cross join lateral (
      -- Each entry without spaces, line breaks or @ at either end ("@TP", " tp" and "@ tp" are all tp).
      select array(
        select n from (
          select lower(btrim(x, E' \t\r\n@')) as n
          from unnest(string_to_array(coalesce((select value from public.server_settings where key = 'affiliates'), ''), ',')) x
        ) e
        where n <> ''
      ) as names
    ) l
    where p.id = u
  ), false)
$$;
revoke all on function public.is_affiliate(uuid) from public, anon, authenticated;

-- ---------------------------------------------------- 2. what the app asks
-- The signed-in person's own numbers, only if they are an affiliate.
create or replace function public.my_affiliate_stats()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c jsonb;
begin
  -- affiliate_stats_147
  if me is null then raise exception 'sign in first'; end if;
  if not public.is_affiliate(me) then return jsonb_build_object('affiliate', false); end if;
  perform public.invite_settle(me);
  c := public.invite_counts(me);
  return c || jsonb_build_object(
    'affiliate', true,
    'rateCents', public.invite_rate_cents(),
    'earnedCents', coalesce((c->>'paidCents')::int, 0) + coalesce((c->>'owedCents')::int, 0));
end $$;
revoke all on function public.my_affiliate_stats() from public, anon;
grant execute on function public.my_affiliate_stats() to authenticated;

do $$
begin
  if not exists (select 1 from public.server_settings where key = 'affiliates') then
    raise exception 'migration 147: the affiliates list is missing';
  end if;
end $$;

commit;

-- ------------------------------------------------- 3. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The list (expect tp,omuchitaletennis,smyanvjay,jah,ponci,william,gips the first time):
-- select value from public.server_settings where key = 'affiliates';
--
-- (b) Which accounts it matches (expect one row per affiliate who has an account):
-- select handle from public.profiles where public.is_affiliate(id) order by 1;
--
-- (c) The app can ask only the one function, not the helper (expect false, true):
-- select has_function_privilege('authenticated', 'public.is_affiliate(uuid)', 'execute'),
--        has_function_privilege('authenticated', 'public.my_affiliate_stats()', 'execute');
