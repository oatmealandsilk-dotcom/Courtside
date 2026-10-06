import type { Post, Question, Comment, Story, User, ID, FeedScore } from '@/data/types';
import { isNewHere } from '@/features/feed/newHere';
export type FeedItem = { type: 'post'; post: Post } | { type: 'question'; question: Question } | { type: 'hit'; story: Story } | { type: 'tip' } | { type: 'challenge' }
  // Activities' first page for a new player (components/ActivitiesStart).
  | { type: 'act-start' };

/**
 * Off: the feed is ranked (see scorePost below). On: simply newest first,
 * as it was while CourtSide had only a few posts.
 */
export const NEWEST_FIRST = false;

/** What the ranking may know about you beyond the posts themselves. All optional. */
export type RankContext = {
  /** People you follow. */
  followingIds?: ID[];
  /** Who follows whom, as loaded; used for "they follow you". */
  followEdges?: { followerId: ID; followingId: ID }[];
  /** Profiles, for each author's city and join date. */
  users?: User[];
  /** Pages already shown this visit, as feed keys ("p:<id>", "q:<id>", "h:<id>"). */
  seen?: Set<string>;
  /** How each post has done in feeds, by id (feedScores, migration 143). */
  scores?: Record<ID, FeedScore>;
  /** The clock to rank against; fixed in the sanity check. */
  now?: number;
};

const DAY = 86_400_000;
/** How many slots apart one author's pages must be. */
const AUTHOR_GAP = 5;
/** Every Nth slot is a thread or a hit. */
const MIX_EVERY = 4;
/** A clip or video post's lift over a photo or words (Oct 6, owner: "push videos to top"). */
const VIDEO_BOOST = 6;
/** Looks from this many people before how it was watched counts; fewer is chance. */
const WATCH_MIN_VIEWERS = 3;

const newest = <T extends { createdAt: string }>(list: T[]) => [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
const cityOf = (location?: string) => (location ?? '').split(',')[0].trim().toLowerCase();
/** Hits are today's moments: yours first, then newest first. */
const orderHits = (hits: Story[], userId: string | null) =>
  [...hits].sort((a, b) => (a.authorId === userId ? -1 : b.authorId === userId ? 1 : Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id)));

/** 10 points when brand new, halving every 24 hours. */
const recency = (createdAt: string, now: number) => 10 * Math.pow(0.5, Math.max(0, now - Date.parse(createdAt)) / DAY);

/**
 * The feed, ranked. Each post gets a score — how new it is, how much people
 * liked, commented on, saved and shared it, how close you are to its author,
 * whether its author is new here, whether it matches what you engage with,
 * whether it is a clip (clips lead), how people watched it (held on it or
 * swiped away, from the server's totals), and whether you have seen it,
 * this visit or before —
 * then it is dealt so no author appears twice within five pages, with a
 * thread or a hit in every fourth slot. The same data always deals the same
 * order: nothing here is random.
 */
export function rankFeed(posts: Post[], questions: Question[], comments: Comment[], userId: string | null, hits: Story[] = [], ctx: RankContext = {}): FeedItem[] {
  if (NEWEST_FIRST) {
    // Posts in the order they were made; a thread and a hit after every two.
    const all = newest(posts);
    const forum = newest(questions);
    const moments = orderHits(hits, userId);
    const result: FeedItem[] = [];
    while (all.length || forum.length || moments.length) {
      for (const post of all.splice(0, 2)) result.push({ type: 'post', post });
      const question = forum.shift(); if (question) result.push({ type: 'question', question });
      const hit = moments.shift(); if (hit) result.push({ type: 'hit', story: hit });
    }
    return result;
  }
  const now = ctx.now ?? Date.now();
  const seen = ctx.seen ?? new Set<string>();

  // Taste: the tags of everything you posted, liked, commented on or upvoted.
  // Looked up once, not once per post: with thousands of both, scanning every comment for every post was the slow part.
  const commented = new Set(userId ? comments.filter((c) => c.authorId === userId).map((c) => c.postId) : []);
  const interests = new Set<string>();
  const myCourts = new Set<string>();
  posts.forEach((p) => {
    const engaged = p.authorId === userId || (!!userId && (p.likedBy.includes(userId) || !!p.savedBy?.includes(userId))) || commented.has(p.id);
    if (engaged) [p.kind, ...p.tags].forEach((t) => interests.add(t));
    if (p.authorId === userId && p.court) myCourts.add(p.court.id);
  });
  questions.forEach((q) => { if (q.authorId === userId || (!!userId && q.votedBy[userId] === 1)) [q.topic, ...q.tags].forEach((t) => interests.add(t)); });
  const taste = (tags: string[]) => tags.reduce((sum, t) => sum + (interests.has(t) ? 1 : 0), 0);

  // Closeness.
  const following = new Set(ctx.followingIds ?? []);
  const followsMe = new Set((ctx.followEdges ?? []).filter((e) => e.followingId === userId).map((e) => e.followerId));
  const usersById = new Map((ctx.users ?? []).map((u) => [u.id, u]));
  const myCity = cityOf(userId ? usersById.get(userId)?.location : undefined);
  const closeness = (p: Post) => {
    if (p.authorId === userId) return 0;
    const author = usersById.get(p.authorId);
    return (following.has(p.authorId) ? 6 : 0)
      + (followsMe.has(p.authorId) ? 3 : 0)
      + (myCity && cityOf(author?.location) === myCity ? 3 : 0)
      + (p.court && myCourts.has(p.court.id) ? 2 : 0);
  };
  // New creator: a first post still in its welcome window, or anything from someone who joined this week.
  const newCreator = (p: Post) => {
    if (p.authorId === userId) return 0;
    const joined = Date.parse(usersById.get(p.authorId)?.joinedAt ?? '');
    return isNewHere(p) || (!Number.isNaN(joined) && now - joined < 7 * DAY) ? 4 : 0;
  };
  const engagement = (p: Post) => 3 * Math.log2(1 + p.likedBy.length + 2 * p.commentIds.length + 3 * (p.savedBy?.length ?? 0) + 3 * (p.shares ?? 0));
  const scores = ctx.scores ?? {};
  const isVideo = (p: Post) => !!p.videoUrl || p.kind === 'clip';
  // How it was watched, once enough people have seen it: the share of looks that were not a
  // quick swipe-away (-5 to +5), seconds on screen per look, and taps through to its author.
  const watched = (p: Post) => {
    const sc = scores[p.id];
    if (!sc || sc.viewers < WATCH_MIN_VIEWERS || !sc.looks) return 0;
    const held = 1 - Math.min(1, sc.skips / sc.looks);
    return 10 * (held - 0.5) + 3 * Math.log2(1 + Math.min(60, sc.watchSeconds / sc.looks)) + 2 * Math.log2(1 + sc.profileTaps);
  };
  // Seen this visit, or on an earlier one: either way it gives way to something new.
  const seenBefore = (p: Post) => seen.has(`p:${p.id}`) || !!scores[p.id]?.seenByMe;
  const scorePost = (p: Post) =>
    recency(p.createdAt, now) + engagement(p) + closeness(p) + newCreator(p) + taste([p.kind, ...p.tags])
    + (isVideo(p) ? VIDEO_BOOST : 0) + watched(p) - (seenBefore(p) ? 8 : 0);
  const scoreQuestion = (q: Question) =>
    recency(q.createdAt, now) + taste([q.topic, ...q.tags]) - (seen.has(`q:${q.id}`) ? 8 : 0);

  // Highest first; ties by newest, then by id, so equal scores never trade places between deals.
  const byScore = <T extends { id: string; createdAt: string }>(list: T[], score: (x: T) => number) =>
    list.map((x) => ({ x, s: score(x) }))
      .sort((a, b) => b.s - a.s || Date.parse(b.x.createdAt) - Date.parse(a.x.createdAt) || a.x.id.localeCompare(b.x.id))
      .map((e) => e.x);
  const ranked = byScore(posts, scorePost);
  const forum = byScore(questions, scoreQuestion);
  const moments = orderHits(hits, userId);

  const result: FeedItem[] = [];
  const authors: string[] = [];
  const recent = () => new Set(authors.slice(-(AUTHOR_GAP - 1)));
  // The best page whose author has not been on any of the last four.
  const take = <T extends { authorId: string }>(list: T[]): T | undefined => {
    if (!list.length) return undefined;
    const busy = recent();
    const at = list.findIndex((x) => !busy.has(x.authorId));
    return list.splice(at < 0 ? 0 : at, 1)[0];
  };
  let threadNext = true;
  const takeMix = (): FeedItem | undefined => {
    const order = threadNext ? [forum, moments] as const : [moments, forum] as const;
    for (const list of order) {
      const x = take(list as (Question | Story)[]);
      if (!x) continue;
      threadNext = list !== forum;
      return list === forum ? { type: 'question', question: x as Question } : { type: 'hit', story: x as Story };
    }
    return undefined;
  };
  while (ranked.length || forum.length || moments.length) {
    const slot = result.length + 1;
    let item: FeedItem | undefined;
    if (slot % MIX_EVERY === 0 || !ranked.length) item = takeMix();
    if (!item) { const post = take(ranked); if (post) item = { type: 'post', post }; }
    if (!item) break;
    result.push(item);
    authors.push(item.type === 'post' ? item.post.authorId : item.type === 'question' ? item.question.authorId : item.type === 'hit' ? item.story.authorId : '');
  }
  return result;
}
