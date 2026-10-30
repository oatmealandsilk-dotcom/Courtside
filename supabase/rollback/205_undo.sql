-- CourtSide · undo for migration 20261029000205_court_played_today (205).
--
-- NOT A MIGRATION (it lives outside supabase/migrations on purpose). Run it in
-- the Supabase SQL editor as one piece only to take 205 back out.
-- All-or-nothing; safe to run more than once.
--
-- It removes court_played_today() and nothing else. Afterwards the map shows no
-- "played here today" glow (the app copes with the function missing), as
-- before 205. Nothing was stored by 205, so nothing else needs undoing.

begin;

drop function if exists public.court_played_today(text[], timestamptz);

do $$
begin
  if to_regprocedure('public.court_played_today(text[], timestamptz)') is not null then
    raise exception 'Undo 205 stopped: the result was not as planned. Nothing was changed.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
