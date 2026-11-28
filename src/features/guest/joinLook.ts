/**
 * Which sign-up ask a visitor sees on the website when they try something that
 * needs an account (a like, a comment, a follow, a save, I'm in, a report …).
 *
 *   plain  the plain letter (Nov 28, owner, shown four takes: "i think d is
 *          solid"): the person first in two short lines, one plain line under
 *          it, then "Log in" and an ink "Join CourtSide" at the right. No icon,
 *          no box in the middle of a computer: it rises from the foot of the
 *          clip's column; a sheet from the foot on a phone (JoinPlain.tsx).
 *   x      the one before it (Nov 28 morning): X's signed-out prompt, an icon of
 *          the action, a centred headline, a full-width "Create account" and an
 *          outlined "Log in"; a dialog in the middle on a computer (JoinSheet.tsx).
 *
 * To go back to the one before, set JOIN_LOOK to 'x'. The other takes he was
 * shown (a bubble at the heart, a person-first sheet, a line at the foot) are
 * kept on the branch design/join-human, not here.
 */
export type JoinLook = 'plain' | 'x';

export const JOIN_LOOK: JoinLook = 'plain';
