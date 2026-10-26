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
 * The bottom bar on the Feed (Oct 26, owner: "Right now in feed the bottom bar keeps changing
 * between dark and light when I land on post vs reel. What's a solution for this").
 *
 *   false  Today: the bar turns dark over a picture (a clip, an Instant) and light again over a
 *          written post, so it changes as you swipe from one to the next.
 *   true   Option A: while the Feed is the tab on show, the bar keeps its dark look for every
 *          post, written ones included, the way TikTok's and Instagram Reels' bars stay put.
 *          The other tabs, and a page opened over the Feed (a player, a court), keep today's bar.
 *
 * Only the bar reads this. The Feed's top row and the phone's clock still follow the picture
 * (white over a clip, the theme's own ink over a written post).
 */
export const FEED_BAR_ALWAYS_DARK: boolean = false;

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
