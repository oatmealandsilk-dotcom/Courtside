import { useSyncExternalStore } from 'react';

import { spacing } from '@/theme';

/**
 * How far down the message banner (src/components/MessageBanner.tsx) reaches
 * right now, counted from the bottom of the status bar: 0 when it is not on
 * show. The toast and the posting strip sit on the same strip at the top, so
 * while a banner is down they move just under it instead of being hidden
 * behind it, the way Instagram stacks the two.
 */
let reach = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const read = () => reach;

export function setBannerReach(points: number) {
  if (points === reach) return;
  reach = points;
  listeners.forEach((fn) => fn());
}

/** How far something whose top sits `ownTop` below the status bar moves down to clear the banner (0 with no banner). */
export function useBelowBanner(ownTop: number): number {
  const r = useSyncExternalStore(subscribe, read, read);
  return r ? Math.max(0, r + spacing.sm - ownTop) : 0;
}
