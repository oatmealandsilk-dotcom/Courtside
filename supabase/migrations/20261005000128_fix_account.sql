-- CourtSide · migration 128: the tips board's Delete and Report (account sweep, Oct 5).
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if the check below fails, it stops and
-- nothing at all changes. Safe to run more than once.
--
-- Why: every signed-in player can read every tip on the board (migration
-- 11), but a tip had no Report and its author could not take it down. The
-- app now puts "Delete" on your own tips and "Report" on everyone else's,
-- the way a coach's reply already has Report.
--
-- What it does:
--   * You can delete your own tip, and only your own. Nobody else's, and
--     nothing for signed-out visitors (they cannot read tips at all).
--   * A tip you reported stays out of sight for you on every device, the
--     way a reported post, thread or comment already does:
--     my_reported_targets (migration 115) now also hands back 'tip:' reports.
--     Only your own reports, as before.
--
-- Reports themselves need nothing new: anyone signed in could already file
-- one ('tip:<id>'), and admins see it under Reports, marked "Tip".
--
-- Needs migrations 11 and 115 (both live).

begin;

-- ------------------------------------------------------------------ 0. check
-- md5 of my_reported_targets' body: as it is live (Oct 5, migration 115), or as this file leaves it.
do $$
declare
  now_is text;
begin
  if to_regclass('public.tips') is null or to_regclass('public.reports') is null then
    raise exception 'Migration 128 stopped before changing anything: migrations 7, 8 and 11 have to run first.';
  end if;
  select md5(p.prosrc) into now_is from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'my_reported_targets';
  if now_is is null or now_is not in ('ba9fd7d997bd2197458c9f6a7a36136f', '189bdfab3f23f13d01e8cdee61b59913') then
    raise exception 'Migration 128 stopped before changing anything: my_reported_targets changed since it was written. This file must be brought up to date with that change first.';
  end if;
end $$;

-- ------------------------------------------------------- 1. delete your own tip
drop policy if exists "delete your own tip" on public.tips;
create policy "delete your own tip" on public.tips for delete to authenticated
  using (auth.uid() = user_id);

-- -------------------------------------- 2. a reported tip stays hidden for you
create or replace function public.my_reported_targets()
returns setof text
language sql stable security definer set search_path = public
as $$
  select distinct target from public.reports
  where reporter_id = auth.uid() and target ~ '^(post|hit|question|answer|comment|coach-question|coach-reply|tip):';
$$;
revoke all on function public.my_reported_targets() from public, anon;
grant execute on function public.my_reported_targets() to authenticated;

commit;

-- Checks afterwards (each should say what is in brackets):
-- select policyname, cmd, roles from pg_policies where tablename = 'tips' and cmd = 'DELETE';  -- (delete your own tip · DELETE · {authenticated})
-- select md5(prosrc) from pg_proc where proname = 'my_reported_targets';                     -- (189bdfab3f23f13d01e8cdee61b59913)
