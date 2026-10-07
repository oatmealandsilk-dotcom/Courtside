import type { Post, Question, Comment, Story, User, ID, FeedScore } from '@/data/types';
import { isNewHere } from '@/features/feed/newHere';
export type FeedItem = { type: 'post'; post: Post } | { type: 'question'; question: Question } | { type: 'hit'; story: Story } | { type: 'tip' } | { type: 'challenge' }
  // Activities' first page for a new player (components/ActivitiesStart).
  | { type: 'act-start' }
  // "You're all caught up": For you's line between what you have not seen yet and what you have.
  | { type: 'caught-up' };

/** The "You're all caught up" page's key in the feed's order (every other key is "p:", "q:" or "h:" and an id). */
export const CAUGHT_UP = 'caught-up';

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
  /** When you last saw each page on this phone, any earlier visit included, by feed key (ms; features/feed/seenPosts). */
  seenOnPhone?: ReadonlyMap<string, number>;
  /** How each post has done in feeds, by id, and whether and when you saw it (feedScores, migrations 143 and 150). */
  scores?: Record<ID, FeedScore>;
  /** The clock to rank against; fixed in the check (scripts/rank-check.mjs). */
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
/**
 * Among what you have already seen, each day since you last saw something is
 * worth this many points (up to two weeks' worth), so what you saw longest ago
 * comes round first and the best of a day leads that day.
 */
const STALE_PER_DAY = 5;
const STALE_MAX_DAYS = 14;

const newest = <T extends { createdAt: string }>(list: T[]) => [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
const cityOf = (location?: string) => (location ?? '').split(',')[0].trim().toLowerCase();
/** Hits are today's moments: yours first, then newest first. */
const orderHits = (hits: Story[], userId: string | null) =>
  [...hits].sort((a, b) => (a.authorId === userId ? -1 : b.authorId === userId ? 1 : Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id)));

/** 10 points when brand new, halving every 24 hours. */
const recency = (createdAt: string, now: number) => 10 * Math.pow(0.5, Math.max(0, now - Date.parse(createdAt)) / DAY);

/**
 * The feed, ranked, in two parts (Oct 7, owner: "don't keep seeing the same
 * videos"):
 *
 *   1. Everything you have not seen yet, best first.
 *   2. "You're all caught up" (the CAUGHT_UP page).
 *   3. Everything you have seen, on any phone, this visit or before: what you
 *      saw longest ago first (and the best of it), what you saw this visit
 *      last of all. Never a dead end.
 *
 * A post you have seen never comes above one you have not, however good it
 * is; your own posts too, once you have seen them. Threads and Instants follow
 * the same rule among themselves.
 *
 * "Best" is a score: how new it is, how much people liked, commented on,
 * saved and shared it, how close you are to its author, whether its author is
 * new here, whether it matches what you engage with, whether it is a clip
 * (clips lead), and how people watched it (held on it or swiped away, from
 * the server's totals). Each part is dealt so no author appears twice within
 * five pages, with a thread or a hit in every fourth slot. The same data
 * always deals the same order: nothing here is random.
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
  if (!posts.length && !questions.length && !hits.length) return [];
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
  const scorePost = (p: Post) =>
    recency(p.createdAt, now) + engagement(p) + closeness(p) + newCreator(p) + taste([p.kind, ...p.tags])
    + (isVideo(p) ? VIDEO_BOOST : 0) + watched(p);
  const scoreQuestion = (q: Question) => recency(q.createdAt, now) + taste([q.topic, ...q.tags]);

  /**
   * When you last saw a page, or null if you never have: on this phone (this
   * visit or before) or, for a post, on any phone (the server). The server
   * saying "seen" without saying when (migration 150 not run yet) counts as
   * seen when it was made: you cannot have seen it before that.
   */
  const lastSeen = (key: string, createdAt: string): number | null => {
    const server = key.startsWith('p:') ? scores[key.slice(2)] : undefined;
    let at = -Infinity;
    for (const t of [ctx.seenOnPhone?.get(key), server?.mySeenAt]) if (typeof t === 'number' && Number.isFinite(t) && t > at) at = t;
    if (seen.has(key)) at = Math.max(at, now);
    if (at === -Infinity && server?.seenByMe) at = Date.parse(createdAt) || 0;
    return at === -Infinity ? null : at;
  };
  // Seen: further back in "Earlier posts" the more recently you saw it; this visit's at the very end.
  const again = (key: string, createdAt: string, score: number) => {
    const at = lastSeen(key, createdAt) ?? now;
    return score + STALE_PER_DAY * Math.min(STALE_MAX_DAYS, Math.max(0, (now - at) / DAY)) - (seen.has(key) ? 1000 : 0);
  };

  // Highest first; ties by newest, then by id, so equal scores never trade places between deals.
  const byScore = <T extends { id: string; createdAt: string }>(list: T[], score: (x: T) => number) =>
    list.map((x) => ({ x, s: score(x) }))
      .sort((a, b) => b.s - a.s || Date.parse(b.x.createdAt) - Date.parse(a.x.createdAt) || a.x.id.localeCompare(b.x.id))
      .map((e) => e.x);
  const isSeen = (key: string, createdAt: string) => lastSeen(key, createdAt) !== null;
  const postSeen = (p: Post) => isSeen(`p:${p.id}`, p.createdAt);
  const questionSeen = (q: Question) => isSeen(`q:${q.id}`, q.createdAt);
  const hitSeen = (st: Story) => isSeen(`h:${st.id}`, st.createdAt);

  const freshPosts = byScore(posts.filter((p) => !postSeen(p)), scorePost);
  const seenPosts = byScore(posts.filter(postSeen), (p) => again(`p:${p.id}`, p.createdAt, scorePost(p)));
  const freshForum = byScore(questions.filter((q) => !questionSeen(q)), scoreQuestion);
  const seenForum = byScore(questions.filter(questionSeen), (q) => again(`q:${q.id}`, q.createdAt, scoreQuestion(q)));
  const freshMoments = orderHits(hits.filter((st) => !hitSeen(st)), userId);
  const seenMoments = orderHits(hits.filter(hitSeen), userId);

  const result: FeedItem[] = [];
  const authors: string[] = [];
  const push = (item: FeedItem, authorId: string) => { result.push(item); authors.push(authorId); };
  // The best page whose author has not been on any of the last four.
  const take = <T extends { authorId: string }>(list: T[]): T | undefined => {
    if (!list.length) return undefined;
    const busy = new Set(authors.slice(-(AUTHOR_GAP - 1)));
    const at = list.findIndex((x) => !busy.has(x.authorId));
    return list.splice(at < 0 ? 0 : at, 1)[0];
  };
  let threadNext = true;
  const takeMix = (forum: Question[], moments: Story[]): boolean => {
    const order = threadNext ? [forum, moments] as const : [moments, forum] as const;
    for (const list of order) {
      const x = take(list as (Question | Story)[]);
      if (!x) continue;
      threadNext = list !== forum;
      if (list === forum) push({ type: 'question', question: x as Question }, x.authorId);
      else push({ type: 'hit', story: x as Story }, x.authorId);
      return true;
    }
    return false;
  };
  /**
   * One part of the feed: its posts best first, a thread or a hit in every
   * fourth slot (counted from the part's own start). When its posts run out,
   * `rest` says what else it takes: every thread and hit left ("all"), only
   * the hits ("hits": today's moments you have not seen go above the line,
   * threads stay mixed in below), or nothing more.
   */
  const dealPart = (ranked: Post[], forum: Question[], moments: Story[], rest: 'all' | 'hits' | 'none') => {
    const start = result.length;
    for (;;) {
      const slot = result.length - start + 1;
      if (ranked.length && slot % MIX_EVERY === 0 && takeMix(forum, moments)) continue;
      const post = take(ranked);
      if (post) { push({ type: 'post', post }, post.authorId); continue; }
      if (rest === 'all' && takeMix(forum, moments)) continue;
      if (rest === 'hits') { const hit = take(moments); if (hit) { push({ type: 'hit', story: hit }, hit.authorId); continue; } }
      break;
    }
  };

  dealPart(freshPosts, freshForum, freshMoments, 'hits');
  push({ type: 'caught-up' }, '');
  // Threads and Instants not seen yet that did not fit above still come before the ones you have.
  dealPart(seenPosts, [...freshForum, ...seenForum], [...freshMoments, ...seenMoments], 'all');
  return result;
}
