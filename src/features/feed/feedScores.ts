import { fetchFeedScores } from '@/data/api';
import type { FeedScore, ID } from '@/data/types';

/**
 * How each post has done in feeds (migration 143), and whether and when you
 * saw it on any phone (migration 150), as last loaded, for rankFeed: kept
 * here rather than in the app's state because nothing on screen shows it; it
 * only orders the feed. Loaded at sign-in alongside everything else, again
 * on a later deal once a minute old, and afresh (`force`) when For you is
 * dealt from the top: a pull, or coming back to the app after a while.
 */
let scores: Record<ID, FeedScore> = {};
let loadedAt = 0;
let loading: Promise<void> | null = null;
/** Whose answer `scores` is ("whether you saw it" differs per account). */
let owner: string | null = null;

export const feedScores = (): Record<ID, FeedScore> => scores;

/**
 * Asks again when the last answer is over a minute old, or always with
 * `force`. Named for another account than the last answer's, that answer is
 * dropped at once and the new one asked for. Never throws: without it the
 * feed ranks from this phone's own record of what you have seen.
 */
export function loadFeedScores({ force = false, userId }: { force?: boolean; userId?: string | null } = {}): Promise<void> {
  if (userId !== undefined && userId !== owner) {
    owner = userId;
    scores = {};
    loadedAt = 0;
    loading = null;
  }
  if (loading) return loading;
  if (!force && Date.now() - loadedAt < 60_000) return Promise.resolve();
  const asker = owner;
  const run = fetchFeedScores()
    .then((next) => { if (owner !== asker) return; scores = next; loadedAt = Date.now(); })
    .catch(() => {})
    .finally(() => { if (loading === run) loading = null; });
  loading = run;
  return run;
}
