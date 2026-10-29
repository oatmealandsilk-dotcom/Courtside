-- CourtSide · undo for migration 20261029000202_teens_to_suggest (202).
--
-- NOT A MIGRATION (it lives outside supabase/migrations on purpose). Run it in
-- the Supabase SQL editor as one piece only to take 202 back out.
-- All-or-nothing; safe to run more than once.
--
-- It removes teens_to_suggest() and its table of frozen lists
-- (teen_suggestions: which teens each new teen was shown). Nothing else
-- changes. Afterwards a new teen's "People you may know" shows only those who
-- follow them, @courtside, the contacts row, the invite and Search, as before
-- 202 (the app copes with the function missing). The day's 300 counts already taken stay until they age out.

begin;

drop function if exists public.teens_to_suggest();
drop table if exists public.teen_suggestions;

do $$
begin
  if to_regprocedure('public.teens_to_suggest()') is not null
     or to_regclass('public.teen_suggestions') is not null then
    raise exception 'Undo 202 stopped: the result was not as planned. Nothing was changed.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
