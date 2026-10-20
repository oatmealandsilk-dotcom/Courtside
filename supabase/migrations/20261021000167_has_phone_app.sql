-- CourtSide · migration 20261021000167: "have I ever used the phone app?" (Oct 20 sweep, R3).
--
-- What it is for: the website shows a calm "Get CourtSide on your iPhone"
-- card to people who signed up there, because the website cannot send
-- alerts (owner's sweep, Oct 20: "People who sign up on the website get no
-- alerts and no emails, and nothing tells them to get the app"). The card
-- goes away for good once that person has opened the phone app. This is how
-- the website finds out.
--
-- has_phone_app() answers one yes or no, only ever about the person asking:
-- yes when they have opened the app on an iPhone or Android phone on any day
-- (app_opens, migration 110) or a phone holds their alerts (push_tokens).
-- It never says anything about anyone else, and it reads no other columns.
-- Nothing is written.
--
-- Needs migration 110 (app_opens) and push_tokens (migration 14). If
-- app_opens is missing, it answers from push_tokens alone.
-- Safe to run more than once.
--
-- To check it (Supabase → SQL Editor → New query):
--   select proname from pg_proc where proname = 'has_phone_app';

begin;

create or replace function public.has_phone_app()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  seen boolean := false;
begin
  if me is null then return false; end if;
  if to_regclass('public.app_opens') is not null then
    execute 'select exists (select 1 from public.app_opens where user_id = $1 and platform in (''ios'', ''android''))'
      into seen using me;
  end if;
  if not seen then
    select exists (select 1 from public.push_tokens where user_id = me and platform in ('ios', 'android')) into seen;
  end if;
  return seen;
end $$;
revoke all on function public.has_phone_app() from public, anon;
grant execute on function public.has_phone_app() to authenticated;

commit;
