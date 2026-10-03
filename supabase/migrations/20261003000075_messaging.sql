-- 75: messaging polish — replies, and pinning, marking unread and deleting
-- chats from your own inbox.
--
-- NOT APPLIED — needs the owner's OK. Safe to run more than once. The app
-- works without it: a reply then goes as a plain message (no quote), and
-- pin / mark unread / delete stay on the phone until it is run.
--
-- 1. Replies. Swiping a message to the right (or Reply in its menu) answers
--    it: the new message carries messages.reply_to_id, and the chat draws the
--    words it answers as a small quote above it. A reply can only point at a
--    message in the same chat, and never at an event line ("Mira added
--    Dev"): anything else is quietly dropped (the message still goes, as a
--    plain one). Once sent it cannot be pointed elsewhere. When the message
--    it answers is unsent, the link is cleared (the quote then says the
--    original is gone).
--
-- 2. Your own inbox settings, kept beside mute in conversation_prefs (only
--    you can read your rows; nobody can tell you pinned, marked or deleted
--    their chat):
--      pinned_at      pinned to the top of the inbox; at most 3 chats.
--      marked_unread  "Mark as unread": the chat shows as new until opened.
--      hidden_at      "Delete": the chat leaves your inbox, and what was said
--                     before stays out of your view, until someone writes in
--                     it again. Nothing is deleted for anyone else.
--    Changed only through set_chat_pin, set_chat_unread and hide_chat below.

-- ============================================================ 1. replies
alter table public.messages add column if not exists reply_to_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_reply_to_id_fkey' and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_reply_to_id_fkey
      foreign key (reply_to_id) references public.messages (id) on delete set null;
  end if;
end $$;

create index if not exists messages_reply_to_idx on public.messages (reply_to_id) where reply_to_id is not null;

-- On the way in: a reply to a message in another chat, to an event line, or
-- to a message that is not there is sent as a plain message. Afterwards the
-- link can only be cleared (which the unsend above does), never moved.
-- Security definer so the check can see the message answered whoever sends.
create or replace function public.guard_message_reply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.reply_to_id is not null and (
      new.kind = 'system'
      or not exists (
        select 1 from public.messages o
        where o.id = new.reply_to_id and o.conversation_id = new.conversation_id and o.kind <> 'system'
      )
    ) then
      new.reply_to_id := null;
    end if;
  elsif new.reply_to_id is not null and new.reply_to_id is distinct from old.reply_to_id then
    new.reply_to_id := old.reply_to_id;
  end if;
  return new;
end $$;
revoke all on function public.guard_message_reply() from public, anon, authenticated;

drop trigger if exists guard_message_reply on public.messages;
create trigger guard_message_reply before insert or update of reply_to_id on public.messages
  for each row execute function public.guard_message_reply();

-- ============================================================ 2. inbox settings
alter table public.conversation_prefs add column if not exists pinned_at timestamptz;
alter table public.conversation_prefs add column if not exists marked_unread boolean not null default false;
alter table public.conversation_prefs add column if not exists hidden_at timestamptz;

-- Pin a chat you are in to the top of your inbox, or unpin it. At most three
-- at once ('pin_limit' past that; pinning one already pinned is fine).
create or replace function public.set_chat_pin(conv uuid, pinned boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_member(conv) then raise exception 'not in this chat'; end if;
  if not coalesce(pinned, false) then
    update public.conversation_prefs set pinned_at = null where user_id = me and conversation_id = conv;
    return;
  end if;
  -- One pin at a time per person, so two quick taps cannot make four.
  perform pg_advisory_xact_lock(hashtext('chat_pin:' || me::text));
  if exists (select 1 from public.conversation_prefs where user_id = me and conversation_id = conv and pinned_at is not null) then
    return;
  end if;
  if (
    select count(*) from public.conversation_prefs p
    where p.user_id = me and p.pinned_at is not null and p.conversation_id <> conv
      and exists (select 1 from public.conversation_members m where m.conversation_id = p.conversation_id and m.user_id = me)
  ) >= 3 then
    raise exception 'pin_limit';
  end if;
  insert into public.conversation_prefs (user_id, conversation_id, pinned_at)
    values (me, conv, now())
    on conflict (user_id, conversation_id) do update set pinned_at = now();
end $$;
revoke all on function public.set_chat_pin(uuid, boolean) from public, anon;
grant execute on function public.set_chat_pin(uuid, boolean) to authenticated;

-- "Mark as unread" (true), and back (false; the app sends it when the chat is opened).
create or replace function public.set_chat_unread(conv uuid, unread boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_member(conv) then raise exception 'not in this chat'; end if;
  insert into public.conversation_prefs (user_id, conversation_id, marked_unread)
    values (me, conv, coalesce(unread, false))
    on conflict (user_id, conversation_id) do update set marked_unread = excluded.marked_unread;
end $$;
revoke all on function public.set_chat_unread(uuid, boolean) from public, anon;
grant execute on function public.set_chat_unread(uuid, boolean) to authenticated;

-- "Delete" a chat from your inbox: it is read, unpinned and unmarked, and it
-- stays away (with everything said so far) until someone writes in it again.
-- You stay in it; nothing changes for anyone else.
create or replace function public.hide_chat(conv uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_member(conv) then raise exception 'not in this chat'; end if;
  insert into public.conversation_prefs (user_id, conversation_id, hidden_at, pinned_at, marked_unread)
    values (me, conv, now(), null, false)
    on conflict (user_id, conversation_id) do update set hidden_at = now(), pinned_at = null, marked_unread = false;
  update public.conversation_members set last_read_at = now() where conversation_id = conv and user_id = me;
end $$;
revoke all on function public.hide_chat(uuid) from public, anon;
grant execute on function public.hide_chat(uuid) to authenticated;

-- ============================================================ checks (read-only, after running)
-- (a) select column_name from information_schema.columns where table_name = 'messages' and column_name = 'reply_to_id';
-- (b) select column_name from information_schema.columns where table_name = 'conversation_prefs' order by 1;
--     expect conversation_id, hidden_at, marked_unread, muted_until, pinned_at, user_id
-- (c) select proname, prosecdef, proconfig from pg_proc where proname in ('guard_message_reply', 'set_chat_pin', 'set_chat_unread', 'hide_chat');
