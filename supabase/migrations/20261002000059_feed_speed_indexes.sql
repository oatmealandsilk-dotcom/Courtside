-- 59: indexes for the opening load, so it stays quick as CourtSide grows.
--
-- Applied to the live database on Oct 2, 2026, with the owner's go-ahead.
-- The app never depended on it; it only keeps the opening load quick.
--
-- Why: today every table is tiny (42 posts, 19 people) and each of the
-- opening load's asks takes 1 to 60 ms on the server. Several of them,
-- though, ask for "the newest N" of a whole table with nothing to read it
-- in date order, so the database checks who may see every single row (the
-- privacy rules run per row) and only then sorts and keeps the newest. That
-- grows with the table: on the live posts table, checking the 42 posts there
-- now took about 30 ms, so a few thousand posts would make the feed's first
-- ask take a second or more. With a date-ordered index it reads the newest
-- rows first and stops as soon as it has enough, however big the table gets.
--
-- Every statement only adds an index (a sorted lookup list, like the index
-- at the back of a book). Nothing is changed or removed, nobody can see
-- anything new, and each one takes a moment at today's sizes. "if not
-- exists" makes running it twice harmless.

-- The feed's opening ask: the newest 40 posts. The existing posts_feed_idx
-- only covers posts that are not archived, but the ask cannot say so (you
-- still see your own archived posts), so it could never use it.
create index if not exists posts_newest_idx on public.posts (created_at desc);

-- Hits (Instants): the newest 40. The existing index is on when they expire, not when they were made.
create index if not exists stories_newest_idx on public.stories (created_at desc);

-- Community threads (newest 300) and their polls (newest 300).
create index if not exists questions_newest_idx on public.questions (created_at desc);
create index if not exists polls_newest_idx on public.polls (created_at desc);

-- Coaching: questions (newest 200) with their replies, reviews (500) and results (300).
create index if not exists coach_questions_newest_idx on public.coach_questions (created_at desc);
create index if not exists coach_replies_question_idx on public.coach_replies (question_id, created_at);
create index if not exists coach_reviews_newest_idx on public.coach_reviews (created_at desc);
create index if not exists coach_results_newest_idx on public.coach_results (created_at desc);

-- Tips (newest 300).
create index if not exists tips_newest_idx on public.tips (created_at desc);

-- Everyone, oldest first, a thousand at a time.
create index if not exists profiles_joined_idx on public.profiles (created_at);

-- Rows that are yours alone, found by you rather than by scanning everyone's:
-- your poll votes, the follow asks waiting on you, the coaching you asked for,
-- and your saved posts (newest first, for the Saved page).
create index if not exists poll_votes_user_idx on public.poll_votes (user_id);
create index if not exists follow_requests_target_idx on public.follow_requests (target_id);
create index if not exists coaching_requests_user_idx on public.coaching_requests (user_id, created_at desc);
create index if not exists post_saves_user_idx on public.post_saves (user_id, created_at desc);
