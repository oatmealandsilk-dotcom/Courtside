-- 57: deleting your own public coach question.
--
-- Migration 08 let a player ask the coaches a question in the open and edit
-- it, but gave no rule for deleting one, so the database quietly refused
-- every delete: the app removed it from the phone and the question was
-- still there for everyone else (and back on the next open). From here:
--   * the player who asked a question can delete it;
--   * an admin can too, the same way admins clear the waitlist (migration
--     24), for anything that should not be up;
--   * nobody else can, signed in or not.
--
-- What goes with it: the coaches' answers to it (coach_replies), which the
-- database already deletes along with their question (migration 08). Nothing
-- else points at a coach question: notifications and reports only carry its
-- id as text, so an old "answered your question" alert opens the question's
-- page, which says it is gone. No other migration depends on this one, and
-- this one needs only 08 and 23 (admins). Safe to run more than once.
drop policy if exists "delete your own coach question" on public.coach_questions;
create policy "delete your own coach question" on public.coach_questions for delete
  using (auth.uid() = author_id or public.is_admin());
