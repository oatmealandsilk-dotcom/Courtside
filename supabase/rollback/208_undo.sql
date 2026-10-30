-- CourtSide · undo of migration 20261030000208: friends no longer hear when
-- someone lights a court.
--
-- Run it in the Supabase SQL editor as one piece. All-or-nothing; safe to run
-- more than once. Afterwards: no new "Robert is playing at Rowena Courts"
-- alerts; the phone-alert trigger on notifications is exactly as migration
-- 181 left it; send_push, check_in_at_court and every other function are as
-- they were (208 never changed them). Alerts already sent stay in people's
-- Notifications (the app still shows them).

begin;

drop trigger if exists tell_friends_at_court on public.court_checkins;
drop function if exists public.tell_friends_at_court();
drop function if exists public.send_push_grouped(uuid, text, text, text, text);
drop table if exists public.friend_court_sends;

-- Migration 181's trigger, as it was.
drop trigger if exists push_for_notification on public.notifications;
create trigger push_for_notification after insert on public.notifications
  for each row when (new.kind not in ('map-friend-hit', 'map-new-hit', 'map-new-player', 'court-activity', 'hit-invite', 'group-invite'))
  execute function public.push_for_notification();

do $$
begin
  if to_regprocedure('public.tell_friends_at_court()') is not null
     or exists (select 1 from pg_trigger t where t.tgrelid = 'public.notifications'::regclass and t.tgname = 'push_for_notification'
                and pg_get_triggerdef(t.oid) like '%friend-court%') then
    raise exception 'Undo 208 did not finish.';
  end if;
end $$;

commit;
