import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Platform, type GestureResponderEvent } from 'react-native';

import { isPageDragging, subscribePageDragging } from '@/features/navigation/swipeLock';

/**
 * A press inside a page that swipes sideways (the tab row, a section pager,
 * a browser's swipe surface) waits a beat before it shows its pressed look,
 * the way iPhone's own scrolling lists do (UIScrollView's delaysContentTouches).
 *
 * Why (Oct 23, owner: "if I'm swiping sideways the box still goes down for
 * animation, this is no good"): a press used to show its look the instant the
 * finger landed, and the sideways swipe only takes the finger 8 to 14 points
 * later. On iPhone the press then kept its look for at least 130 ms more
 * (React Native holds every press look that long, even one the swipe cancels),
 * so the card under the finger visibly shrank while the page slid away.
 *
 * Now, inside a swipeable area:
 *   - the look waits PRESS_LOOK_DELAY. A swipe (or a scroll) takes the finger
 *     well inside that, the press is cancelled before it ever showed, and the
 *     card never moves. A finger already on the move (past MOVE_SLOP) by the
 *     time the wait is up never shows it either, however slowly it drags;
 *   - a quick tap still flashes its look (shown on release, held FLASH_MS)
 *     and fires exactly as before;
 *   - a finger that rests longer and then swipes shows the look, and it is
 *     dropped in the very moment the page swipe starts, not 130 ms later.
 * Everywhere else (pushed pages, sheets, a desktop browser) nothing changes; a
 * sheet opened from a tab says so with <SwipeArea on={false}>, and so does the
 * clip handle (StatsPill), which keeps its own press.
 *
 * Sooner (Oct 24, owner: "Buttons need to be way more responsive. They are way
 * to delayed when I click them"): waiting 120 ms on every press made each
 * button on the four tabs answer late. A finger that has stayed put (within
 * STILL_SLOP) for PRESS_STILL_DELAY is a tap or a hold, never a swipe (a swipe
 * is already moving by then), so its look shows then, well under half the
 * wait. Only a finger that has started to drift waits the whole
 * PRESS_LOOK_DELAY, as before, and a look on show goes the moment the finger
 * moves past MOVE_SLOP, not only when the page starts to slide.
 */
export const PRESS_LOOK_DELAY = 120;
/** How soon a finger that has stayed put shows its press look, inside a swipeable area. */
export const PRESS_STILL_DELAY = 50;
/** How far a finger may have moved by PRESS_STILL_DELAY and still count as staying put. */
const STILL_SLOP = 2;
/**
 * How far a finger may drift before the press counts as the start of a swipe or a scroll. A thumb
 * tap rolls 4 to 8 points and still gets its look; 8 is still under every sideways swipe's take-over
 * distance (8 to 14 points, gestureClaim) and an iPhone scroll's (about 10).
 */
const MOVE_SLOP = 8;
/** The shortest a quick tap's look is shown for, so it reads as a flash rather than nothing. */
const FLASH_MS = 100;
/** The phone's usual hold for a long press, start to finish, as Pressable had it before any delay. */
const NATIVE_LONG_PRESS = 500;
/** react-native-web: its own long-press wait and the press delay it adds to every touch. */
const WEB_LONG_PRESS = 450;
const WEB_PRESS_DELAY = 50;

const SwipeAreaContext = createContext(false);

/** Where a touch is on the page: a phone's touch event and react-native-web's alike. */
type Point = { pageX?: number; pageY?: number };
const pointOf = (e: GestureResponderEvent): { x: number; y: number } | null => {
  const n = e.nativeEvent as unknown as Point & { touches?: ArrayLike<Point>; changedTouches?: ArrayLike<Point> };
  const t = n.touches?.[0] ?? n.changedTouches?.[0] ?? n;
  return typeof t.pageX === 'number' && typeof t.pageY === 'number' ? { x: t.pageX, y: t.pageY } : null;
};

/** Marks everything inside as being on a page that swipes sideways (while `on`). */
export function SwipeArea({ on = true, children }: { on?: boolean; children: React.ReactNode }) {
  return <SwipeAreaContext.Provider value={on}>{children}</SwipeAreaContext.Provider>;
}

export const useInSwipeArea = () => useContext(SwipeAreaContext);

/**
 * A browser's swipe surface has no page-dragging flag of its own (it ends the
 * press through react-native-web's responder system): it calls this the
 * moment it takes the finger, so a look already showing goes with it.
 */
const dropListeners = new Set<() => void>();
export const dropPressLooks = () => { dropListeners.forEach((fn) => fn()); };

/**
 * The Pressable props that hold a press back by PRESS_STILL_DELAY (the first
 * look at the finger; a drifting one waits on to PRESS_LOOK_DELAY in
 * useSwipePressLook), with the long-press wait shortened by the same amount
 * so a hold still takes as long as it did. React Native calls the delay
 * `unstable_pressDelay`, react-native-web calls it `delayPressIn`.
 */
export function pressDelayProps(delayLongPress: number | undefined): { delayLongPress?: number } {
  if (Platform.OS === 'web') {
    const total = (delayLongPress ?? WEB_LONG_PRESS) + WEB_PRESS_DELAY;
    return { delayPressIn: PRESS_STILL_DELAY, delayLongPress: Math.max(10, total - PRESS_STILL_DELAY) } as { delayLongPress?: number };
  }
  // Left unset, React Native already takes the delay off its own 500 ms default.
  return { unstable_pressDelay: PRESS_STILL_DELAY, delayLongPress: delayLongPress === undefined ? undefined : Math.max(10, delayLongPress - PRESS_STILL_DELAY) } as { delayLongPress?: number };
}

/**
 * Drives a press look (`look(true)` to show it, `look(false)` to let it go)
 * for a press that may sit inside a swipeable area. Wire `pressIn` / `pressOut`
 * to the Pressable's onPressIn / onPressOut, `touchStart` / `pressMove` to its
 * onTouchStart / onPressMove, and spread `delay` onto it.
 * Outside a swipeable area (or with `enabled` false) the look follows the
 * finger exactly as a plain Pressable's does, and `delay` is undefined.
 */
export function useSwipePressLook(look: (on: boolean) => void, { enabled = true, delayLongPress }: { enabled?: boolean; delayLongPress?: number } = {}) {
  const inSwipe = useContext(SwipeAreaContext) && enabled;
  const lookRef = useRef(look);
  lookRef.current = look;
  // When the look went on (0 while it is off), and a quick tap's pending hide.
  const shownAt = useRef(0);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A drifting finger's look, waiting for the end of PRESS_LOOK_DELAY.
  const later = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Where this finger came down, and when; where it is now; whether it has since moved off like a swipe or a scroll.
  const start = useRef<{ x: number; y: number } | null>(null);
  const at = useRef<{ x: number; y: number } | null>(null);
  const downAt = useRef(0);
  const moved = useRef(false);
  const clearHide = () => { if (hide.current) { clearTimeout(hide.current); hide.current = null; } };
  const clearLater = () => { if (later.current) { clearTimeout(later.current); later.current = null; } };
  const drop = useCallback(() => {
    clearHide();
    clearLater();
    if (!shownAt.current) return;
    shownAt.current = 0;
    lookRef.current(false);
  }, []);
  useEffect(() => {
    if (!inSwipe) return;
    dropListeners.add(drop);
    const unsubscribe = subscribePageDragging(() => { if (isPageDragging()) drop(); });
    return () => { dropListeners.delete(drop); unsubscribe(); };
  }, [inSwipe, drop]);
  useEffect(() => () => { clearHide(); clearLater(); }, []);
  // Leaving a swipeable area mid-press (a phone turned, a browser resized, a swipe surface switched
  // off) takes any look on show with it, so it can never come back stuck on.
  useEffect(() => { if (!inSwipe) drop(); }, [inSwipe, drop]);

  const touchStart = (e: GestureResponderEvent) => {
    if (!inSwipe) return;
    start.current = pointOf(e);
    at.current = start.current;
    downAt.current = Date.now();
    moved.current = false;
  };
  const pressMove = (e: GestureResponderEvent) => {
    if (!inSwipe || moved.current || !start.current) return;
    const now = pointOf(e);
    if (!now) return;
    at.current = now;
    if (Math.hypot(now.x - start.current.x, now.y - start.current.y) > MOVE_SLOP) {
      moved.current = true;
      // A swipe or a scroll under a look already on show: it goes now, not when the page starts to slide.
      drop();
    }
  };
  const show = () => {
    clearHide();
    clearLater();
    shownAt.current = Date.now();
    lookRef.current(true);
  };
  const pressIn = () => {
    if (!inSwipe) { lookRef.current(true); return; }
    // The page is already sliding under this finger, or the finger is on its way: no look at all.
    if (isPageDragging() || moved.current) return;
    const drift = start.current && at.current ? Math.hypot(at.current.x - start.current.x, at.current.y - start.current.y) : 0;
    // Stayed put, a tap or a hold: the look shows now. So it does for a quick tap let go before the
    // wait was up (the press comes in early, as the finger lifts), however much the thumb rolled.
    if (drift <= STILL_SLOP || Date.now() - downAt.current < PRESS_STILL_DELAY - 5) { show(); return; }
    // Started to drift: the look waits out the whole PRESS_LOOK_DELAY, and shows only if the finger has not gone on to swipe.
    clearLater();
    later.current = setTimeout(() => {
      later.current = null;
      if (!isPageDragging() && !moved.current) show();
    }, Math.max(0, PRESS_LOOK_DELAY - (Date.now() - downAt.current)));
  };
  const pressOut = () => {
    if (!inSwipe) { lookRef.current(false); return; }
    // Let go while a drifting finger's look was still waiting: a tap after all, so it flashes (never under a swipe).
    if (later.current) {
      clearLater();
      if (!isPageDragging() && !moved.current) show();
    }
    if (!shownAt.current) return;
    // A quick tap's look went on in this same moment: hold it for a flash.
    const left = FLASH_MS - (Date.now() - shownAt.current);
    clearHide();
    if (left > 0) hide.current = setTimeout(() => { hide.current = null; drop(); }, left);
    else drop();
  };
  return { inSwipe, touchStart, pressMove, pressIn, pressOut, delay: inSwipe ? pressDelayProps(delayLongPress) : undefined };
}
