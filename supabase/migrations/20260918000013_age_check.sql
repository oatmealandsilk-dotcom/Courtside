-- Age check. Everyone gives a date of birth once.
--   Under 13: no account. (US law does not allow collecting a child's data
--   without a parent's consent, so the app does not keep one.)
--   13 to 17: a teen account. It starts private, and only people the teen
--   follows can open a chat with them.
--   18 and over: an adult account, as before.
-- The date itself stays private to its owner; other people only ever see
-- whether an account is a teen's.
-- Needs migrations 06 (messages) and 08 (user_state).

alter table public.profiles add column if not exists age_group text check (age_group in ('teen', 'adult'));
alter table public.user_state add column if not exists birth_date date;

-- Nobody sets their own label by hand: it only changes through the function
-- below, which works it out from the date of birth.
create or replace function public.guard_age_group()
returns trigger language plpgsql as $$
begin
  if new.age_group is distinct from old.age_group
     and coalesce(current_setting('courtside.age_check', true), '') <> 'on' then
    new.age_group := old.age_group;
  end if;
  return new;
end $$;
drop trigger if exists guard_age_group on public.profiles;
create trigger guard_age_group before update on public.profiles for each row execute function public.guard_age_group();

-- Records a date of birth the first time, and works out the label from the
-- date on file. A second call cannot change the date; it only brings the
-- label up to date (a teen turns into an adult on their 18th birthday).
create or replace function public.set_birth_date(dob date)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  stored date;
  years int;
  label text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select birth_date into stored from public.user_state where user_id = me;
  if stored is null then
    if dob is null or dob > current_date or dob < date '1900-01-01' then raise exception 'bad date'; end if;
    stored := dob;
  end if;
  years := extract(year from age(current_date, stored))::int;
  if years < 13 then
    -- Nothing is kept for a child: the caller deletes the account next.
    raise exception 'under_13';
  end if;
  insert into public.user_state (user_id, birth_date) values (me, stored)
    on conflict (user_id) do update set birth_date = coalesce(public.user_state.birth_date, excluded.birth_date);
  label := case when years < 18 then 'teen' else 'adult' end;
  perform set_config('courtside.age_check', 'on', true);
  update public.profiles
    set age_group = label,
        -- A teen account starts private the first time; after that it is the teen's choice.
        is_private = case when label = 'teen' and age_group is null then true else is_private end
    where id = me;
  perform set_config('courtside.age_check', 'off', true);
  return label;
end $$;
grant execute on function public.set_birth_date(date) to authenticated;

-- Opening a chat: a new one with a teen needs the teen to follow you.
-- Chats that already exist carry on as they are.
create or replace function public.open_conversation(other uuid, wanted uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  found_id uuid;
begin
  if me is null or other is null or other = me then raise exception 'bad participants'; end if;
  select cm.conversation_id into found_id
    from public.conversation_members cm
    join public.conversation_members o on o.conversation_id = cm.conversation_id and o.user_id = other
    where cm.user_id = me
      and (select count(*) from public.conversation_members x where x.conversation_id = cm.conversation_id) = 2
    limit 1;
  if found_id is not null then return found_id; end if;
  if exists (select 1 from public.profiles where id = other and age_group = 'teen')
     and not exists (select 1 from public.follows where follower_id = other and following_id = me) then
    raise exception 'teen_closed';
  end if;
  insert into public.conversations (id) values (coalesce(wanted, gen_random_uuid())) returning id into found_id;
  insert into public.conversation_members (conversation_id, user_id) values (found_id, me), (found_id, other);
  return found_id;
end $$;
grant execute on function public.open_conversation(uuid, uuid) to authenticated;
