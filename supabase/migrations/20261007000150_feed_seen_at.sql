-- 150: when you last saw each post, for "You're all caught up" (Oct 7, owner:
-- "people don't keep seeing the same videos").
--
-- The feed now puts everything you have already seen below everything you
-- have not, with "You're all caught up" between the two, and orders what you
-- have seen by how long ago you saw it (longest ago first). feed_post_scores
-- (migration 143) already says whether you saw a post on an earlier visit, on
-- any phone; this adds when (my_last_seen: the last time you had it on
-- screen, from feed_signals, migration 20).
--
-- Privacy is unchanged: the only time that leaves the server is the caller's
-- own; for everyone else, still totals only, never who looked at what.
--
-- Old app versions keep working: they read the columns they know and ignore
-- the new one. Apps from before this runs keep working too: without the
-- column, they treat "seen" as "seen when it was posted".
--
-- The answer's shape changes, which Postgres only allows by dropping and
-- making the function again: both in one transaction, so no call ever finds
-- it missing. Safe to run more than once.

begin;

drop function if exists public.feed_post_scores();

create function public.feed_post_scores()
returns table (post_id text, viewers int, looks int, watch_seconds real, skips int, profile_taps int, seen_by_me boolean, my_last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select f.target_id,
         (count(*) filter (where f.times_seen > 0 and f.user_id <> p.author_id))::int,
         coalesce(sum(f.times_seen) filter (where f.user_id <> p.author_id), 0)::int,
         coalesce(sum(f.watch_seconds) filter (where f.user_id <> p.author_id), 0)::real,
         coalesce(sum(f.skips) filter (where f.user_id <> p.author_id), 0)::int,
         coalesce(sum(f.profile_taps) filter (where f.user_id <> p.author_id), 0)::int,
         coalesce(bool_or(f.user_id = auth.uid() and f.times_seen > 0), false),
         max(f.last_seen_at) filter (where f.user_id = auth.uid() and f.times_seen > 0)
  from public.feed_signals f
  join public.posts p on p.id::text = f.target_id
  where f.target_kind = 'post' and auth.uid() is not null and p.removed_at is null
  group by f.target_id
$$;

revoke all on function public.feed_post_scores() from public, anon;
grant execute on function public.feed_post_scores() to authenticated;

commit;
