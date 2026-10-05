-- CourtSide · migration 96: "typing…" goes over private channels (security
-- review, Oct 5).
--
-- The problem: the "typing…" signals (in a chat, and in the chat list since
-- Oct 4) travel over Supabase Realtime channels named typing:<chat id> and
-- inbox-typing:<player id>. They were public channels: anyone holding the
-- app's public key could listen to them without signing in. Player ids are
-- public, so a stranger could listen to everyone's inbox channel at once and
-- see, live, who is typing to whom and in which chat. They could also send
-- fake "typing…" into anyone's chat list.
--
-- What changes: these rules decide who may use the two channels once the
-- app marks them private (the app version that comes with this does):
--   * typing:<chat>: only people in that chat may listen or send.
--   * inbox-typing:<player>: only that player may listen; the only senders
--     are that player and people who share a chat with them.
-- Nobody signed out may use either.
--
-- Order: run this BEFORE the app version that comes with it goes out. Until
-- this runs, the new app's private channels are refused and "typing…" just
-- does not show (nothing else is affected). Phones still on the old version
-- keep using the old public channels until they update, and the two do not
-- hear each other in the meantime.
--
-- Afterwards (owner, later): the public channels stay allowed for now,
-- because the app's live updates (new messages, hits, reads) use them too.
-- Turning off "Allow public access" in Realtime settings needs those moved
-- to private channels first.
-- Safe to run more than once.

create or replace function public.typing_topic_ok(topic text, sending boolean)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  id uuid;
begin
  if me is null or topic is null then return false; end if;
  if topic ~* '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    id := substr(topic, 8)::uuid;
    return exists (select 1 from public.conversation_members where conversation_id = id and user_id = me);
  end if;
  if topic ~* '^inbox-typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    id := substr(topic, 14)::uuid;
    if id = me then return true; end if;
    if not sending then return false; end if;
    return not public.is_blocked_between(me, id) and exists (
      select 1 from public.conversation_members a
      join public.conversation_members b on b.conversation_id = a.conversation_id
      where a.user_id = me and b.user_id = id);
  end if;
  return false;
end $$;
revoke all on function public.typing_topic_ok(text, boolean) from public, anon;
grant execute on function public.typing_topic_ok(text, boolean) to authenticated;

drop policy if exists "typing: listen in your own chats" on realtime.messages;
create policy "typing: listen in your own chats" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.typing_topic_ok(realtime.topic(), false));

drop policy if exists "typing: send in your own chats" on realtime.messages;
create policy "typing: send in your own chats" on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and public.typing_topic_ok(realtime.topic(), true));

-- Check after running (expect the two rules above):
-- select policyname, cmd, roles from pg_policies where schemaname = 'realtime';
