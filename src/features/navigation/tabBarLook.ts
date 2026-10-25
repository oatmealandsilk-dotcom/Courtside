/**
 * The phone's bottom tab bar, in looks to choose from (Oct 24, owner, about
 * the floating pill with the big round "+": "This bottom bar seems a bit too ai").
 *
 *   'now'  today's bar: a floating glass pill, coloured active icons, the big round brand "+".
 *   'A'    Native bar: full width along the bottom edge, plain page colour and a hairline on
 *          top, no float, no shadow. Small labels as on an iPhone's own apps; the lit tab is its
 *          filled icon in ink, the rest outlines in grey; the "+" a small green outlined square in the row.
 *   'B'    Quiet pill: still floating, but slimmer and less round, a plain fill (no glass) with a
 *          hairline and a soft shadow; icons only, the lit one green; the "+" a small green square in the row.
 *   'C'    Instagram: full width, icons only in ink (filled when lit), the "+" an outlined square,
 *          Profile is your own picture.
 *
 * Over a clip on the Feed every look turns dark, as today's glass does over a picture.
 * Only this line changes the look; 'now' leaves the app exactly as it is.
 */
export type TabBarLook = 'now' | 'A' | 'B' | 'C';
export const TAB_BAR_LOOK = 'now' as TabBarLook;

/** The bar runs along the bottom edge (A, C) rather than floating above it (now, B). */
export const BAR_DOCKED = TAB_BAR_LOOK === 'A' || TAB_BAR_LOOK === 'C';

/**
 * Each look's measures: the row's height, the air kept above it, and how far
 * a floating bar tucks toward the edge while you scroll down (a docked bar
 * never moves, so nothing over a clip follows it down).
 */
const METRICS: Record<TabBarLook, { height: number; gap: number; tuck: number }> = {
  now: { height: 62, gap: 10, tuck: 12 },
  A: { height: 50, gap: 0, tuck: 0 },
  B: { height: 52, gap: 10, tuck: 12 },
  C: { height: 48, gap: 0, tuck: 0 },
};
export const BAR_METRICS = METRICS[TAB_BAR_LOOK];
