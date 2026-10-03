/*
 * A chat's row in the inbox slides sideways, the way iMessage, WhatsApp and
 * Telegram rows do: to the left it uncovers Mute and Delete; to the right,
 * pulled far enough and let go, it marks the chat read or unread. The phone
 * (SwipeRow.tsx) and the browser (SwipeRow.web.tsx) share these numbers.
 */

/** Each action button's width under the row. */
export const ACTION_W = 78;

/** Pulled right this far and let go: the read / unread action runs. */
export const FIRE_AT = 76;

/** How far a finger travels sideways before the row takes it. */
export const ROW_SLOP = 10;

/** A drag starting this close to the screen's left edge is the page's own Back swipe. */
export const ROW_EDGE = 24;

/** Where the row may be dragged to: past the actions or the read mark, it moves ever more slowly. */
export function rowTravel(x: number, leftOpen: number, rightMax: number): number {
  'worklet';
  if (x < -leftOpen) return -leftOpen - (1 - 1 / (1 + (-leftOpen - x) / 120)) * 60;
  if (x > rightMax) return rightMax + (1 - 1 / (1 + (x - rightMax) / 120)) * 50;
  return x;
}
