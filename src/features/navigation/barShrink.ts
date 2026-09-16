import { Easing, makeMutable, withTiming } from 'react-native-reanimated';

/**
 * The bottom bar ducks a little while you scroll down and comes back as soon
 * as you scroll up — 0 is full size, 1 is ducked. Any scroller can drive it;
 * the bar just follows on the animation thread.
 */
export const barCompact = makeMutable(0);
/** How much shorter the bar is when fully ducked (its top and bottom padding together), in points. */
export const DUCK = 8;
export const BAR_DUCK_PX = DUCK * 2.5;

const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
let current = false;

export function setBarCompact(on: boolean) {
  current = on;
  progress = on ? 1 : 0;
  barCompact.value = withTiming(on ? 1 : 0, { duration: 200, easing: EASE });
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
    if (progress !== 0) { progress = 0; current = false; barCompact.value = withTiming(0, { duration: 260, easing: EASE }); }
    return;
  }
  if (Math.abs(dy) < 0.5) return;
  // About 110 points of scrolling takes the bar all the way from full to ducked.
  progress = Math.max(0, Math.min(1, progress + dy / 110));
  current = progress > 0.5;
  barCompact.value = withTiming(progress, { duration: 90, easing: Easing.out(Easing.quad) });
}
