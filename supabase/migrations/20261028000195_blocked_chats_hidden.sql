-- CourtSide · migration 20261028000195: a one-to-one chat's
-- messages are hidden from BOTH people while either has blocked the other.
--
-- Owner, Oct 28: "Make old chat disappear do what u need to make our thing pass".
-- Server only, no new build. Applied live Oct 28.
--
-- Why: the reply to App Review (point 3) says blocked users "cannot see each
-- other's ... messages". Live, only the blocker's inbox hides the chat (build
-- 22, app/messages/index.tsx:162); the person who was blocked still has the
-- whole history, because "members read messages" checks membership only.
-- Sending was already refused (chat_is_blocked). With this rule the history
-- is unreadable to both; build 22 then drops the chat from the blocked
-- person's inbox by itself (a one-to-one with no messages is not listed).
-- Unblocking brings it all back: nothing is deleted. Group chats are not
-- touched (chat_is_blocked is false for a group).
--
-- This does NOT make "cannot see each other's profiles" true (profiles stay
-- public, and build 22's own Blocked page says "They can still see your
-- profile"), so the reply still needs the wording fix either way.
--
-- Undo: drop policy if exists "blocked chats are hidden" on public.messages;

begin;
drop policy if exists "blocked chats are hidden" on public.messages;
create policy "blocked chats are hidden" on public.messages
  as restrictive for select to authenticated
  using (not public.chat_is_blocked(conversation_id));
commit;
