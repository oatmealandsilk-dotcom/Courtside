import { makeMutable } from 'react-native-reanimated';

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
/**
 * The same, on the animation thread (Nov 4, owner: "Swiping back is super laggy", "Our app just runs so laggy"): with
 * taps answering sooner, the pages' scrollers stand down from this (an animated prop), set by the tab and section
 * swipes in the very frame they take the finger. Before, every page and section scroller on the app (five or more)
 * was drawn again by React for it, at the start and at the end of every swipe, and that redraw held the swipe.
 */
export const pageDraggingUI = makeMutable(false);
export const setPageDragging = (on: boolean) => {
  pageDraggingUI.value = on;
  notePageDragging(on);
};
/** For a swipe that already set pageDraggingUI on the animation thread (the tab and section swipes): the rest only. */
export const notePageDragging = (on: boolean) => {
  if (dragging === on) return;
  dragging = on;
  dragListeners.forEach((fn) => fn());
};
export const isPageDragging = () => dragging;
export const subscribePageDragging = (fn: () => void) => { dragListeners.add(fn); return () => { dragListeners.delete(fn); }; };

/**
 * The same, on the animation thread, for a section swipe (SectionPager): set
 * in the very frame the swipe takes the finger, so a section's own scroller
 * (PaneScroller) can ignore the few points of up-and-down a sideways drag
 * carries before its scrolling is switched off: no bar tuck, no drift.
 */
export const sectionPan = makeMutable(false);

/**
 * Whether a finger is moving the Feed's clips up or down right now (on the
 * phone; a browser's tutorial watches the touches themselves). Only the
 * tutorial asks: it never starts under a finger that is still scrolling.
 */
let scrolling = false;
export const setPageScrolling = (on: boolean) => { scrolling = on; };
export const isPageScrolling = () => scrolling;
