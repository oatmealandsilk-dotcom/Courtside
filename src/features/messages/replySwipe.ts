/*
 * Swipe a message to the right to answer it, the way WhatsApp, iMessage,
 * Instagram and Telegram all do: the bubble follows the finger, a reply
 * arrow fades in behind it, and past REPLY_AT a light tap says letting go
 * will reply. The phone (SwipeReply.tsx) and the browser (SwipeReply.web.tsx)
 * share these numbers so the two feel the same.
 */

/** How far the message must travel before letting go replies. */
export const REPLY_AT = 64;

/** Past that, the message moves ever more slowly, and never further than this. */
export const REPLY_MAX = 96;

/** A drag that starts this close to the screen's left edge is the page's own Back swipe, never a reply. */
export const EDGE = 28;

/** How far a finger travels sideways before the swipe takes it (past a tap's wobble, as the times' swipe). */
export const REPLY_SLOP = 10;

/** Finger travel to how far the message moves: one for one up to REPLY_AT, then stiffer, up to REPLY_MAX. */
export function replyTravel(dx: number): number {
  'worklet';
  if (dx <= 0) return 0;
  if (dx <= REPLY_AT) return dx;
  const over = dx - REPLY_AT;
  const room = REPLY_MAX - REPLY_AT;
  return REPLY_AT + room * Math.tanh(over / (room * 1.6));
}

/** How clearly the arrow shows at a distance: from nothing to all there just as letting go would reply. */
export function arrowShow(x: number): number {
  'worklet';
  return Math.min(1, Math.max(0, (x - 12) / (REPLY_AT - 12)));
}
