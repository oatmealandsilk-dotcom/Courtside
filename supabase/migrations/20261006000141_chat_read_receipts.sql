-- CourtSide · migration 20261006000141: read receipts for each chat (owner,
-- Oct 6: "if you click that dot you could also turn on and off read
-- receipts"). Instagram's way: a chat's Details page has its own "Read
-- receipts" switch, for a one-to-one chat or a group.
--
-- You share how far you have read in a chat only when BOTH your Privacy
-- switch (profiles.read_receipts, migration 16) AND that chat's switch are
-- on. Until now the server kept everyone's read position open to the whole
-- chat and only the apps chose not to show it; now the server itself holds
-- it back:
--
--   1. conversation_members.read_receipts: the chat's switch, on unless you
--      turn it off. Everyone in the chat can see it, the same as the Privacy
--      switch, so their app can say "read receipts off" rather than "Sent".
--      Changed only through set_chat_read_receipts below.
--   2. conversation_prefs.read_at: how far you have really read, kept in your
--      own chat settings, which only you can read (migration 54). Your app
--      counts your unread messages from it.
--   3. A trigger on conversation_members: while either switch is off, a new
--      read position goes to (2) and the shared last_read_at stays where it
--      was, so nobody else's app (an old one included) can see you read on.
--
-- Safe to run more than once.

begin;

alter table public.conversation_members add column if not exists read_receipts boolean not null default true;
alter table public.conversation_prefs add column if not exists read_at timestamptz;

create or replace function public.share_read_position()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.last_read_at is not distinct from old.last_read_at
     and new.read_receipts is not distinct from old.read_receipts then
    return new;
  end if;
  if new.read_receipts and coalesce((select p.read_receipts from public.profiles p where p.id = new.user_id), true) then
    return new;
  end if;
  -- Held back: kept privately, and the shared position does not move.
  if new.last_read_at is not null and (tg_op = 'INSERT' or new.last_read_at is distinct from old.last_read_at) then
    insert into public.conversation_prefs (user_id, conversation_id, read_at)
      values (new.user_id, new.conversation_id, new.last_read_at)
      on conflict (user_id, conversation_id) do update set read_at = greatest(public.conversation_prefs.read_at, excluded.read_at);
  end if;
  if tg_op = 'INSERT' then new.last_read_at := null; else new.last_read_at := old.last_read_at; end if;
  return new;
end $$;
revoke all on function public.share_read_position() from public, anon, authenticated;

-- Runs after no_reading_ahead (migration 102): triggers go in name order.
drop trigger if exists share_read_position on public.conversation_members;
create trigger share_read_position before insert or update of last_read_at, read_receipts on public.conversation_members
  for each row execute function public.share_read_position();

-- The chat's switch, for yourself only.
create or replace function public.set_chat_read_receipts(conv uuid, receipts boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_member(conv) then raise exception 'not in this chat'; end if;
  update public.conversation_members set read_receipts = coalesce(receipts, true)
    where conversation_id = conv and user_id = me;
end $$;
revoke all on function public.set_chat_read_receipts(uuid, boolean) from public, anon;
grant execute on function public.set_chat_read_receipts(uuid, boolean) to authenticated;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'conversation_members' and column_name = 'read_receipts') then
    raise exception 'migration 141: conversation_members.read_receipts is missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'conversation_prefs' and column_name = 'read_at') then
    raise exception 'migration 141: conversation_prefs.read_at is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'share_read_position' and tgrelid = 'public.conversation_members'::regclass) then
    raise exception 'migration 141: the share_read_position trigger is missing';
  end if;
end $$;

commit;
