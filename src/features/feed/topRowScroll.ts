import { Easing, withTiming, type SharedValue } from 'react-native-reanimated';

import { TOP_BAND_HEIGHT, TOP_BAND_TOP } from '@/features/feed/topBand';

/*
 * The Feed's top row ("Activities · For you · a group · +") follows the feed
 * the way Instagram's header does (Oct 22, owner: "smoothly disappear when I
 * scroll a bit, and reappear when I scroll up or tap the top part"). One
 * number says how far it is away: 0 shown, 1 gone. Whichever pager is on show
 * adds the feed's own movement to it as it happens (forward pushes it out,
 * back brings it in), so the row moves with the finger rather than playing a
 * canned fade afterwards; once the feed comes to rest it settles fully one
 * way or the other, and on the first page it is always shown.
 *
 * It is on every kind of page alike (clips, photo and session posts, written
 * posts, Activities, group feeds): a post's page starts below the row, but
 * while a swipe carries it up the row would sit on top of its name.
 */

/** How far the feed moves (points) to take the row all the way out or back: about the row's own depth. */
export const ROW_TRAVEL = TOP_BAND_TOP + TOP_BAND_HEIGHT + 10;

/** The settle and the "come back" glides: quick out, a touch slower in, Apple's ease-out. */
const SETTLE_OUT = 180;
const SETTLE_IN = 220;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Coming back a page, the row stays out of the way of the page sliding in under it
 * (the row has no backing, so words would pass under words, Oct 22 review): it is
 * held out while the feed is more than this far from a page's resting place, and
 * slides in over the last ROW_TRAVEL points with that page's own header. A short
 * pull back at rest (less than this) leaves it where it is.
 */
export const ROW_FREE = 64;
/** Within this many points of a page's resting place, the feed counts as resting on it (a hold may bring the row back). */
export const AT_REST = 4;

/** How far (points) the feed is from the nearest page's resting place; `y` is measured from the first page's top. */
export function offPage(y: number, h: number) {
  'worklet';
  if (h <= 0) return 0;
  const r = ((y % h) + h) % h;
  return Math.min(r, h - r);
}

/**
 * What a finger's drag started from: the page, whether the row was in (0) or out (1),
 * and once the finger is up, which way it moved overall (forward positive).
 */
export interface RowDrag { page: number; snap: number; net: number; lifted: boolean }
export const NO_DRAG: RowDrag = { page: -1, snap: 0, net: 0, lifted: false };

/** A finger went down on the feed resting on `page`. */
export function dragFrom(row: SharedValue<number>, page: number): RowDrag {
  'worklet';
  return { page, snap: row.value >= 0.5 ? 1 : 0, net: 0, lifted: false };
}

/**
 * The feed moved `dy` points (forward is positive) and now sits `off` points from the
 * nearest page's resting place: the row moves with it. After the finger lifts, a
 * move against the drag (the page springing back where it started) does not count,
 * or a pull back would end with the row out and a nudge forward with it in.
 */
export function followRow(row: SharedValue<number>, dy: number, off: number, drag?: RowDrag) {
  'worklet';
  if (!dy) return;
  const against = !!drag && drag.page >= 0 && drag.lifted && Math.sign(dy) !== Math.sign(drag.net);
  let next = against ? row.value : Math.max(0, Math.min(1, row.value + dy / ROW_TRAVEL));
  if (dy < 0) next = Math.max(next, Math.max(0, Math.min(1, (off - ROW_FREE) / ROW_TRAVEL)));
  if (next !== row.value) row.value = next;
}

/** Bring the row back: a hold, a tap on the strip, the first page, a pull to refresh, a pause. */
export function showRow(row: SharedValue<number> | undefined) {
  'worklet';
  if (!row || row.value === 0) return;
  row.value = withTiming(0, { duration: SETTLE_IN, easing: EASE });
}

/**
 * The feed has come to rest: the row finishes the way it was going, never left half out,
 * and always in on the first page. Landed back on the page the finger started from,
 * it is as it was then, or in if the finger pulled back.
 */
export function settleRow(row: SharedValue<number> | undefined, firstPage: boolean, back?: RowDrag | null) {
  'worklet';
  if (!row) return;
  if (firstPage) { showRow(row); return; }
  const v = row.value;
  const to = back ? (back.net < 0 ? 0 : back.snap) : v >= 0.5 ? 1 : 0;
  if (v === to) return;
  row.value = withTiming(to, { duration: to ? SETTLE_OUT : SETTLE_IN, easing: EASE });
}
