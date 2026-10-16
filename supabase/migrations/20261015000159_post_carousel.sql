-- CourtSide · migration 159, post_carousel (Oct 15): a post can carry up to
-- ten photos that swipe left and right, like an Instagram carousel.
--
-- NOT APPLIED — the lead applies it. Run it in the Supabase SQL editor as one
-- piece, ideally BEFORE the app that posts carousels goes out (a push to main
-- or an update to phones). Safe to run more than once. Until it runs, the new
-- app still posts: the photos list is dropped and the post goes up with its
-- first photo only, and the poster is told so.
--
-- William (owner), Oct 15: "can you make post so you can do carousel. So
-- select multiple photos, just posts though".
--
-- In plain words, what changes:
--
--   1. The posts table gets one more optional column, image_urls: every photo
--      of a carousel in order, the first one being the cover. It is empty
--      (null) on every other post, so nothing already posted changes.
--   2. image_url does NOT change at all and is still the cover. Phones on
--      older builds (the App Store review build included) read only
--      image_url, so they simply show a carousel as its first photo.
--   3. A rule on the new column: either empty, or 2 to 10 photos, none of
--      them blank, each address at most 2000 characters (the same limit as
--      image_url, migration 101), and the first one must be the cover.
--      The app keeps to this itself; the rule only stops anything else.
--   4. A suspended account cannot change its photos list either: the
--      "frozen while suspended" check on posts (migration 115) now watches
--      image_urls too. Nothing else about that check changes.
--
-- Who can read the column: the same people who can read the post, under the
-- posts table's existing rules. No new permission is given to anyone.

alter table public.posts add column if not exists image_urls text[];

-- Each address no longer than image_url's own limit. A table rule cannot
-- look inside a list by itself, so a small fixed helper does it.
create or replace function public.post_photo_urls_ok(urls text[])
returns boolean language sql immutable set search_path = public as $$
  select urls is null or (
    cardinality(urls) between 2 and 10
    -- array_position finds a null too (it compares with "is not distinct from").
    and array_position(urls, null) is null
    and array_position(urls, '') is null
    and not exists (select 1 from unnest(urls) u where char_length(u) > 2000)
  )
$$;

alter table public.posts drop constraint if exists posts_image_urls_shape;
alter table public.posts add constraint posts_image_urls_shape
  check (public.post_photo_urls_ok(image_urls) and (image_urls is null or image_urls[1] is not distinct from image_url))
  not valid;
-- Nothing has the column filled yet, so the rule can be checked against
-- every row at once (on a second run, it re-checks the same rows).
alter table public.posts validate constraint posts_image_urls_shape;

-- The frozen-while-suspended check on posts, with image_urls added. Only
-- the posts trigger is made again; the function itself (migration 115) is
-- unchanged and the other tables keep theirs as they were.
do $$
begin
  if to_regprocedure('public.refuse_suspended_edit()') is not null then
    drop trigger if exists refuse_suspended_edit on public.posts;
    create trigger refuse_suspended_edit before update on public.posts for each row
      execute function public.refuse_suspended_edit('author_id', 'body', 'image_url', 'image_urls', 'video_url', 'thumbnail_url', 'media_label', 'tags', 'location');
  end if;
end $$;

-- PostgREST learns about the new column straight away (no restart needed).
notify pgrst, 'reload schema';

-- Checks, to run afterwards (each should say what is in brackets):
--
-- (a) The column is there (one row, text[]):
--   select data_type, udt_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'posts' and column_name = 'image_urls';
--
-- (b) The rule is there and checked (one row, convalidated = true):
--   select conname, convalidated from pg_constraint where conname = 'posts_image_urls_shape';
--
-- (c) The posts trigger watches image_urls (one row whose tgargs mention image_urls):
--   select tgname, encode(tgargs, 'escape') from pg_trigger
--   where tgrelid = 'public.posts'::regclass and tgname = 'refuse_suspended_edit';
