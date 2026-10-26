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
 * between dark and light when I land on post vs reel. What's a solution for this"). Pictures
 * only so far:
 *
 *   'now'  Today: the bar turns dark over a picture (a clip, an Instant) and light again over a
 *          written post, so it changes as you swipe from one to the next.
 *   'A'    While the Feed is the tab on show, the bar keeps today's dark look for every post,
 *          written ones included. The other tabs, and a page opened over the Feed (a player, a
 *          court), keep today's bar. The Feed's top row and the phone's clock still follow the
 *          picture (white over a clip, the theme's own ink over a written post).
 *   'A2'   A, with that dark look as a deliberate black bar, as TikTok's and Reels' are: the
 *          glass's tint nearly solid (Glass `solid`, still Apple's glass at its edge on iOS 26),
 *          its icons and words brighter, the lit tab a brighter shade of the court's own colour.
 *          The top row and the clock as in A.
 *   'C'    A2's bar on a Feed that is always dark, TikTok-style: on a light court the Feed (For
 *          you, Activities, a group's feed) is drawn in the app's own dark court (Night, whose
 *          page is Clean's ink), written posts and session cards included, its top row white and
 *          the phone's clock light, so nothing at the top or the bottom changes as you swipe.
 *          A dark court (Night, New York) is dark already. Every other page keeps its court.
 */
export type FeedBarLook = 'now' | 'A' | 'A2' | 'C';
export const FEED_BAR_LOOK = 'now' as FeedBarLook;
/** The bar keeps its dark look on the Feed for every post ('A', 'A2', 'C'). */
export const FEED_BAR_STAYS_DARK = FEED_BAR_LOOK !== 'now';
/** That dark look as a near-solid black bar with brighter marks ('A2', 'C'). */
export const FEED_BAR_SOLID = FEED_BAR_LOOK === 'A2' || FEED_BAR_LOOK === 'C';
/** The Feed itself drawn dark ('C'). */
export const FEED_DARK = FEED_BAR_LOOK === 'C';

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
