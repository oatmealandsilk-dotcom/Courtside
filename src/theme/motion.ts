/*
 * How every pop-up sheet rises and closes (Oct 20 sweep: "Log it, the map
 * cards and the post menu each slide in at their own speed, so some feel
 * snappy and some feel sluggish"). These are DragSheet's own numbers, which
 * most sheets already use; the few sheets that moved on their own timing now
 * read them from here. The clip handle popup and the activity popup sheet are
 * left exactly as they are (owner, Oct 5).
 */

/** The rise: Apple's sheet spring, quick, with the faintest settle at the top. */
export const SHEET_SPRING = { damping: 24, stiffness: 240, mass: 0.9 } as const;
/** The close: out of the way fast, on an ease-in, the way a card is tossed down. */
export const SHEET_CLOSE_MS = 230;
/** The ease-in for every close, as cubic-bezier control points. */
export const SHEET_CLOSE_CURVE = [0.4, 0, 1, 1] as const;
/** The page behind dims in this long as the sheet rises, and brightens this long as it closes. */
export const SHEET_DIM_IN_MS = 260;
export const SHEET_DIM_OUT_MS = 210;
