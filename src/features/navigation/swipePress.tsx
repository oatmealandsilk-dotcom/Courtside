import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

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
 *     card never moves;
 *   - a quick tap still flashes its look (shown on release, held FLASH_MS)
 *     and fires exactly as before;
 *   - a finger that rests longer and then swipes shows the look, and it is
 *     dropped in the very moment the page swipe starts, not 130 ms later.
 * Everywhere else (pushed pages, sheets, a desktop browser) nothing changes.
 */
export const PRESS_LOOK_DELAY = 120;
/** The shortest a quick tap's look is shown for, so it reads as a flash rather than nothing. */
const FLASH_MS = 100;
/** The phone's usual hold for a long press, start to finish, as Pressable had it before any delay. */
const NATIVE_LONG_PRESS = 500;
/** react-native-web: its own long-press wait and the press delay it adds to every touch. */
const WEB_LONG_PRESS = 450;
const WEB_PRESS_DELAY = 50;

const SwipeAreaContext = createContext(false);

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
 * The Pressable props that hold a press back by PRESS_LOOK_DELAY, with the
 * long-press wait shortened by the same amount so a hold still takes as long
 * as it did. React Native calls the delay `unstable_pressDelay`,
 * react-native-web calls it `delayPressIn`.
 */
export function pressDelayProps(delayLongPress: number | undefined): { delayLongPress?: number } {
  if (Platform.OS === 'web') {
    const total = (delayLongPress ?? WEB_LONG_PRESS) + WEB_PRESS_DELAY;
    return { delayPressIn: PRESS_LOOK_DELAY, delayLongPress: Math.max(10, total - PRESS_LOOK_DELAY) } as { delayLongPress?: number };
  }
  // Left unset, React Native already takes the delay off its own 500 ms default.
  return { unstable_pressDelay: PRESS_LOOK_DELAY, delayLongPress: delayLongPress === undefined ? undefined : Math.max(10, delayLongPress - PRESS_LOOK_DELAY) } as { delayLongPress?: number };
}

/**
 * Drives a press look (`look(true)` to show it, `look(false)` to let it go)
 * for a press that may sit inside a swipeable area. Wire `pressIn` / `pressOut`
 * to the Pressable's onPressIn / onPressOut and spread `delay` onto it.
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
  const clearHide = () => { if (hide.current) { clearTimeout(hide.current); hide.current = null; } };
  const drop = useCallback(() => {
    clearHide();
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
  useEffect(() => clearHide, []);

  const pressIn = () => {
    if (!inSwipe) { lookRef.current(true); return; }
    // The page is already sliding under this finger: no look at all.
    if (isPageDragging()) return;
    clearHide();
    shownAt.current = Date.now();
    lookRef.current(true);
  };
  const pressOut = () => {
    if (!inSwipe) { lookRef.current(false); return; }
    if (!shownAt.current) return;
    // A quick tap's look went on in this same moment: hold it for a flash.
    const left = FLASH_MS - (Date.now() - shownAt.current);
    clearHide();
    if (left > 0) hide.current = setTimeout(() => { hide.current = null; drop(); }, left);
    else drop();
  };
  return { inSwipe, pressIn, pressOut, delay: inSwipe ? pressDelayProps(delayLongPress) : undefined };
}
