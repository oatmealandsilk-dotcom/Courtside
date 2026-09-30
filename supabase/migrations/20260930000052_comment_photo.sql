-- A comment can carry one photo, the way Instagram's can: its web address,
-- after the app has shrunk it (about 1080 px, a couple of hundred KB) and
-- uploaded it to storage. Safe to run more than once.
alter table public.comments add column if not exists image_url text check (image_url is null or char_length(image_url) <= 1000);
