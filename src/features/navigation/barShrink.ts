import { Platform } from 'react-native';
import { Easing, cancelAnimation, makeMutable, runOnUI, withTiming } from 'react-native-reanimated';

import { pressV2On } from './pressV2';
import { BAR_METRICS } from './tabBarLook';

/**
 * The bottom bar ducks a little while you scroll down and comes back as soon
 * as you scroll up — 0 is full size, 1 is ducked. Any scroller can drive it;
 * the bar just follows on the animation thread.
 */
export const barCompact = makeMutable(0);
/** How much shorter the bar is when fully ducked (its top and bottom padding together), in points. */
export const DUCK = 8;
export const BAR_DUCK_PX = DUCK * 2.5;
/**
 * How far the floating bar tucks down toward the edge when fully ducked, in
 * points. The words over a clip follow it down by the same amount, so they
 * keep the same small gap above the bar whether it is up or tucked.
 */
export const BAR_TUCK = BAR_METRICS.tuck;

/**
 * The feed's swipes move the bar in one steady glide, the same length
 * whatever the finger's speed: started once per swipe in each direction,
 * rather than nudged frame by frame (which tucked it in the first sliver of
 * a fast flick and then stopped, and read as choppy).
 */
export const BAR_GLIDE = 260;
export function glideBar(on: boolean) {
  'worklet';
  barCompact.value = withTiming(on ? 1 : 0, { duration: BAR_GLIDE, easing: Easing.out(Easing.cubic) });
}

const BEZIER = Easing.bezierFn(0.22, 0.61, 0.36, 1);
/**
 * The bar's ease, held at its start until the move has begun. A browser busy
 * drawing a new page can hand the first frame a time from just before the move
 * started, and the curve run backwards from there threw the bar about 10 px the
 * wrong way first (Oct 25 audit: the bar dropped, then rose). As the underline's
 * own glide (useTabUnderline).
 */
function ease(t: number) {
  'worklet';
  return BEZIER(Math.max(0, t));
}
let current = false;

/**
 * The phone's tab row gliding to a tab after a tap (TabsPager): 0 → 1 as it
 * goes from where it set off to where it lands, -1 when it is not gliding to
 * a tab. Written on the animation thread, frame by frame, by the row itself.
 */
export const rowGlide = makeMutable(-1);
/**
 * The bar's tuck riding a row glide (see setBarCompact's `withPage`): from `a`
 * to `b` over what is left of the glide after `p0`, so it lands with the page.
 */
const ride = makeMutable({ on: false, a: 0, b: 0, p0: 0 });

/**
 * The row's glide moved on (`p`, as rowGlide), or ended (1: landed; -1: a
 * finger picked the row up, or it was sent somewhere else). Run by TabsPager
 * on the animation thread, in the same frame as the row, so a tuck riding it
 * moves in step with the page.
 */
export function followRow(p: number) {
  'worklet';
  rowGlide.value = p >= 1 ? -1 : p;
  const r = ride.value;
  if (!r.on) return;
  // A new glide (a quicker tap): the tuck carries on from where it is, over the new glide.
  if (p === 0) { ride.value = { ...r, a: barCompact.value, p0: 0 }; return; }
  if (p >= 1) { barCompact.value = r.b; ride.value = { ...r, on: false }; return; }
  if (p < 0) {
    // Cut short: the tuck goes the rest of the way on its own, quickly.
    ride.value = { ...r, on: false };
    barCompact.value = withTiming(r.b, { duration: 160, easing: ease });
    return;
  }
  const t = r.p0 >= 1 ? 1 : Math.max(0, Math.min(1, (p - r.p0) / (1 - r.p0)));
  barCompact.value = r.a + (r.b - r.a) * t;
}

/**
 * When a tab was last changed by a tap or a swipe in a browser (noteTabSwitch): a change of page
 * the bar's tuck goes with in one go there, unlike a page opening or closing over a tab, which
 * slides (RouteTransition) and which the tuck still follows over a fifth of a second.
 */
let tabSwitchAt = -Infinity;
/** A browser's tab changing now (the bar, the arrow keys, a swipe): see setBarCompact's `withPage`. */
export function noteTabSwitch() {
  tabSwitchAt = Date.now();
}

/**
 * Ducks or brings back the bar over a fifth of a second.
 *
 * `withPage`: the change goes with a change of page (the Feed's tuck given
 * back as another tab or page shows, and put back as the Feed does), so it
 * never plays as a move of its own after the page has changed (Oct 25 audit:
 * every tap off the Feed lifted the bar 12 pt and faded its words in once the
 * new tab was already there; every tap back sank it again). In a browser a tab
 * changes in one go, so the bar does too. On the phone, while the tab row
 * is gliding to a tab, it rides that glide and lands with the page (quicker
 * press feel: admins first); otherwise it moves as before. Already there, it
 * does nothing (no motion replayed).
 */
export function setBarCompact(on: boolean, { withPage = false }: { withPage?: boolean } = {}) {
  current = on;
  progress = on ? 1 : 0;
  const end = on ? 1 : 0;
  if (withPage && Platform.OS === 'web' && Date.now() - tabSwitchAt < 800) {
    cancelAnimation(barCompact);
    barCompact.value = end;
    return;
  }
  if (withPage && pressV2On()) {
    runOnUI((to: number) => {
      'worklet';
      const p = rowGlide.value;
      const r = ride.value;
      // Already riding there: nothing to add.
      if (r.on && r.b === to) return;
      if (p >= 0 && p < 1) {
        cancelAnimation(barCompact);
        ride.value = { on: true, a: barCompact.value, b: to, p0: p };
        return;
      }
      if (r.on) ride.value = { ...r, on: false };
      if (Math.abs(barCompact.value - to) < 0.001) return;
      barCompact.value = withTiming(to, { duration: 200, easing: ease });
    })(end);
    return;
  }
  barCompact.value = withTiming(end, { duration: 200, easing: ease });
}

const lastY = new Map<string, number>();
/** How far ducked, 0..1, moved a little with every scroll step so it follows the finger rather than flipping. */
let progress = 0;

/** Call with each scroll position. The bar ducks gradually as you scroll down, and rises the same way as you scroll up. */
export function noteScroll(key: string, y: number) {
  const before = lastY.get(key) ?? y;
  lastY.set(key, y);
  const dy = y - before;
  if (y < 24) {
    if (progress !== 0) { progress = 0; current = false; barCompact.value = withTiming(0, { duration: 260, easing: ease }); }
    return;
  }
  if (Math.abs(dy) < 0.5) return;
  // About 110 points of scrolling takes the bar all the way from full to ducked.
  progress = Math.max(0, Math.min(1, progress + dy / 110));
  current = progress > 0.5;
  barCompact.value = withTiming(progress, { duration: 90, easing: Easing.out(Easing.quad) });
}
