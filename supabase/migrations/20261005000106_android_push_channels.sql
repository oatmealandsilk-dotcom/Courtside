-- Android push alerts: on time, and in the right group (Oct 5).
--
-- send_push (migration 14) built each alert from to / title / body / sound /
-- data only. Two things were missing for Android phones; iPhones are
-- unaffected by both:
--
-- 1. priority 'high'. Without it Expo hands Android alerts to Google at
--    "normal" priority, and a phone left idle on a table (Doze) holds those
--    back: a message or a hit invite could arrive minutes late, or only when
--    the screen woke. An iPhone already gets 'high' by default.
-- 2. channelId. The Android app (from its first build) files alerts into
--    groups the person can switch on and off on their own: "Messages" for
--    chats and "Likes, replies and follows" for the rest (see
--    src/features/push/channels.ts). An iPhone ignores the field.
--
-- Same function, same arguments, same callers; only the message it builds
-- changes. Safe to run more than once.

create or replace function public.send_push(target uuid, title text, body text, href text)
returns void language plpgsql security definer set search_path = public as $$
declare
  messages jsonb;
  channel text := case when coalesce(href, '') like '/messages/%' then 'messages' else 'activity' end;
begin
  select jsonb_agg(jsonb_build_object(
    'to', token, 'title', title, 'body', left(coalesce(body, ''), 180), 'sound', 'default',
    'priority', 'high', 'channelId', channel,
    'data', jsonb_build_object('href', href)))
    into messages
    from public.push_tokens where user_id = target;
  if messages is null then return; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := messages,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
end $$;
revoke all on function public.send_push(uuid, text, text, text) from public, anon, authenticated;
