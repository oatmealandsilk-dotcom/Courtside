import { Easing, cancelAnimation, makeMutable, withSpring, withTiming } from 'react-native-reanimated';

import { useApp } from '@/store/AppContext';

/**
 * The lens under the lit tab (Oct 26, owner: "Also can we experiment with building Liquid Glass for
 * our bottom bar. Like Instagram and Strava where a Liquid Glass circle shows the tab we are on";
 * and, about tab changes: "could be even more seamless, as well as tab switching").
 *
 * A rounded capsule sits behind the lit tab's icon and word, a little in from the bar's edges
 * (components/TabBarLooks). On iOS 26 it is Apple's Liquid Glass, inside the bar's own glass; on
 * older iPhones, Android and the web a quiet capsule a step darker than the bar (a step lighter on a
 * dark court and over a clip). Never on the round +.
 *
 * It only ever moves sideways (a transform, on the animation thread; never a fade, never a redraw
 * per frame):
 *   - A tap: it slides to the tab from the moment the finger comes down, in step with the tab
 *     lighting there, on a calm spring that never overshoots the tab.
 *   - A swipe between tabs: it rides the tab row frame by frame under the finger (the phone's
 *     TabsPager, the browser's swipe), and lands with the page. Picked up mid-slide, it eases onto
 *     the row from where it stands instead of jumping.
 *
 * Not built (yet): a finger sliding along the bar dragging the lens, as iOS 26's own bar does. It
 * would have to share the finger with the Feed tab's hold (the windows, where the finger then slides
 * between the cards) and with the tabs lighting at the touch.
 *
 * None of it can be seen on an iPhone before it ships (no simulator here), so admins
 * (@oatmealandsilk, @mrdinosaur62) get it first. Turned on for everyone by setting this to true and
 * shipping an over-the-air update: no database change, no new native code. In the web demo,
 * ?admin=1 makes the demo's player an admin. The same pattern as SWIPE_FOLLOW_FOR_EVERYONE.
 * Off, the bar is exactly as before.
 */
export const BAR_LENS_FOR_EVERYONE = false;

/** Whether this person's bar shows the lens. */
export function useBarLens(): boolean {
  const { currentUser } = useApp();
  return BAR_LENS_FOR_EVERYONE || !!currentUser?.isAdmin;
}

/**
 * On iOS 26: 'glass', the lens is Apple's Liquid Glass inside the bar's glass; 'fill', the same quiet
 * capsule as everywhere else. One line back if the glass lens looks wrong on the phone.
 */
export const LENS_LOOK = 'glass' as 'glass' | 'fill';

/** The four tabs in the row's order (the bar's, TabsPager's TAB_PATHS): a tab's place is its index here. */
export const LENS_TABS = ['discuss', 'index', 'coaches', 'profile'] as const;
const LAST = LENS_TABS.length - 1;

/** A tab's place in the row by its route name; -1 for anything else. */
export function lensPlace(route: string | undefined): number {
  return route ? (LENS_TABS as readonly string[]).indexOf(route) : -1;
}

/**
 * The spring a tap moves it on: critically damped (no bounce, never past the tab), carrying on from
 * however it is moving when a second tap retargets it.
 */
const LENS_SPRING = { dampingRatio: 1, duration: 420, overshootClamping: true } as const;
/** Picked up by a finger mid-slide: how long it takes to ease onto the row from where it stood. */
const CATCH_MS = 200;

/** Where the lens stands on its own (a tap, the tab on show), as a place in the row: fractional while it moves; -1 not placed yet. */
export const lensAt = makeMutable(-1);
/** The tab it is heading for, or has landed on (-1 none). */
export const lensGoal = makeMutable(-1);
/** 1 while the lens rides the tab row: from a finger picking the row up until the row lands. */
export const lensRides = makeMutable(0);
/** 1 while that finger is still down (a tab lit meanwhile is the swipe's own business, not a tap's). */
export const lensHeld = makeMutable(0);
/** Where the row the lens rides stands, as a place (fractional while it moves): written by whatever moves the row. */
export const lensRow = makeMutable(0);
/** How far the lens stood from the row as it started riding, eased to nothing so it never jumps. */
export const lensLag = makeMutable(0);

function clampRow(at: number) {
  'worklet';
  return Math.max(0, Math.min(LAST, at));
}

/**
 * Where the lens is drawn right now, as a place in the row (`fallback` until it has been placed).
 * The lens's own style reads the same values by name (TabBarLooks' Lens): a style is redrawn only
 * for values its own code reads.
 */
export function lensShown(fallback: number) {
  'worklet';
  if (lensRides.value) return clampRow(lensRow.value) + lensLag.value;
  return lensAt.value < 0 ? fallback : lensAt.value;
}

/** A finger picked the row up (standing at `rowAt`): the lens rides it from where it stands now. */
export function lensRide(rowAt: number) {
  'worklet';
  lensHeld.value = 1;
  if (lensAt.value < 0) return;
  const shown = lensShown(lensAt.value);
  cancelAnimation(lensAt);
  cancelAnimation(lensRow);
  lensRow.value = rowAt;
  const lag = shown - clampRow(rowAt);
  lensRides.value = 1;
  lensLag.value = lag;
  if (Math.abs(lag) > 0.001) lensLag.value = withTiming(0, { duration: CATCH_MS, easing: Easing.out(Easing.cubic) });
}

/** The finger lifted: the row is settling on `to`, which the lens is now heading for with it. */
export function lensLetGo(to: number) {
  'worklet';
  lensHeld.value = 0;
  if (lensRides.value) lensGoal.value = to;
}

/** The row landed on `to` (or the lens stops riding it there): the lens stays exactly where it is drawn and finishes there on its own. */
export function lensLand(to: number) {
  'worklet';
  lensHeld.value = 0;
  if (!lensRides.value) return;
  const shown = lensShown(to);
  lensRides.value = 0;
  cancelAnimation(lensLag);
  lensLag.value = 0;
  lensGoal.value = to;
  lensAt.value = shown;
  if (Math.abs(shown - to) > 0.001) lensAt.value = withSpring(to, LENS_SPRING);
}

/**
 * The lit tab is `to` (-1 none): the lens goes there. Placed straight there the first time (and after
 * no tab was lit), so it never slides in from an old spot. While a finger has the row, the swipe
 * decides; once it lifts, a tap on another tab takes the lens over from where it stands.
 */
export function lensTo(to: number) {
  'worklet';
  if (to < 0) {
    cancelAnimation(lensAt);
    lensAt.value = -1;
    lensGoal.value = -1;
    lensRides.value = 0;
    return;
  }
  if (lensHeld.value && lensRides.value) return;
  if (lensAt.value < 0 || lensGoal.value < 0) {
    cancelAnimation(lensAt);
    lensAt.value = to;
    lensGoal.value = to;
    return;
  }
  // Already heading there: on its own, or riding the row as it settles there.
  if (lensGoal.value === to) return;
  const shown = lensShown(to);
  if (lensRides.value) {
    lensRides.value = 0;
    cancelAnimation(lensLag);
    lensLag.value = 0;
    lensAt.value = shown;
  }
  lensGoal.value = to;
  lensAt.value = withSpring(to, LENS_SPRING);
}

/** The bar went away: the next one places its lens afresh. */
export function lensReset() {
  'worklet';
  cancelAnimation(lensAt);
  cancelAnimation(lensRow);
  cancelAnimation(lensLag);
  lensAt.value = -1;
  lensGoal.value = -1;
  lensRides.value = 0;
  lensHeld.value = 0;
  lensLag.value = 0;
}

/** The row's own curve as it settles after a swipe (TabsPager's EASE, the browser swipe's cubic-bezier). */
const ROW_EASE = Easing.bezier(0.22, 0.61, 0.36, 1);

/** A finger moved the row to `rowAt`. Called where the row moves: on the phone, on the animation thread. */
export function lensFollow(rowAt: number) {
  'worklet';
  if (!lensRides.value) return;
  lensRow.value = rowAt;
}

/** The finger lifted: the row settles on `to` over `ms` on its own curve, and the lens lands with it. */
export function lensSettle(to: number, ms: number) {
  'worklet';
  lensLetGo(to);
  if (!lensRides.value) return;
  lensRow.value = withTiming(to, { duration: ms, easing: ROW_EASE }, (finished) => {
    if (finished) lensLand(to);
  });
}
