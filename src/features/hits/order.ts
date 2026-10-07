import type { HitRequest, ID } from '@/data/types';
import { joinedCount } from './audience';

/** Whether this account posted the hit or is in it. */
export const isMyHit = (hit: Pick<HitRequest, 'authorId' | 'joinedIds'>, me: ID | null): boolean =>
  !!me && (hit.authorId === me || hit.joinedIds.includes(me));

/** Whether every spot is taken (counting the people this account is not shown). */
export const isHitFull = (hit: Pick<HitRequest, 'spots' | 'joinedIds' | 'hiddenJoins'>): boolean => joinedCount(hit) >= hit.spots;

/**
 * The order a list of hit cards is shown in (Oct 7, audit items 18 and 19):
 * the ones you posted or are in first, soonest first, so your own plans are
 * never buried; then the ones you could still join; then the full ones,
 * which can only be looked at. Inside the last two, the order they came in
 * (near first, soonest first) is kept. Only the order changes: which hits
 * show is decided before this, by the same rules as always.
 */
export function hitListOrder<T>(items: T[], hitOf: (item: T) => HitRequest, me: ID | null): T[] {
  const mine: T[] = [];
  const open: T[] = [];
  const full: T[] = [];
  for (const item of items) {
    const hit = hitOf(item);
    (isMyHit(hit, me) ? mine : isHitFull(hit) ? full : open).push(item);
  }
  mine.sort((a, b) => hitOf(a).startsAt.localeCompare(hitOf(b).startsAt));
  return [...mine, ...open, ...full];
}
