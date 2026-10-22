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

/** The feed moved `dy` points (forward is positive): the row moves with it. */
export function followRow(row: SharedValue<number>, dy: number) {
  'worklet';
  if (!dy) return;
  const next = Math.max(0, Math.min(1, row.value + dy / ROW_TRAVEL));
  if (next !== row.value) row.value = next;
}

/** Bring the row back: a hold, a tap on the strip, the first page, a pull to refresh, a pause. */
export function showRow(row: SharedValue<number> | undefined) {
  'worklet';
  if (!row || row.value === 0) return;
  row.value = withTiming(0, { duration: SETTLE_IN, easing: EASE });
}

/** The feed has come to rest: the row finishes the way it was going, never left half out. */
export function settleRow(row: SharedValue<number> | undefined, firstPage: boolean) {
  'worklet';
  if (!row) return;
  if (firstPage) { showRow(row); return; }
  const v = row.value;
  if (v === 0 || v === 1) return;
  const to = v >= 0.5 ? 1 : 0;
  row.value = withTiming(to, { duration: to ? SETTLE_OUT : SETTLE_IN, easing: EASE });
}
