-- A photo or clip with a Community reply, the way X lets you reply with one.
-- The file itself lives in the media bucket like every other upload; the
-- reply keeps its web address, what it is, and a cover for a clip.
alter table public.answers add column if not exists media_url text check (media_url is null or (media_url like 'https://%' and char_length(media_url) <= 600));
alter table public.answers add column if not exists media_kind text check (media_kind is null or media_kind in ('photo', 'video'));
alter table public.answers add column if not exists media_thumb text check (media_thumb is null or (media_thumb like 'https://%' and char_length(media_thumb) <= 600));
-- A reply can be just a picture: the words may be empty when there is one.
alter table public.answers drop constraint if exists answers_has_something;
alter table public.answers add constraint answers_has_something check (char_length(btrim(body)) > 0 or media_url is not null) not valid;
