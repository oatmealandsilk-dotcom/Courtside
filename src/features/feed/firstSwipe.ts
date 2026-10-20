import { useSyncExternalStore } from 'react';

/*
 * Whether a swipe on the Feed has landed on a new page yet, since the app
 * opened. A note that can wait ("How was the hit?") holds off on the Feed
 * until then, so it never drops over the Feed's top row while someone is
 * reaching for "For you" or a group tab (owner's sweep, Oct 20: "taps meant
 * for a group open the note instead").
 */
let swiped = false;
const listeners = new Set<() => void>();

/** The Feed tells this when its page changes from a swipe. Once is enough. */
export function markFeedSwiped() {
  if (swiped) return;
  swiped = true;
  listeners.forEach((fn) => fn());
}

export function useFeedSwiped(): boolean {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => swiped,
    () => swiped,
  );
}
