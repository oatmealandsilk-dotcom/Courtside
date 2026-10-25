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
export const BAR_METRICS = METRICS[TAB_BAR_LOOK];
