import { createContext, type Ref, type RefObject } from 'react';
import type { View } from 'react-native';

/*
 * Swipe a chat to the left to see when each message was sent, the way
 * iMessage does: your messages slide left with the finger, every message's
 * time fades in at the right edge, and letting go puts it all back. Messages
 * from others stay where they are, unless one is so wide its time would land
 * on it; that one moves over just enough to make room.
 *
 * The phone (MessageTimes.tsx) and the browser (MessageTimes.web.tsx) move
 * the messages differently; these are the numbers and the shape of the
 * slide they share, so the two feel the same.
 */

/** How far the messages slide to make room for the times: iMessage's column is about this wide. */
export const TIME_COLUMN = 68;

/**
 * How far a finger travels sideways before the slide takes it: past a tap's
 * wobble, and past the 10 points that call off a hold, so a slide never
 * opens a message's menu as well.
 */
export const TIME_SLOP = 10;

/**
 * Finger travel to slide: one for one at first, then stiffer and stiffer, so
 * the messages never go further than the time column however far you pull.
 */
export function slideFor(travel: number): number {
  'worklet';
  return travel <= 0 ? 0 : TIME_COLUMN * Math.tanh(travel / TIME_COLUMN);
}

/** The other way round: the finger travel that gives a slide (for a drag that catches the messages mid-way back). */
export function travelFor(slide: number): number {
  'worklet';
  if (slide <= 0) return 0;
  return TIME_COLUMN * Math.atanh(Math.min(slide / TIME_COLUMN, 0.999));
}

/** How clearly the times show at a slide: nothing for the first few points, all there before the end. */
export function timeOpacity(slide: number): number {
  'worklet';
  return Math.min(1, Math.max(0, (slide - TIME_COLUMN * 0.18) / (TIME_COLUMN * 0.52)));
}

/**
 * How far a message from someone else moves at a slide: only as far as its
 * time needs, given the room to the right of it (`free`). Yours always have
 * no room there, so they move the whole way.
 */
export function shiftFor(slide: number, free: number): number {
  'worklet';
  return Math.max(0, slide - free);
}

/** Where a message's bubble sits inside its row: left, top, width and height. */
export interface Spot { x: number; y: number; w: number; h: number }

/** The room to the right of a message from someone else, in a row this wide. */
export function roomBeside(spot: Spot | null, rowWidth: number): number {
  return spot && rowWidth > 0 ? Math.max(0, rowWidth - spot.x - spot.w) : 0;
}

/**
 * A row hands its bubble a way to say where it sits (measured against the
 * row itself), so the time lines up with the middle of the bubble, not of
 * the whole row (a reaction or an "Edited" line under it would pull it off
 * centre), and so the row knows how much room is beside it.
 */
export const AnchorContext = createContext<{ row: RefObject<View | null>; report: (spot: Spot) => void } | null>(null);

/** Which message a row holds: its time and its side, for the time shown beside the bubble. */
export const RowTimeContext = createContext<{ time: string; mine: boolean } | null>(null);

/** Hands a ref to both its owner's ref and one of our own. */
export function bothRefs<T>(theirs: Ref<T> | undefined, ours: RefObject<T | null>) {
  return (node: T | null) => {
    ours.current = node;
    if (typeof theirs === 'function') theirs(node);
    else if (theirs) (theirs as RefObject<T | null>).current = node;
  };
}
