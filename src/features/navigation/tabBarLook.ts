/**
 * The phone's bottom tab bar (Oct 24, owner, about the floating glass pill with the big round "+":
 * "This bottom bar seems a bit too ai"; Oct 25: "Quiet pill for bottom bar. Still with same
 * features as current just change shape"; then: "Te bottom bar should be Liquid Glass like Strava and instagram").
 *
 *   'B'    Quiet pill, the bar the app ships with: still floating, but slimmer and less round, on the
 *          old bar's Liquid Glass (a frosted blur on older iPhones, the court's colour nearly solid on
 *          Android and the web) with a hairline and a soft shadow. Everything on it is today's: the
 *          same five items in the same order, the same icons and small words under them, the same
 *          lit colours, Profile's count, the "+" in the brand's colour (a smaller round button in
 *          the row), the tuck as you scroll, dark glass over a clip on the Feed.
 *   'now'  The glass pill with the big round "+" it replaced, kept for one line's way back.
 *
 * Only this line changes the look.
 */
export type TabBarLook = 'now' | 'B';
export const TAB_BAR_LOOK = 'B' as TabBarLook;

/**
 * Each look's measures: the pill's height, the air kept below it, and how far
 * it tucks toward the edge while you scroll down.
 */
const METRICS: Record<TabBarLook, { height: number; gap: number; tuck: number }> = {
  now: { height: 62, gap: 10, tuck: 12 },
  B: { height: 56, gap: 10, tuck: 12 },
};

/**
 * The quiet pill's outline (Oct 25, owner: "Also the shape could look better too"), pictures only
 * so far: every option keeps the Liquid Glass ground, the icons with their words, the round "+" in
 * the brand's colour and Profile's count. Drawn in TabBarLooks; set here because a page's bottom
 * room, the live session's bar and the tutorial all read the bar's height from this file.
 *
 *   'now'  Today's quiet pill: 56 high, corners 18, 14 in from each side.
 *   'A'    Capsule: fully round ends, 60 high, 16 in from each side, a little higher off the bottom, the + inside.
 *   'B'    Slim capsule: 52 high, icons and words a touch smaller, a smaller + flush in the row.
 *   'C'    Split: a capsule for the four tabs and the + as a round glass button of its own beside it,
 *          the way Apple's own iOS 26 apps float a separate round button next to the tabs.
 */
export type BarShape = 'now' | 'A' | 'B' | 'C';
export const BAR_SHAPE = 'B' as BarShape;
/** Each outline's pill height and how much higher than today it floats. */
export const SHAPE_FOOT: Record<BarShape, { height: number; lift: number }> = {
  now: { height: 56, lift: 0 },
  A: { height: 60, lift: 6 },
  B: { height: 52, lift: 4 },
  C: { height: 60, lift: 6 },
};
/** The outline in use: its pill height, and the air under it on top of today's. */
export const SHAPE = SHAPE_FOOT[BAR_SHAPE];

/** `height` is all the bar takes above the phone's bottom strip: its pill, and any lift under it. */
export const BAR_METRICS = TAB_BAR_LOOK === 'B' ? { ...METRICS.B, height: SHAPE.height + SHAPE.lift } : METRICS.now;
