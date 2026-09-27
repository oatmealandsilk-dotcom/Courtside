-- Voice notes in chats: the recording goes to the media bucket like a photo,
-- and the message keeps its address and length. Up to five minutes.
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/avif',
                                 'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-m4v',
                                 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav']
  where id = 'media';
alter table public.messages add column if not exists audio_url text check (audio_url is null or (audio_url like 'https://%' and char_length(audio_url) <= 600));
alter table public.messages add column if not exists audio_ms int check (audio_ms is null or audio_ms between 0 and 300000);

-- A court card and a voice note are fixed once sent, like the kind of message:
-- a member can react to them but not swap the court or the recording.
create or replace function public.guard_message_columns()
returns trigger language plpgsql as $$
begin
  if new.sender_id <> old.sender_id or new.conversation_id <> old.conversation_id
     or new.kind <> old.kind or new.shared_id is distinct from old.shared_id or new.created_at <> old.created_at
     or new.place is distinct from old.place or new.audio_url is distinct from old.audio_url or new.audio_ms is distinct from old.audio_ms then
    raise exception 'only reactions, and the sender''s own words, can change';
  end if;
  if new.body <> old.body then
    if auth.uid() is distinct from old.sender_id then
      raise exception 'only the sender can edit a message';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $$;
