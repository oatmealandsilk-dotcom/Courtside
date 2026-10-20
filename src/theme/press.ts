/*
 * How anything answers a press: three styles only (Oct 20 sweep: "Today
 * there are about 10 different press effects. Some dim so deeply they look
 * like a flicker").
 *   - Buttons and cards shrink slightly (to PRESS_SHRINK) and spring back:
 *     Button, Card, and Tappable by default.
 *   - Icons and words that are links dim a little (to PRESS_DIM): the bell,
 *     Messages, a clip's comment, share, save and ••• icons, "Find a friend".
 *   - Rows in a list take the theme's surfaceAlt tint (colors.surfaceAlt).
 * Rewards keep their own bounce (a like, the like burst, celebrate).
 */

/** How far a button or card shrinks while held. */
export const PRESS_SHRINK = 0.97;
/** How far an icon or a link dims while held: a little, never a flicker. */
export const PRESS_DIM = 0.6;
