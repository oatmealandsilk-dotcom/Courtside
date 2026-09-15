-- Whether a clip was shot upright or sideways, so the feed can show the
-- whole frame of a landscape video instead of cropping it to the page.
alter table public.posts
  add column if not exists orientation text
  check (orientation is null or orientation in ('portrait', 'landscape'));
