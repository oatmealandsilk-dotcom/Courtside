-- How each post has done in feeds, for the ranking (Oct 6, owner: "push
-- videos to top"). feed_signals (migration 20) has held every look since
-- Sep 19: seen, seconds on screen, quick swipe-aways (under 1.5 s) and taps
-- through to the author. This adds them up per post, leaving out the
-- author's own looks, plus whether the caller saw it on an earlier visit, so
-- the feed can lift what people watch and sink what they have already seen.
-- Only totals leave the server: never who looked at what.
create or replace function public.feed_post_scores()
returns table (post_id text, viewers int, looks int, watch_seconds real, skips int, profile_taps int, seen_by_me boolean)
language sql stable security definer set search_path = public as $$
  select f.target_id,
         (count(*) filter (where f.times_seen > 0 and f.user_id <> p.author_id))::int,
         coalesce(sum(f.times_seen) filter (where f.user_id <> p.author_id), 0)::int,
         coalesce(sum(f.watch_seconds) filter (where f.user_id <> p.author_id), 0)::real,
         coalesce(sum(f.skips) filter (where f.user_id <> p.author_id), 0)::int,
         coalesce(sum(f.profile_taps) filter (where f.user_id <> p.author_id), 0)::int,
         coalesce(bool_or(f.user_id = auth.uid() and f.times_seen > 0), false)
  from public.feed_signals f
  join public.posts p on p.id::text = f.target_id
  where f.target_kind = 'post' and auth.uid() is not null and p.removed_at is null
  group by f.target_id
$$;
revoke all on function public.feed_post_scores() from public, anon;
grant execute on function public.feed_post_scores() to authenticated;
