-- CourtSide · migration 85: a promoter sees their own people (Oct 4, owner).
--
-- my_invitees() lists everyone who joined through the signed-in person's
-- link or code, newest first: who has counted ($1, written down in
-- invite_qualifications) and, for the rest, what is still missing, in the
-- order a new player meets it:
--   'setup'     finish the sign-up steps
--   'verify'    confirm their email (or use Apple or Google)
--   'come-back' come back on a later day (within 14 days of joining)
--   'do-thing'  do one real thing (not the automatic follow of the inviter)
-- or a closed case:
--   'expired'   14 days passed without a second day; can no longer count
--   'blocked'   cannot count (suspended, or signed in on the inviter's
--               phone). One word for both on purpose: the app never says
--               which, so it teaches nobody how the phone check works.
-- People blocked either way between the two are left out entirely.
-- Settles this person's people first, so the list is current.
-- Safe to run more than once.

create or replace function public.my_invitees()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  out jsonb;
begin
  if me is null then raise exception 'sign in first'; end if;
  perform public.invite_settle(me);
  with people as (
    select p.id, p.handle, p.name, p.avatar_url, p.created_at, p.profile, p.suspended_at,
           q.qualified_at
    from public.profiles p
    left join public.invite_qualifications q on q.invitee_id = p.id
    where p.referred_by = me and p.id <> me
      and not public.is_blocked_between(me, p.id)
  ), checked as (
    select x.*,
      case
        when x.qualified_at is not null then '[]'::jsonb
        when x.suspended_at is not null or public.invite_same_device(x.id, me) then '["blocked"]'::jsonb
        when public.invite_second_day(x.id, x.created_at) is null and x.created_at < now() - interval '14 days' then '["expired"]'::jsonb
        else (
          select coalesce(jsonb_agg(m order by o), '[]'::jsonb) from (values
            (1, case when not public.invite_set_up(x.profile) then 'setup' end),
            (2, case when not public.invite_verified(x.id) then 'verify' end),
            (3, case when public.invite_second_day(x.id, x.created_at) is null then 'come-back' end),
            (4, case when public.invite_first_action(x.id, me) is null then 'do-thing' end)
          ) v(o, m) where m is not null)
      end as missing
    from people x
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', id, 'handle', handle, 'name', name, 'avatarUrl', avatar_url,
      'joinedAt', created_at, 'countedAt', qualified_at,
      'missing', case when qualified_at is null then missing end))
    order by qualified_at desc nulls last, created_at desc), '[]'::jsonb)
  into out from checked;
  return out;
end $$;
revoke all on function public.my_invitees() from public, anon;
grant execute on function public.my_invitees() to authenticated;
