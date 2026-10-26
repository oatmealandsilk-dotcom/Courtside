-- CourtSide · undo for migration 20261025000188_set_hit_court.
--
-- NOT A MIGRATION (it lives outside supabase/migrations on purpose). Run it in
-- the Supabase SQL editor as one piece only to take "Set court" back out of
-- the database. It removes set_hit_court. All-or-nothing; safe to run more
-- than once.
--
-- Hits whose court was already set stay at that court, and their chats keep
-- their new names. The app keeps working after it: "Set court" finds no
-- set_hit_court and sets the hit's place directly instead (the poster may,
-- under "change your own hit", migration 43); only the chat's name then stays
-- as it was.

begin;

drop function if exists public.set_hit_court(uuid, jsonb);

do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_hit_court') then
    raise exception 'Undo of 188 stopped: set_hit_court is still there. Nothing was changed.';
  end if;
end $$;

commit;
