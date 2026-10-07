import { useSyncExternalStore } from 'react';

import type { HitRequest, ID } from '@/data/types';
import { tipWaiting } from '@/features/tips/tips';
import { joinedCount } from './audience';
import { isHitFull } from './order';

/*
 * The two hit tips (Oct 7, audit item 3; words in features/tips): which card
 * in a list of hits carries one, and the hit you have just posted, which the
 * second one is about. Only one card in a list ever carries a tip.
 */

export type HitTip = 'join-hit' | 'hit-posted';

let justPosted: ID | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** The hit you have just posted (the post sheet says so as it closes), for "We'll tell you when someone's in". */
export function markJustPosted(hitId: ID): void {
  if (justPosted === hitId) return;
  justPosted = hitId;
  listeners.forEach((fn) => fn());
}

export function useJustPosted(): ID | null {
  return useSyncExternalStore(subscribe, () => justPosted, () => justPosted);
}

/**
 * The card that carries a tip, and which: the hit you have just posted while
 * nobody is in it yet ("We'll tell you when someone's in"), else the first
 * hit in the list someone else posted that you could still join ("Tap I'm in
 * to join"). A tip already learned is passed over, so the other can still
 * have its card. Null: none here. `hits` in the order shown.
 *
 * `teen`: you are not known to be an adult, so a hit is yours to join only
 * with someone you follow (join_hit's teen rule says "teen_closed" to anyone
 * else): the tip never points at an I'm in that would only say no.
 */
export function hitTipCard(
  hits: HitRequest[], me: ID | null | undefined, posted: ID | null,
  { teen = false, followingIds = [] }: { teen?: boolean; followingIds?: ID[] } = {},
): { hitId: ID; tip: HitTip } | null {
  if (!me) return null;
  const mine = posted && tipWaiting('hit-posted') ? hits.find((h) => h.id === posted && h.authorId === me && joinedCount(h) === 0) : undefined;
  if (mine) return { hitId: mine.id, tip: 'hit-posted' };
  if (!tipWaiting('join-hit')) return null;
  const theirs = hits.find((h) => h.authorId !== me && !h.joinedIds.includes(me) && !isHitFull(h) && (!teen || followingIds.includes(h.authorId)));
  return theirs ? { hitId: theirs.id, tip: 'join-hit' } : null;
}
