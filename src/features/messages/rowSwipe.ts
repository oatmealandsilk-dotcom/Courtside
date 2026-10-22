/*
 * A chat's row in the inbox slides sideways, the way iMessage, WhatsApp and
 * Telegram rows do: to the left it uncovers Mute and Delete. A drag to the
 * right on a closed row is the page's own: the whole inbox follows the finger
 * and goes back (Oct 22, owner: "make it so the whole screen pulls and you
 * can exit the screen that way"); Mark as read / unread is in the row's hold
 * menu. The phone (SwipeRow.tsx) and the browser (SwipeRow.web.tsx) share
 * these numbers.
 */

/** Each action button's width under the row. */
export const ACTION_W = 78;

/** How far a finger travels sideways before the row takes it. */
export const ROW_SLOP = 10;

/** Where the row may be dragged to: past the actions it moves ever more slowly, and never right of its place. */
export function rowTravel(x: number, leftOpen: number): number {
  'worklet';
  if (x < -leftOpen) return -leftOpen - (1 - 1 / (1 + (-leftOpen - x) / 120)) * 60;
  return Math.min(0, x);
}
