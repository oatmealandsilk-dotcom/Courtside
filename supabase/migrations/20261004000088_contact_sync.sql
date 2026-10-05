-- CourtSide · migration 88: find friends from your contacts (Oct 4, owner).
--
-- The app sends the phone numbers and emails in your contacts; this answers
-- which of them belong to CourtSide players. Nothing sent is kept: only that
-- you asked, and when, so one account cannot run through huge lists.
--
-- Matching, as the owner chose:
--   * a phone number counts only once its owner confirmed it with a texted
--     code (auth.users.phone_confirmed_at), so nobody shows up as a number
--     that is not theirs;
--   * an email counts once confirmed, or when it came from Apple or Google;
--   * everyone can be matched, whatever their age (owner, Oct 4). Who sees
--     a teen on the map is unchanged (mutual follows only).
-- Left out: you, suspended players, and anyone blocked either way.
-- Each call takes up to 3,000 numbers and 3,000 emails; 10 calls a day.
--
-- unlink_my_phone() takes your number off. Linking one goes through
-- Supabase's own phone change (a texted code), not through here.
-- Safe to run more than once.

create table if not exists public.contact_sync_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists contact_sync_log_user_idx on public.contact_sync_log (user_id, at);
alter table public.contact_sync_log enable row level security;
revoke all on public.contact_sync_log from public, anon, authenticated;

-- A number as Supabase keeps it: digits only, with the country code. A
-- 10-digit number is taken as US/Canada. Null when it is too short to be one.
create or replace function public.contact_digits(raw text)
returns text language sql immutable set search_path = public as $$
  select case
    when length(d) = 10 and left(btrim(coalesce(raw, '')), 1) <> '+' then '1' || d
    when length(d) >= 8 and length(d) <= 15 then d
  end
  from (select regexp_replace(coalesce(raw, ''), '\D', '', 'g') as d) x
$$;

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
    and not public.is_blocked_between(me, p.id);

  return jsonb_build_object('matches', out);
end $$;
revoke all on function public.match_contacts(text[], text[]) from public, anon;
grant execute on function public.match_contacts(text[], text[]) to authenticated;

-- Take your number off your account.
create or replace function public.unlink_my_phone()
returns void language plpgsql volatile security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  update auth.users set phone = null, phone_confirmed_at = null, phone_change = '', phone_change_token = ''
  where id = auth.uid();
end $$;
revoke all on function public.unlink_my_phone() from public, anon;
grant execute on function public.unlink_my_phone() to authenticated;
