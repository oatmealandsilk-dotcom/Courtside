-- CourtSide · migration 20261006000140: King of the Court held back until
-- after launch (owner, Oct 6: "I agree that all of these should be slowly
-- integrated in except for the activity log"; boards look empty with few
-- players).
--
-- One new switch, 'flag:court-kings', in server_settings, starting 'admins':
-- only admin accounts see the King of the Court card on a court's page. The
-- app reads it through my_flags() (migration 58) like every other switch, and
-- treats a missing switch, or one it can't read, as off. Nothing is deleted:
-- court_kings() (migration 130) keeps working the boards out as before.
--
-- To open it to everyone later:
--   update public.server_settings set value = 'on', updated_at = now() where key = 'flag:court-kings';
--
-- Safe to run more than once: never changes a value already set.

begin;

insert into public.server_settings (key, value) values ('flag:court-kings', 'admins') on conflict (key) do nothing;

do $$
begin
  if not exists (select 1 from public.server_settings where key = 'flag:court-kings') then
    raise exception 'migration 140: flag:court-kings is missing';
  end if;
end $$;

commit;
