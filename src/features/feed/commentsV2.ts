import { useApp } from '@/store/AppContext';

/**
 * The new comments feel (Oct 25, owner: "It should feel way better
 * commenting"): on an iPhone the keyboard, the box and the sheet move as one;
 * a tap on the comments puts the keyboard away; posting puts it away; an
 * always-there emoji row; a heart that pops; a calm send/photo swap; a
 * smoother open.
 *
 * Admins (@oatmealandsilk, @mrdinosaur62) get it first; everyone else keeps
 * the comments as they were (with the plain bug fixes). Turned on for
 * everyone by setting this to true and shipping an over-the-air update: no
 * database change. In the web demo, ?admin=1 makes the demo's player an
 * admin, so it shows there too. The same pattern as PAID_BOOKING_RELEASED.
 */
export const COMMENTS_V2_RELEASED = false;

/** Whether this person gets the new comments feel. A comments page reads it once as it opens (see comments). */
export function useCommentsV2(): boolean {
  const { currentUser } = useApp();
  return COMMENTS_V2_RELEASED || !!currentUser?.isAdmin;
}
