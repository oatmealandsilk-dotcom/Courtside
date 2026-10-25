import { useSyncExternalStore } from 'react';

/**
 * The Create box's own close, so the + in the tab bar can use it: a second
 * tap on + closes the box with the same animation as its × — only while the
 * box is showing (never mid-post, where it would throw work away).
 *
 * It also says whether the box is on screen, for the tab bar (owner, Oct 17:
 * "When I click the + and then click out of it, the bottom island disappears
 * and comes back. Either make it not disappear or make the animation
 * significantly better"). While the box is up the bar stays where it is,
 * its + still the way to close the box.
 */
let closer: (() => void) | null = null;

/**
 * While the box is up the bar keeps its own colour; only its four tabs step
 * back, under a veil of the bar's own ground this strong (0 to 1), so the lit
 * + is plainly the control in charge (as iOS greys a tab bar's colours while
 * something is up over it, never its ground). It used to go under the page's
 * dim instead and turned a dark grey (Oct 25, owner: "Don't like how this
 * bottom gets dark grey").
 */
export const BAR_RECEDE = 0.4;

/** Where the box is: not there, on its way in (the + was just tapped), up, or leaving. */
export type CreateMenuState = 'closed' | 'opening' | 'open' | 'leaving';
let state: CreateMenuState = 'closed';
const listeners = new Set<() => void>();
let openingTimer: ReturnType<typeof setTimeout> | null = null;

function set(next: CreateMenuState) {
  if (openingTimer && next !== 'opening') { clearTimeout(openingTimer); openingTimer = null; }
  if (state === next) return;
  state = next;
  listeners.forEach((l) => l());
}

/** For useSyncExternalStore: what the box is doing now, and a way to hear when that changes. */
export const getCreateMenuState = () => state;
export function subscribeCreateMenu(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * The + was tapped: the box is coming. Said before the page opens, so the
 * bar does not start leaving in the moment before the box has drawn. If no
 * box turns up (the page opened something else), it is let go of again.
 */
export function markCreateOpening() {
  set('opening');
  if (openingTimer) clearTimeout(openingTimer);
  openingTimer =setTimeout(() => { openingTimer = null; if (state === 'opening') set('closed'); }, 3000);
}

/** The box has started to close (its ×, a tap outside it, Back or the +): the bar's dim fades with it. */
export function markCreateLeaving() {
  if (state === 'open' || state === 'opening') set('leaving');
}

/** The Create box hands over its close while it is on screen. Returns the hand-back. */
export function registerCreateClose(close: () => void) {
  closer = close;
  set('open');
  return () => {
    if (closer !== close) return;
    closer = null;
    set('closed');
  };
}

/** True if the box was open and is now closing. */
export function closeCreateMenu(): boolean {
  if (!closer) return false;
  closer();
  return true;
}

/** The box's state, read by the tab bar; only what reads it draws again when it changes. */
export function useCreateMenuState(): CreateMenuState {
  return useSyncExternalStore(subscribeCreateMenu, getCreateMenuState, getCreateMenuState);
}
