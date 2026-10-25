import { useSyncExternalStore } from 'react';

/**
 * Whether the Feed has a picture (a clip, an Instant) filling the screen
 * right now, as its own top row reads it. The quiet pill (tabBarLook)
 * turns dark over it the way today's glass does, so its icons stay readable.
 */
let onPicture = false;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const read = () => onPicture;

export function setFeedOnPicture(next: boolean) {
  if (next === onPicture) return;
  onPicture = next;
  listeners.forEach((fn) => fn());
}

export function useFeedOnPicture(): boolean {
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * On the phone: whether the Feed is the tab the tab row (TabsPager) mostly
 * shows under the bar right now, as the row slides, not as the address says.
 * A tap to or from the Feed changes the address at the tap, while the row is
 * still showing the tab being left for most of a quarter second; the bar turns
 * dark or light once, as the Feed passes half way under it, rather than at the
 * tap with a fading copy over it (Oct 25 audit: a solid white or black slab
 * that washed through grey). Null where there is no row (the browser, whose
 * tabs change in one go with the address).
 */
let rowOnFeed: boolean | null = null;
const rowListeners = new Set<() => void>();
const subscribeRow = (fn: () => void) => { rowListeners.add(fn); return () => { rowListeners.delete(fn); }; };
const readRow = () => rowOnFeed;

export function setRowOnFeed(next: boolean | null) {
  if (next === rowOnFeed) return;
  rowOnFeed = next;
  rowListeners.forEach((fn) => fn());
}

export function useRowOnFeed(): boolean | null {
  return useSyncExternalStore(subscribeRow, readRow, readRow);
}
