import { useCallback, useEffect, useRef } from 'react';

import { isCurtainDown } from '@/features/feed/warmup';
import { isPageDragging, subscribePageDragging } from '@/features/navigation/swipeLock';
import { useOnShowNow } from '@/features/navigation/tabFocus';
import { loadInOn } from '@/features/navigation/loadIn';

/*
 * When something counts as arriving (Arrive.tsx, and the website's Arrive.web.tsx): built after its
 * owner's first draw, while its page is the one on show, no finger is swiping a page or a tab, and
 * the opening curtain has gone. Anything else is simply there.
 */

/**
 * When a finger last let go of a page or tab swipe: the page goes on gliding into place for up to
 * about a third of a second after, and nothing may come in while it does (only pages slide).
 */
let letGoAt = 0;
const SETTLE_MS = 380;
subscribePageDragging(() => { if (!isPageDragging()) letGoAt = Date.now(); });
const sliding = () => isPageDragging() || Date.now() - letGoAt < SETTLE_MS;

/**
 * For the component that owns what may arrive: whether a thing being built in this draw is
 * arriving into a page already on show. Read while drawing; it never redraws anything itself.
 * `still`: never (a swipe's preview copy of a page, say).
 */
export function useArriveGate(still = false): () => boolean {
  const drawn = useRef(false);
  useEffect(() => { drawn.current = true; }, []);
  const onShowNow = useOnShowNow();
  return useCallback(() => !still && drawn.current && loadInOn() && isCurtainDown() && !sliding() && onShowNow(), [still, onShowNow]);
}

/**
 * For a list's owner: each key that is new since the list was last drawn on screen, and arriving
 * (useArriveGate), gets its beat (0, 1, 2 … in the list's order); every other key gets null.
 */
export function useArrivals(keys: readonly string[], still = false): (key: string) => number | null {
  const gate = useArriveGate(still);
  const seen = useRef<Set<string> | null>(null);
  const now = useRef(keys);
  now.current = keys;
  // After each draw reaches the screen (never during one): the keys it showed.
  useEffect(() => { seen.current = new Set(now.current); });
  const before = seen.current;
  const slots = new Map<string, number>();
  if (before && gate()) {
    let n = 0;
    for (const key of keys) if (!before.has(key)) slots.set(key, n++);
  }
  return (key: string) => slots.get(key) ?? null;
}

