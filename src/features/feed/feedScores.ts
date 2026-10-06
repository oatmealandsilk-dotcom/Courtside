import { fetchFeedScores } from '@/data/api';
import type { FeedScore, ID } from '@/data/types';

/**
 * How each post has done in feeds (migration 143), as last loaded, for
 * rankFeed: kept here rather than in the app's state because nothing on
 * screen shows it; it only orders the feed. Loaded at sign-in alongside
 * everything else and again on a later deal once a minute old.
 */
let scores: Record<ID, FeedScore> = {};
let loadedAt = 0;
let loading: Promise<void> | null = null;

export const feedScores = (): Record<ID, FeedScore> => scores;

/** Asks again when the last answer is over a minute old. Never throws: without it the feed ranks as before. */
export function loadFeedScores(): Promise<void> {
  if (loading) return loading;
  if (Date.now() - loadedAt < 60_000) return Promise.resolve();
  loading = fetchFeedScores()
    .then((next) => { scores = next; loadedAt = Date.now(); })
    .catch(() => {})
    .finally(() => { loading = null; });
  return loading;
}
