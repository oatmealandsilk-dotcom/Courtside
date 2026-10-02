-- 61: photos in chats.
--
-- NOT APPLIED. This file has not been run on the live database. It needs the
-- owner's OK first (it adds a storage shelf, rules on who can open it, a
-- column on messages, new words for the phone alert, and a way for admins
-- to look at and remove a reported photo). Until it runs, the app hides the
-- photo button in chats and everything else works as before. Run it together
-- with the new delete-account function (see 6 below).
--
-- What it does, the way WhatsApp and Instagram keep chat photos:
--
--   * A PRIVATE shelf, "chat-photos", for pictures sent in chats. Unlike the
--     public media shelf (posts, avatars, voice notes), nothing on it has a
--     public address: the app asks for a link that works for an hour, and the
--     storage server only hands one out to someone allowed to see it.
--   * Each photo is kept at "<chat id>/<sender id>/<name>.jpg", so the rules
--     can tell from the address alone which chat it belongs to and who sent it.
--     Only JPEGs: the phone always re-draws a photo as a JPEG before it goes
--     up, which also strips what the camera wrote into it (where it was taken).
--   * Who can do what with a photo:
--       - open it: anyone in that chat right now, once it is part of a
--         message there. A photo whose message was unsent (or never sent, or
--         whose sender deleted their account) can no longer be opened, even
--         if its file is still on the shelf. Someone who leaves or is taken
--         out of a group can no longer open its photos (new or old); nobody
--         outside the chat ever can, and signed-out visitors never can. The
--         sender can always open their own (that is how an upload checks
--         itself, and how a retry works).
--       - put one up: only into your own folder, only in a chat you are in,
--         not in a one-to-one chat locked by a block (the same rule as
--         sending a message: in a group, both people can still send), and
--         not while your account is suspended. At most 200 a day per person.
--       - take one down: only your own (Unsend does this).
--       - nobody can replace a photo once it is up.
--       - admins: only the photos of a chat someone reported, to act on the
--         report (see 4).
--   * messages.photos: the photos of a message of kind 'photo' (1 to 10 of
--     them, each with where it is kept and its width and height). Only a
--     message of kind 'photo' has photos, and a photo message always has them.
--     Every photo must be in this chat's folder and the sender's own, and
--     already on the shelf when the message is sent. Once sent, they never
--     change (like a court card or a voice note).
--   * The phone alert says "Sent a photo" or "Sent 3 photos".
--
-- Replaces three functions as migration 54 left them (checked against the
-- live database on October 2): guard_message_columns (adds photos to what
-- cannot change), push_for_message (adds the photo words) and
-- report_chat_context (adds each message's id and photos). Migrations 60 and
-- 62 do not touch any of them; if a later one does, merge by hand first.
--
-- Needs migrations 06, 12, 21, 23, 36, 44 and 54. Safe to run more than once.
-- Nothing here deletes or changes any message already sent.

-- ============================================================ 1. the private shelf

-- The column comes first: the rules below look a photo up in its message.
alter table public.messages add column if not exists photos jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The chat a photo belongs to, read from its address
-- ("<chat id>/<sender id>/<name>.jpg"). Null for any address not in exactly
-- that shape, so a malformed one matches no chat.
create or replace function public.chat_photo_chat(object_name text)
returns uuid language sql immutable as $$
  select case when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,80}\.jpg$'
    then split_part(object_name, '/', 1)::uuid end;
$$;

-- Who put a photo up, read from its address the same way.
create or replace function public.chat_photo_sender(object_name text)
returns uuid language sql immutable as $$
  select case when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,80}\.jpg$'
    then split_part(object_name, '/', 2)::uuid end;
$$;

-- Whether a photo is part of a message still in its chat. Unsent, never
-- sent, or gone with its sender's account: false, and nobody else can open it.
create or replace function public.chat_photo_sent(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.messages m
    where m.conversation_id = public.chat_photo_chat(object_name)
      and m.kind = 'photo'
      and m.photos @> jsonb_build_array(jsonb_build_object('path', object_name)));
$$;
revoke all on function public.chat_photo_sent(text) from public, anon;
grant execute on function public.chat_photo_sent(text) to authenticated;
-- Finds a photo's message quickly, however long the chat.
create index if not exists messages_photo_paths on public.messages using gin (photos jsonb_path_ops) where kind = 'photo';

-- How many chat photos you have put up in the last day (the cap below).
-- Only ever counts your own, so it tells nobody anything about anyone else.
create or replace function public.my_chat_photos_today()
returns int language sql stable security definer set search_path = public, storage as $$
  select count(*)::int from storage.objects o
  where o.bucket_id = 'chat-photos'
    and split_part(o.name, '/', 2) = auth.uid()::text
    and o.created_at > now() - interval '1 day';
$$;
revoke all on function public.my_chat_photos_today() from public, anon;
grant execute on function public.my_chat_photos_today() to authenticated;

-- Whether your account is suspended (migration 23): a suspended account
-- cannot message, so it cannot put chat photos up either.
create or replace function public.i_am_suspended()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and suspended_at is not null);
$$;
revoke all on function public.i_am_suspended() from public, anon;
grant execute on function public.i_am_suspended() to authenticated;

-- Whether you are an admin and someone reported this chat: only then may
-- you look at its photos. False for everyone else, so it tells nobody
-- whether their chat was reported.
create or replace function public.admin_can_review_chat(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select conv is not null and public.is_admin()
    and exists (select 1 from public.reports r where r.target = 'conversation:' || conv::text);
$$;
revoke all on function public.admin_can_review_chat(uuid) from public, anon;
grant execute on function public.admin_can_review_chat(uuid) to authenticated;

-- The rules. Each one names only this shelf, so the media shelf's rules are
-- untouched. They are for signed-in people only: a visitor gets nothing.
drop policy if exists "chat members see chat photos" on storage.objects;
create policy "chat members see chat photos" on storage.objects for select to authenticated
  using (bucket_id = 'chat-photos' and (
    public.chat_photo_sender(name) = auth.uid()
    or (public.is_member(public.chat_photo_chat(name)) and public.chat_photo_sent(name))));

drop policy if exists "admins see reported chat photos" on storage.objects;
create policy "admins see reported chat photos" on storage.objects for select to authenticated
  using (bucket_id = 'chat-photos' and public.admin_can_review_chat(public.chat_photo_chat(name)));

drop policy if exists "chat members add chat photos" on storage.objects;
create policy "chat members add chat photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-photos'
    and public.chat_photo_sender(name) = auth.uid()
    and public.is_member(public.chat_photo_chat(name))
    and not public.chat_is_blocked(public.chat_photo_chat(name))
    and not public.i_am_suspended()
    and public.my_chat_photos_today() < 200
  );

drop policy if exists "senders remove their chat photos" on storage.objects;
create policy "senders remove their chat photos" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-photos' and public.chat_photo_sender(name) = auth.uid());

drop policy if exists "admins remove reported chat photos" on storage.objects;
create policy "admins remove reported chat photos" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-photos' and public.admin_can_review_chat(public.chat_photo_chat(name)));

-- ============================================================ 2. photo messages

-- Whether a message's photos are well made: a list of 1 to 10, each
-- {"path": "<this chat>/<this sender>/<name>.jpg", "w": width, "h": height}
-- with nothing else in it, no address twice. Only looks at what it is given.
create or replace function public.chat_photos_ok(p jsonb, conv uuid, sender uuid)
returns boolean language plpgsql immutable as $$
declare
  x jsonb;
  pattern text;
  seen text[] := '{}';
begin
  if p is null or conv is null or sender is null or jsonb_typeof(p) <> 'array' then return false; end if;
  if jsonb_array_length(p) not between 1 and 10 or pg_column_size(p) > 4000 then return false; end if;
  pattern := '^' || conv::text || '/' || sender::text || '/[A-Za-z0-9_-]{1,80}\.jpg$';
  for x in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(x) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(x) k where k not in ('path', 'w', 'h')) then return false; end if;
    if jsonb_typeof(x->'path') is distinct from 'string'
       or jsonb_typeof(x->'w') is distinct from 'number'
       or jsonb_typeof(x->'h') is distinct from 'number' then
      return false;
    end if;
    if (x->>'path') !~ pattern or (x->>'path') = any (seen) then return false; end if;
    if (x->>'w')::numeric not between 1 and 20000 or (x->>'h')::numeric not between 1 and 20000 then return false; end if;
    seen := seen || (x->>'path');
  end loop;
  return true;
end $$;

-- Put on afresh each run, so a re-run never stacks a second copy.
alter table public.messages drop constraint if exists messages_photos_ok;
alter table public.messages add constraint messages_photos_ok
  check (photos is null or public.chat_photos_ok(photos, conversation_id, sender_id));
alter table public.messages drop constraint if exists messages_photos_kind;
alter table public.messages add constraint messages_photos_kind
  check ((kind = 'photo') = (photos is not null));

-- A photo message only goes in once every one of its photos is on the shelf,
-- so no chat ever shows a picture that is not there.
create or replace function public.guard_chat_photos()
returns trigger language plpgsql security definer set search_path = public, storage as $$
declare
  missing int;
begin
  if new.kind is distinct from 'photo' then return new; end if;
  if new.photos is null or jsonb_typeof(new.photos) <> 'array' then
    raise exception 'a photo message needs its photos';
  end if;
  select count(*) into missing
    from jsonb_array_elements(new.photos) as e(x)
    where not exists (select 1 from storage.objects o where o.bucket_id = 'chat-photos' and o.name = e.x->>'path');
  if missing > 0 then raise exception 'photo not uploaded'; end if;
  return new;
end $$;
revoke all on function public.guard_chat_photos() from public, anon, authenticated;
drop trigger if exists guard_chat_photos on public.messages;
create trigger guard_chat_photos before insert on public.messages
  for each row execute function public.guard_chat_photos();

-- What can change on a message once sent (latest was migration 54): the
-- same rules, with the photos added to what is fixed.
create or replace function public.guard_message_columns()
returns trigger language plpgsql as $$
declare
  me text := auth.uid()::text;
  mine jsonb;
begin
  if new.sender_id <> old.sender_id or new.conversation_id <> old.conversation_id
     or new.kind <> old.kind or new.shared_id is distinct from old.shared_id or new.created_at <> old.created_at
     or new.place is distinct from old.place or new.audio_url is distinct from old.audio_url or new.audio_ms is distinct from old.audio_ms
     or new.event is distinct from old.event or new.photos is distinct from old.photos then
    raise exception 'only reactions, and the sender''s own words, can change';
  end if;
  if old.kind = 'system' and new.body is distinct from old.body then
    raise exception 'event lines cannot be edited';
  end if;
  if new.body <> old.body then
    if auth.uid() is distinct from old.sender_id then
      raise exception 'only the sender can edit a message';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  if me is not null then
    if old.kind = 'system' then
      new.reactions := old.reactions;
    else
      mine := new.reactions -> me;
      if mine is not null and (jsonb_typeof(mine) <> 'string' or char_length(mine #>> '{}') not between 1 and 16) then
        raise exception 'bad reaction';
      end if;
      new.reactions := (coalesce(old.reactions, '{}'::jsonb) - me)
        || case when mine is null then '{}'::jsonb else jsonb_build_object(me, mine) end;
    end if;
  end if;
  return new;
end $$;

-- ============================================================ 3. the phone alert

-- The alert for a new message (latest was migration 54). Exactly as it was,
-- plus: a photo message says "Sent a photo", or "Sent 3 photos".
create or replace function public.push_for_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  sender_first text;
  words text;
  grp boolean;
  named text;
  mentioned text[];
  link text;
  r record;
  n int;
begin
  if new.kind = 'system' then return new; end if;
  link := '/messages/' || new.conversation_id;
  select coalesce(nullif(p.name, ''), p.handle), coalesce(nullif(split_part(btrim(p.name), ' ', 1), ''), p.handle)
    into who, sender_first
    from public.profiles p where p.id = new.sender_id;
  who := coalesce(who, 'New message');
  sender_first := coalesce(sender_first, 'Someone');
  n := case when jsonb_typeof(new.photos) = 'array' then jsonb_array_length(new.photos) else 0 end;
  words := case new.kind
    when 'post' then 'Sent a clip'
    when 'question' then 'Sent a thread'
    when 'profile' then 'Sent a profile'
    when 'court' then 'Sent a court' || coalesce(': ' || nullif(new.place->>'name', ''), '')
    when 'voice' then 'Sent a voice message'
    when 'hit-request' then 'Sent a hit'
    when 'photo' then case when n > 1 then 'Sent ' || n || ' photos' else 'Sent a photo' end
    else coalesce(nullif(new.body, ''), 'Sent a message') end;
  mentioned := array(
    select distinct lower(x.parts[1])
    from regexp_matches(coalesce(new.body, ''), '@([A-Za-z0-9_]{2,24})', 'g') as x(parts));
  select coalesce(c.is_group, false), nullif(btrim(c.title), '') into grp, named
    from public.conversations c where c.id = new.conversation_id;
  for r in
    select m.user_id
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
    left join public.user_state s on s.user_id = m.user_id
    left join public.conversation_prefs cp on cp.user_id = m.user_id and cp.conversation_id = m.conversation_id
    where m.conversation_id = new.conversation_id
      and m.user_id <> new.sender_id
      and s.push_messages is not false
      and not public.is_blocked_between(m.user_id, new.sender_id)
      and (cp.muted_until is null or cp.muted_until <= now() or lower(p.handle) = any (mentioned))
  loop
    if not coalesce(grp, false) then
      perform public.send_push(r.user_id, who, words, link);
    elsif named is not null then
      perform public.send_push(r.user_id, who || ' in ' || named, words, link);
    else
      perform public.send_push(r.user_id, public.group_label(new.conversation_id, r.user_id), sender_first || ': ' || words, link);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists push_for_message on public.messages;
create trigger push_for_message after insert on public.messages
  for each row execute function public.push_for_message();

-- ============================================================ 4. reported photos

-- What an admin sees of a reported chat (latest was migration 54). Exactly
-- as it was, plus each message's id (so one can be removed) and, for a
-- photo message, its photos (the admin rules in 1 open them). Shape:
--   {"title": text or null, "is_group": true/false, "members": [ids],
--    "messages": [{"id": id, "sender": id, "body": text, "kind": text,
--                  "created_at": time, "photos": [{path, w, h}] or null}]}
create or replace function public.report_chat_context(conv uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  ctx jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.reports r where r.target = 'conversation:' || conv::text) then
    raise exception 'not reported';
  end if;
  select jsonb_build_object(
      'title', c.title,
      'is_group', coalesce(c.is_group, false),
      'members', coalesce((select jsonb_agg(m.user_id order by m.joined_at, m.user_id)
                           from public.conversation_members m where m.conversation_id = c.id), '[]'::jsonb),
      'messages', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'sender', x.sender_id, 'body', x.body, 'kind', x.kind, 'created_at', x.created_at, 'photos', x.photos)
                                             order by x.created_at, x.id)
                            from (select mm.id, mm.sender_id, mm.body, mm.kind, mm.created_at, mm.photos from public.messages mm
                                  where mm.conversation_id = c.id
                                  order by mm.created_at desc, mm.id desc limit 30) x), '[]'::jsonb))
    into ctx
    from public.conversations c where c.id = conv;
  return ctx;
end $$;
revoke all on function public.report_chat_context(uuid) from public, anon;
grant execute on function public.report_chat_context(uuid) to authenticated;

-- An admin takes one message out of a reported chat (an abusive photo, say):
-- it is gone for everyone in the chat at once, and its photos can no longer
-- be opened by anyone in it. Hands back the photos' addresses, so the app
-- can then take the files off the shelf (the admin rule in 1 allows it).
-- Event lines stay: they are the chat's own record.
create or replace function public.remove_reported_message(msg uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.messages%rowtype;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into m from public.messages where id = msg;
  if not found then return '[]'::jsonb; end if;
  if m.kind = 'system' then raise exception 'event lines stay'; end if;
  if not exists (select 1 from public.reports r where r.target = 'conversation:' || m.conversation_id::text) then
    raise exception 'not reported';
  end if;
  delete from public.messages where id = msg;
  return coalesce((select jsonb_agg(e.x->>'path') from jsonb_array_elements(coalesce(m.photos, '[]'::jsonb)) as e(x)), '[]'::jsonb);
end $$;
revoke all on function public.remove_reported_message(uuid) from public, anon;
grant execute on function public.remove_reported_message(uuid) to authenticated;

-- ============================================================ 5. deleting an account

-- Every chat photo one person ever put up, wherever it is (chats they left
-- included), for the delete-account function: files never go with the
-- account on their own. Only that function (the service role) may ask.
-- Hands back up to `max` names at a time (the function removes those, then asks again).
create or replace function public.chat_photo_names_of(who uuid, max int default 100)
returns text[] language sql stable security definer set search_path = public, storage as $$
  select coalesce(array_agg(x.name), '{}') from (
    select o.name from storage.objects o
    where o.bucket_id = 'chat-photos' and split_part(o.name, '/', 2) = who::text
    order by o.name
    limit greatest(1, least(coalesce(max, 100), 1000))) x;
$$;
revoke all on function public.chat_photo_names_of(uuid, int) from public, anon, authenticated;
grant execute on function public.chat_photo_names_of(uuid, int) to service_role;

-- ============================================================ 6. checks to run afterwards
-- Also deploy the delete-account function from this same version of the app
-- (supabase/functions/delete-account), so deleting an account clears its
-- chat photos too.
--
-- Read-only: each only looks. Paste one at a time into the SQL editor
-- (remove the leading "-- ") after running this file.
--
-- (a) The shelf is there, private, JPEGs only (expect one row: chat-photos, false, 10485760, {image/jpeg}):
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'chat-photos';
--
-- (b) Its five rules (expect: two DELETE, one INSERT, two SELECT, all for authenticated):
-- select policyname, cmd, roles from pg_policies where schemaname = 'storage' and tablename = 'objects'
--   and policyname in ('chat members see chat photos', 'admins see reported chat photos', 'chat members add chat photos',
--                      'senders remove their chat photos', 'admins remove reported chat photos') order by 1;
--
-- (c) The new column and its two rules (expect photos / jsonb, then messages_photos_kind and messages_photos_ok):
-- select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'photos';
-- select conname from pg_constraint where conrelid = 'public.messages'::regclass and conname like 'messages_photos%' order by 1;
--
-- (d) The triggers on messages (expect the nine from migration 54 plus guard_chat_photos):
-- select tgname from pg_trigger where tgrelid = 'public.messages'::regclass and not tgisinternal order by 1;
--
-- (e) The alert knows photos, and admins get photo ids (expect true, true):
-- select (select prosrc like '%Sent a photo%' from pg_proc where proname = 'push_for_message' and pronamespace = 'public'::regnamespace),
--        (select prosrc like '%''photos'', x.photos%' from pg_proc where proname = 'report_chat_context' and pronamespace = 'public'::regnamespace);
--
-- (f) Nothing on the shelf has a public address (expect 0; a public bucket would make every link work for anyone):
-- select count(*) from storage.buckets where id = 'chat-photos' and public;
