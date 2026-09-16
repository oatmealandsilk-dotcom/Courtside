-- A post can be edited after posting: its words, who is tagged, and where
-- it was. edited_at is shown as "Edited" next to the date.
alter table public.posts
  add column if not exists location text,
  add column if not exists edited_at timestamptz;
