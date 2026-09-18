-- Holding a message now offers Copy, Edit, Unsend and Delete.
--   Edit:   the sender can change their own words; the message then says "Edited".
--   Unsend: the sender removes their message for everyone in the chat.
--   Delete: anyone can hide a message from their own view only; the others still see it.
-- Needs only the messages tables (migration 06).

alter table public.messages add column if not exists edited_at timestamptz;

-- Before, nothing but reactions could change. Now the sender may also change
-- the words, and the database stamps when they did; nobody can fake that stamp.
create or replace function public.guard_message_columns()
returns trigger language plpgsql as $$
begin
  if new.sender_id <> old.sender_id or new.conversation_id <> old.conversation_id
     or new.kind <> old.kind or new.shared_id is distinct from old.shared_id or new.created_at <> old.created_at then
    raise exception 'only reactions, and the sender''s own words, can change';
  end if;
  if new.body <> old.body then
    if auth.uid() is distinct from old.sender_id then
      raise exception 'only the sender can edit a message';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $$;

-- Unsend: the sender, and only the sender, can remove their message.
drop policy if exists "senders unsend" on public.messages;
create policy "senders unsend" on public.messages for delete using (auth.uid() = sender_id);

-- A removal that arrives live on the other phone carries the whole message,
-- so that phone knows which chat to take it out of.
alter table public.messages replica identity full;

-- Delete for yourself: a private list of the messages you have hidden.
create table if not exists public.hidden_messages (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
alter table public.hidden_messages enable row level security;
drop policy if exists "your hidden messages" on public.hidden_messages;
create policy "your hidden messages" on public.hidden_messages for select using (auth.uid() = user_id);
drop policy if exists "hide for yourself" on public.hidden_messages;
create policy "hide for yourself" on public.hidden_messages for insert with check (auth.uid() = user_id);
drop policy if exists "unhide for yourself" on public.hidden_messages;
create policy "unhide for yourself" on public.hidden_messages for delete using (auth.uid() = user_id);
