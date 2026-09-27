-- Group chats: a chat with up to 16 people and an optional name, for the
-- Saturday hitting group. And a court sent in a chat (a message carrying a
-- place), to say where to meet.
alter table public.conversations add column if not exists title text check (title is null or char_length(title) <= 60);
alter table public.conversations add column if not exists is_group boolean not null default false;
alter table public.conversations add column if not exists created_by uuid references public.profiles (id) on delete set null;
alter table public.messages add column if not exists place jsonb check (place is null or (jsonb_typeof(place) = 'object' and pg_column_size(place) < 2000));

-- Start a group with the people picked. The same protections as a one-to-one
-- chat, for each of them: nobody you are blocked with, and anyone not known to
-- be an adult must follow you first.
create or replace function public.open_group(members uuid[], group_title text default null, wanted uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  others uuid[];
  other uuid;
  made uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select coalesce(array_agg(distinct m), '{}') into others from unnest(members) m where m is not null and m <> me;
  if array_length(others, 1) is null or array_length(others, 1) < 2 then raise exception 'a group needs at least two other people'; end if;
  if array_length(others, 1) > 15 then raise exception 'a group can have up to 16 people'; end if;
  foreach other in array others loop
    if not exists (select 1 from public.profiles where id = other) then raise exception 'unknown player'; end if;
    if public.is_blocked_between(me, other) then raise exception 'blocked'; end if;
    if exists (select 1 from public.profiles where id = other and age_group is distinct from 'adult')
       and not exists (select 1 from public.follows where follower_id = other and following_id = me) then
      raise exception 'teen_closed';
    end if;
  end loop;
  insert into public.conversations (id, title, is_group, created_by)
    values (coalesce(wanted, gen_random_uuid()), nullif(btrim(coalesce(group_title, '')), ''), true, me)
    returning id into made;
  insert into public.conversation_members (conversation_id, user_id) select made, u from unnest(others || me) u;
  return made;
end $$;
grant execute on function public.open_group(uuid[], text, uuid) to authenticated;

-- Anyone in a group can add someone, with the same protections.
create or replace function public.add_to_group(conv uuid, member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not exists (select 1 from public.conversations c join public.conversation_members m on m.conversation_id = c.id where c.id = conv and c.is_group and m.user_id = me) then
    raise exception 'not in this group';
  end if;
  if (select count(*) from public.conversation_members where conversation_id = conv) >= 16 then raise exception 'a group can have up to 16 people'; end if;
  if public.is_blocked_between(me, member) then raise exception 'blocked'; end if;
  if exists (select 1 from public.profiles where id = member and age_group is distinct from 'adult')
     and not exists (select 1 from public.follows where follower_id = member and following_id = me) then
    raise exception 'teen_closed';
  end if;
  insert into public.conversation_members (conversation_id, user_id) values (conv, member) on conflict do nothing;
end $$;
grant execute on function public.add_to_group(uuid, uuid) to authenticated;

create or replace function public.leave_group(conv uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.conversation_members m using public.conversations c
    where m.conversation_id = conv and m.user_id = auth.uid() and c.id = conv and c.is_group;
end $$;
grant execute on function public.leave_group(uuid) to authenticated;

create or replace function public.rename_group(conv uuid, new_title text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.conversation_members where conversation_id = conv and user_id = auth.uid()) then raise exception 'not in this group'; end if;
  update public.conversations set title = nullif(btrim(coalesce(new_title, '')), '') where id = conv and is_group;
end $$;
grant execute on function public.rename_group(uuid, text) to authenticated;
