-- CourtSide · migration 89: "Let people find me from their contacts" (Oct 4).
--
-- Find friends from contacts (migration 88) matches everyone whose confirmed
-- phone number or email is in someone's contacts. This adds the way out: a
-- switch in Settings and the Privacy center. Turned off, you never come up
-- when someone else checks their contacts. You can still check your own.
--
-- It is kept with your other settings (public.user_state, beside the alert
-- switches), so only you can read it. It starts on for everyone, so nothing
-- changes until someone turns it off. The settings row's own policies ("read
-- your settings", "start your settings", "change your settings", migration
-- 36) already let you read and change it; nothing else is needed for that.
-- A player with no settings row yet counts as on.
--
-- match_contacts is the same as in 88 apart from the one line that leaves
-- out anyone who turned the switch off. Needs migration 88.
-- Safe to run more than once.

alter table public.user_state add column if not exists contacts_findable boolean not null default true;

create or replace function public.match_contacts(p_phones text[], p_emails text[])
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
  out jsonb;
begin
  if me is null then raise exception 'sign in first'; end if;
  if coalesce(array_length(p_phones, 1), 0) > 3000 or coalesce(array_length(p_emails, 1), 0) > 3000 then
    return jsonb_build_object('error', 'too-many');
  end if;
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
    where u.email_confirmed_at is not null
       or coalesce(u.raw_app_meta_data->>'provider', '') in ('apple', 'google')
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
revoke all on function public.match_contacts(text[], text[]) from public, anon;
grant execute on function public.match_contacts(text[], text[]) to authenticated;
