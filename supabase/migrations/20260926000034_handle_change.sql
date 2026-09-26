-- Changing your handle. Safe to run more than once.
--
-- The rules, the way the big apps settled on them:
--   * once every 30 days (TikTok's rule), so a handle means something;
--   * the old one is held for 14 days (Instagram's rule), so nobody can grab
--     it the minute you let go, and you can change your mind;
--   * invite links carrying the old handle keep working, forever.
-- Mentions of the old handle in old posts stop linking, as on Instagram.

-- 1. When the handle last changed, and every handle anyone has let go of.
alter table public.profiles add column if not exists handle_changed_at timestamptz;

create table if not exists public.handle_history (
  id          bigint generated always as identity primary key,
  handle      text not null,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  released_at timestamptz not null default now()
);
create index if not exists handle_history_handle_idx on public.handle_history (handle, released_at desc);
alter table public.handle_history enable row level security;
-- No policies: nobody reads this table directly. The functions below do.

-- 2. The guard on profiles lets a handle move only inside change_handle below,
--    which raises a flag for the length of its own transaction.
create or replace function public.guard_profile_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    if new.is_coach is distinct from old.is_coach then
      raise exception 'is_coach is not editable';
    end if;
    if new.handle is distinct from old.handle and coalesce(current_setting('courtside.handle_change', true), '') <> 'on' then
      raise exception 'handle is not editable';
    end if;
    if new.handle_changed_at is distinct from old.handle_changed_at and coalesce(current_setting('courtside.handle_change', true), '') <> 'on' then
      raise exception 'handle_changed_at is not editable';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at is fixed';
    end if;
  end if;
  return new;
end $$;

-- 3. Is this handle free? Answers one word, for the live check as you type:
--    ok, yours, invalid, taken, or held (someone let it go under 14 days ago).
create or replace function public.handle_status(p_handle text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  wanted text := lower(trim(coalesce(p_handle, '')));
  me uuid := auth.uid();
  owner uuid;
begin
  if wanted !~ '^[a-z0-9_]{2,24}$' then return 'invalid'; end if;
  select id into owner from public.profiles where handle = wanted;
  if owner is not null then
    return case when owner = me then 'yours' else 'taken' end;
  end if;
  if exists (
    select 1 from public.handle_history
    where handle = wanted and released_at > now() - interval '14 days' and user_id is distinct from me
  ) then
    return 'held';
  end if;
  return 'ok';
end $$;
revoke all on function public.handle_status(text) from public;
grant execute on function public.handle_status(text) to anon, authenticated;

-- 4. The change itself. Returns the new handle, or raises a plain-English reason.
create or replace function public.change_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  wanted text := lower(trim(coalesce(p_handle, '')));
  current_handle text;
  last_change timestamptz;
  status text;
begin
  if me is null then raise exception 'sign in first'; end if;
  select handle, handle_changed_at into current_handle, last_change from public.profiles where id = me for update;
  if current_handle is null then raise exception 'no profile'; end if;
  if wanted = current_handle then return current_handle; end if;
  if last_change is not null and last_change > now() - interval '30 days' then
    raise exception 'You can change your handle again on %.', to_char(last_change + interval '30 days', 'FMMonth FMDD');
  end if;
  status := public.handle_status(wanted);
  if status = 'invalid' then raise exception 'Use 2 to 24 letters, numbers or underscores.'; end if;
  if status = 'taken' then raise exception '@% is taken.', wanted; end if;
  if status = 'held' then raise exception '@% was just let go by someone, so it is held for a couple of weeks.', wanted; end if;

  insert into public.handle_history (handle, user_id) values (current_handle, me);
  perform set_config('courtside.handle_change', 'on', true);
  update public.profiles set handle = wanted, handle_changed_at = now() where id = me;
  perform set_config('courtside.handle_change', 'off', true);
  return wanted;
end $$;
revoke all on function public.change_handle(text) from public;
grant execute on function public.change_handle(text) to authenticated;

-- 5. Invite links: a link with an old handle still finds who sent it.
create or replace function public.claim_referral(p_handle text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  wanted text := lower(trim(coalesce(p_handle, '')));
  who uuid;
begin
  if me is null then raise exception 'sign in first'; end if;
  select id into who from public.profiles where handle = wanted limit 1;
  if who is null then
    select user_id into who from public.handle_history where handle = wanted order by released_at desc limit 1;
  end if;
  if who is null or who = me then return null; end if;
  -- Only the first invite counts; a second link does not steal the credit.
  update public.profiles set referred_by = who where id = me and referred_by is null;
  insert into public.follows (follower_id, following_id) values (me, who) on conflict do nothing;
  insert into public.follows (follower_id, following_id) values (who, me) on conflict do nothing;
  return who;
end;
$$;
revoke all on function public.claim_referral(text) from public;
grant execute on function public.claim_referral(text) to authenticated;

-- 6. A new sign-up cannot take a handle that is being held either.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text := lower(coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1)));
  final  text := regexp_replace(wanted, '[^a-z0-9_]', '', 'g');
begin
  if char_length(final) < 2 then final := 'player'; end if;
  final := left(final, 20);
  -- Keep the handle unique without failing the sign-up.
  while exists (select 1 from public.profiles where handle = final)
     or exists (select 1 from public.handle_history where handle = final and released_at > now() - interval '14 days') loop
    final := left(final, 18) || lpad((floor(random() * 100))::int::text, 2, '0');
  end loop;
  insert into public.profiles (id, handle, name)
  values (new.id, final, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), initcap(replace(final, '_', ' '))));
  return new;
end $$;
