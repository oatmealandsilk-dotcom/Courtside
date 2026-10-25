-- CourtSide · undo for migration 20261024000186_court_surface_votes.
--
-- NOT A MIGRATION (it lives outside supabase/migrations on purpose). Run it in
-- the Supabase SQL editor as one piece only to take players' surface answers
-- back out. It removes vote_court_surface, the court_surface_votes table
-- (every answer in it) and courts.player_surface / player_surface_at (every
-- surface players registered). All-or-nothing; safe to run more than once.
--
-- The app keeps working after it: the courts function and the app ask for
-- player_surface and, finding no such column, ask again without it; the
-- "What surface?" row stays away once its read fails.

begin;

drop function if exists public.vote_court_surface(text, text);
drop table if exists public.court_surface_votes;
alter table if exists public.courts
  drop column if exists player_surface,
  drop column if exists player_surface_at;

do $$
begin
  if to_regclass('public.court_surface_votes') is not null
     or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'vote_court_surface')
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'courts' and column_name in ('player_surface', 'player_surface_at')) then
    raise exception 'Undo of 186 stopped: something did not go. Nothing was changed.';
  end if;
end $$;

commit;
