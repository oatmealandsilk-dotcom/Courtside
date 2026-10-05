-- CourtSide · migration 97: Find friends from contacts gets its limits back,
-- and stops trusting emails nobody confirmed (security review, Oct 5).
--
-- 1. The 3,000-a-call limit could be skipped. It counted only the first row
--    of the list, so the same list sent as a table (rows of 3,000) was
--    checked in full: tens of thousands of emails or numbers turned into
--    accounts in one call. Now a list must be a plain list, and every entry
--    counts.
-- 2. The 10-a-day limit could be raced: ten calls sent at the same moment all
--    counted the day's earlier calls before any of them was written down.
--    Now one account's checks take turns.
-- 3. Emails are matched only when the address is known to be really theirs.
--    Email sign-up does not ask people to confirm their address yet (the
--    "Confirm email" switch in Supabase is off), so every address counted as
--    confirmed the moment the account was made. Someone could sign up with a
--    coach's or a parent's email and show up in a teen's Find friends as
--    "Coach X · in your contacts". Now an email matches when it came from
--    Apple or Google, when its owner clicked the confirmation link Supabase
--    sends once "Confirm email" is on, or when the account already existed
--    the day this ran (the people on CourtSide today keep being found exactly
--    as before). Phone numbers were already matched only once confirmed by a
--    texted code.
--
-- Unchanged: who can be found (the "Let people find me" switch, migration
-- 89), what comes back, and the 3,000 and 10-a-day limits themselves.
-- Needs migrations 88 and 89. Safe to run more than once (the day of the
-- first run is kept, never moved).

insert into public.server_settings (key, value)
values ('contacts:emails-trusted-before', now()::text)
on conflict (key) do nothing;

-- Whether this account's email is known to be its owner's (see 3 above).
create or replace function public.email_is_proven(who uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where u.id = who and u.email is not null and (
      coalesce(u.raw_app_meta_data->>'provider', '') in ('apple', 'google')
      or coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb) ?| array['apple', 'google']
      or (u.email_confirmed_at is not null and u.confirmation_sent_at is not null and u.email_confirmed_at >= u.confirmation_sent_at)
      or (u.email_confirmed_at is not null and u.created_at < coalesce(
            (select value::timestamptz from public.server_settings where key = 'contacts:emails-trusted-before'), '-infinity'::timestamptz))))
$$;
revoke all on function public.email_is_proven(uuid) from public, anon, authenticated;

create or replace function public.match_contacts(p_phones text[], p_emails text[])
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
  out jsonb;
begin
  if me is null then raise exception 'sign in first'; end if;
  -- A plain list only, every entry counted (a table of rows used to pass as its first row).
  if coalesce(array_ndims(p_phones), 1) > 1 or coalesce(array_ndims(p_emails), 1) > 1
     or coalesce(cardinality(p_phones), 0) > 3000 or coalesce(cardinality(p_emails), 0) > 3000 then
    return jsonb_build_object('error', 'too-many');
  end if;
  -- One check at a time per account, so ten sent at once cannot all pass the count.
  perform pg_advisory_xact_lock(hashtext('contacts:' || me::text));
  if (select count(*) from public.contact_sync_log where user_id = me and at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('error', 'limit');
  end if;
  insert into public.contact_sync_log (user_id) values (me);

  with ph as (
    select public.contact_digits(x) as d, min(x) as given
    from unnest(coalesce(p_phones, '{}')) x
    where public.contact_digits(x) is not null
    group by 1
  ), em as (
    select lower(btrim(x)) as e, min(x) as given
    from unnest(coalesce(p_emails, '{}')) x
    where x like '%_@_%'
    group by 1
  ), hits as (
    select u.id, ph.given as phone, null::text as email
    from auth.users u join ph on u.phone = ph.d
    where u.phone_confirmed_at is not null
    union all
    select u.id, null, em.given
    from auth.users u join em on lower(u.email) = em.e
    where public.email_is_proven(u.id)
  ), best as (
    select id, max(phone) as phone, max(email) as email from hits where id <> me group by id
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', p.id, 'handle', p.handle, 'name', p.name, 'avatarUrl', p.avatar_url,
      'phone', b.phone, 'email', b.email)) order by lower(coalesce(p.name, p.handle))), '[]'::jsonb)
  into out
  from best b join public.profiles p on p.id = b.id
  where p.suspended_at is null and p.handle is not null
    and not public.is_blocked_between(me, p.id)
    -- Turned "Let people find me from their contacts" off (migration 89).
    and not exists (select 1 from public.user_state s where s.user_id = p.id and s.contacts_findable is false);

  return jsonb_build_object('matches', out);
end $$;

-- Checks after running:
-- (a) the day emails stop being trusted on sight (expect one row, today):
--   select value from public.server_settings where key = 'contacts:emails-trusted-before';
-- (b) everyone on CourtSide today is still matchable by email (expect 0):
--   select count(*) from auth.users u where u.email is not null and not public.email_is_proven(u.id);
