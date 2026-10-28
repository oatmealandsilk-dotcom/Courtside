-- CourtSide · undo for migration 20261027000190_players_in_town.
--
-- NOT A MIGRATION (it lives outside supabase/migrations on purpose). Run it in
-- the Supabase SQL editor as one piece only to take "Near me"'s town list back
-- out of the database. All-or-nothing; safe to run more than once.
--
-- It removes players_in_town(). Nothing else was changed by 190, so nothing
-- else needs putting back. An app already on the Near me version keeps
-- working against this: it finds no players_in_town and lists only friends
-- checked in, as before.

begin;

drop function if exists public.players_in_town();

do $$
begin
  if to_regprocedure('public.players_in_town()') is not null then
    raise exception 'Undo 190 stopped: players_in_town is still there. Nothing was changed.';
  end if;
end $$;

commit;
