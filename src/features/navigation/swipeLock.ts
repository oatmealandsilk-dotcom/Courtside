/**
 * A finger that lands on a sideways strip (who to follow, the topic filter)
 * belongs to that strip until it lifts. The page swipe checks this before it
 * takes a gesture, so a drag that runs off the end of a strip can never turn
 * the page by accident.
 */
let locked = false;

const lockListeners = new Set<() => void>();
export const lockPageSwipe = (on: boolean) => { if (locked === on) return; locked = on; lockListeners.forEach((fn) => fn()); };
export const isPageSwipeLocked = () => locked;
export const subscribePageSwipeLock = (fn: () => void) => { lockListeners.add(fn); return () => { lockListeners.delete(fn); }; };

/**
 * Whether a page swipe is under way right now. The page's vertical scroller
 * listens and stands down for the duration, so a slow sideways drag is never
 * snatched away mid-gesture by a few pixels of up-and-down.
 */
let dragging = false;
const dragListeners = new Set<() => void>();
export const setPageDragging = (on: boolean) => {
  if (dragging === on) return;
  dragging = on;
  dragListeners.forEach((fn) => fn());
};
export const isPageDragging = () => dragging;
export const subscribePageDragging = (fn: () => void) => { dragListeners.add(fn); return () => { dragListeners.delete(fn); }; };
