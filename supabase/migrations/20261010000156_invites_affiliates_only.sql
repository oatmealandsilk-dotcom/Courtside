-- CourtSide · migration 20261010000156: only affiliates are paid for invites
-- (Oct 10, owner: "i shouldnt have to pay non affiliates and they should not
-- see the money and prize chart on their phones").
--
-- The members' side was already right: the money and the rewards ladder show
-- only to people on the affiliates list (migration 147, my_affiliate_stats);
-- everyone else gets the plain "Invite friends" page. Admin → Invites was not:
-- it showed "Owed" and "Mark paid" for everyone who had invited anyone, and
-- added them all into the "owed in all" total. This makes that page agree
-- with the list.
--
--   1. admin_invite_summary (migration 80's, plus three things):
--        - every row says isAffiliate: true or false, decided by migration
--          147's is_affiliate, the very check my_affiliate_stats uses (any
--          case, spaces and @ ignored, an account's id works too), so the
--          admin page and the person's own page always agree;
--        - for someone who is not an affiliate, owed and owedCents are 0:
--          nothing is owed to them (their signed up / set up / qualified
--          counts stay, and so does any payout already on file);
--        - affiliates come first, then as before (most owed first).
--   2. admin_mark_invites_paid (migration 71's, plus one check): refuses to
--      record a payout to someone not on the affiliates list ("not an
--      affiliate"), so a stray tap cannot pay a non-affiliate.
--
-- Who is an affiliate does not change: still the 'affiliates' row in
-- server_settings (migration 147). Adding someone to it makes their counted
-- players owed, as it already did on their own page.
--
-- Nothing else changes: no table, no other function, no payout record. Same
-- names, same inputs, same permissions (admins only, refused for everyone
-- else). Stops before changing anything if either function is no longer
-- the version this was written against (or this file's), or if migration
-- 147 has not run. Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  want constant jsonb := '{"admin_invite_summary":"25d6d90d6136f72526d63d76770f719b","admin_mark_invites_paid":"9d2e2eb1d5d7615572c88156c6a5ab26"}';
  r record;
  seen int := 0;
begin
  if not exists (select 1 from pg_proc where oid = to_regprocedure('public.is_affiliate(uuid)') and position('affiliate_stats_147' in prosrc) > 0) then
    raise exception 'Migration 156 stopped before changing anything: migration 147 (is_affiliate) has to run first.';
  end if;
  for r in select p.proname, md5(p.prosrc) m, p.prosrc s from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname in ('admin_invite_summary', 'admin_mark_invites_paid') loop
    seen := seen + 1;
    if r.m <> want->>r.proname and position('invites_affiliates_only_156' in r.s) = 0 then
      raise exception 'Migration 156 stopped before changing anything: public.% has changed since migrations 71 and 80 (md5 %). Compare before replacing it.', r.proname, r.m;
    end if;
  end loop;
  if seen <> 2 then
    raise exception 'Migration 156 stopped before changing anything: migrations 71 and 80 have to run first.';
  end if;
end $$;

-- ------------------------------------------------- 1. the admin Invites list
create or replace function public.admin_invite_summary()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare out jsonb;
begin
  -- invites_affiliates_only_156
  if auth.uid() is null or not public.is_admin() then raise exception 'admins only'; end if;
  perform public.invite_settle(null);
  with inviters as (
    select referred_by as id from public.profiles where referred_by is not null and referred_by <> id
    union select referrer_id from public.invite_qualifications
    union select referrer_id from public.invite_payouts where referrer_id is not null
  ), listed as (
    select pr.id, pr.name, pr.handle, pr.avatar_url, pr.suspended_at is not null as suspended,
           public.invite_suspicious(pr.id) as suspicious, public.is_affiliate(pr.id) as affiliate,
           public.invite_counts(pr.id) as c
    from inviters i join public.profiles pr on pr.id = i.id
  ), shown as (
    -- Not an affiliate: nothing owed. Their counts and any past payout stay.
    select l.*, case when l.affiliate then l.c else l.c || jsonb_build_object('owed', 0, 'owedCents', 0) end as cc
    from listed l
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', id, 'name', name, 'handle', handle, 'avatarUrl', avatar_url,
      'suspended', case when suspended then true end,
      'suspicious', case when suspicious then true end)) || cc || jsonb_build_object('isAffiliate', affiliate)
    order by affiliate desc, (cc->>'owed')::int desc, (cc->>'qualified')::int desc, (cc->>'invited')::int desc, lower(name)), '[]'::jsonb)
  into out from shown;
  return out;
end $$;
revoke all on function public.admin_invite_summary() from public, anon;
grant execute on function public.admin_invite_summary() to authenticated;

-- ------------------------------------------------------- 2. "Mark paid"
-- As in 71, and only ever for someone on the affiliates list.
create or replace function public.admin_mark_invites_paid(referrer uuid, count int, note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  owed int;
begin
  -- invites_affiliates_only_156
  if me is null or not public.is_admin() then raise exception 'admins only'; end if;
  if referrer is null or not exists (select 1 from public.profiles where id = referrer) then raise exception 'no such person'; end if;
  if not public.is_affiliate(referrer) then raise exception 'not an affiliate'; end if;
  if count is null or count < 1 then raise exception 'count must be at least 1'; end if;
  -- One payout for this person at a time: a second one waits, then sees the first.
  perform pg_advisory_xact_lock(hashtext('invite_payout:' || referrer::text));
  perform public.invite_settle(referrer);
  owed := (public.invite_counts(referrer)->>'owed')::int;
  if count > owed then raise exception 'only % owed', owed; end if;
  insert into public.invite_payouts (referrer_id, count, amount_cents, paid_by, note)
  values (referrer, count, count * public.invite_rate_cents(), me, nullif(left(btrim(coalesce(note, '')), 500), ''));
  return public.invite_counts(referrer);
end $$;
revoke all on function public.admin_mark_invites_paid(uuid, int, text) from public, anon;
grant execute on function public.admin_mark_invites_paid(uuid, int, text) to authenticated;

commit;

-- ------------------------------------------------- 3. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) Both functions are this file's (expect 2):
-- select count(*) from pg_proc where pronamespace = 'public'::regnamespace
--   and proname in ('admin_invite_summary', 'admin_mark_invites_paid') and prosrc like '%invites_affiliates_only_156%';
--
-- (b) The app can still ask both, signed out it cannot, and the list check
--     stays server only (expect true, true, false, false):
-- select has_function_privilege('authenticated', 'public.admin_invite_summary()', 'execute'),
--        has_function_privilege('authenticated', 'public.admin_mark_invites_paid(uuid, int, text)', 'execute'),
--        has_function_privilege('anon', 'public.admin_invite_summary()', 'execute'),
--        has_function_privilege('authenticated', 'public.is_affiliate(uuid)', 'execute');
--
-- (c) Everyone who has invited anyone, affiliates first, with what each is
--     owed now (non-affiliates always 0):
-- select pr.handle, public.is_affiliate(pr.id) as affiliate,
--        case when public.is_affiliate(pr.id) then (public.invite_counts(pr.id)->>'owedCents')::int else 0 end as owed_cents
--   from public.profiles pr
--  where pr.id in (select referred_by from public.profiles where referred_by is not null and referred_by <> id
--                  union select referrer_id from public.invite_qualifications)
--  order by 2 desc, 3 desc, 1;
