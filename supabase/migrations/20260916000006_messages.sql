-- Direct messages, saved. Until now a conversation lived only in the app's
-- memory and was gone on the next open. A conversation has members; a
-- message belongs to a conversation and its sender; only members can see
-- any of it. A member's last_read_at says how far they have read.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  kind text not null default 'text',
  shared_id text,
  reactions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Whether you are in a conversation. Runs as the owner so the check itself
-- is not blocked by the very rule it serves.
create or replace function public.is_member(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members where conversation_id = conv and user_id = auth.uid());
$$;

drop policy if exists "members see their conversations" on public.conversations;
create policy "members see their conversations" on public.conversations for select using (public.is_member(id));

drop policy if exists "members see who is in it" on public.conversation_members;
create policy "members see who is in it" on public.conversation_members for select using (public.is_member(conversation_id));
drop policy if exists "mark your own reading" on public.conversation_members;
create policy "mark your own reading" on public.conversation_members for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "members read messages" on public.messages;
create policy "members read messages" on public.messages for select using (public.is_member(conversation_id));
drop policy if exists "members send as themselves" on public.messages;
create policy "members send as themselves" on public.messages for insert with check (auth.uid() = sender_id and public.is_member(conversation_id));
drop policy if exists "members react" on public.messages;
create policy "members react" on public.messages for update using (public.is_member(conversation_id)) with check (public.is_member(conversation_id));

-- A member may change only the reactions on a message, never its words.
create or replace function public.guard_message_columns()
returns trigger language plpgsql as $$
begin
  if new.body <> old.body or new.sender_id <> old.sender_id or new.conversation_id <> old.conversation_id
     or new.kind <> old.kind or new.shared_id is distinct from old.shared_id or new.created_at <> old.created_at then
    raise exception 'only reactions can change';
  end if;
  return new;
end $$;
drop trigger if exists guard_message_columns on public.messages;
create trigger guard_message_columns before update on public.messages for each row execute function public.guard_message_columns();

-- A new message brings its conversation to the top of the inbox.
create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set updated_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
drop trigger if exists messages_touch on public.messages;
create trigger messages_touch after insert on public.messages for each row execute function public.touch_conversation();

-- Opening a chat with someone: the one you already have, or a new one.
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
  insert into public.conversations (id) values (coalesce(wanted, gen_random_uuid())) returning id into found_id;
  insert into public.conversation_members (conversation_id, user_id) values (found_id, me), (found_id, other);
  return found_id;
end $$;
grant execute on function public.open_conversation(uuid, uuid) to authenticated;

-- Messages arrive live while a chat is open.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
