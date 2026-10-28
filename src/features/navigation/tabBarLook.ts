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

/**
 * The new bar (Oct 28, owner: "Also the Liquid Glass tab the bottom Should look better look at Instagram
 * and stravas"; then: "We just want our bar to look more like there's not exact replica. Also the animation
 * is inportant for tab switching"). Admins first (barLens's BAR_IG_FOR_EVERYONE); everyone else keeps the
 * quiet pill above, exactly as it is.
 *
 * Measured from his own iPhone screenshots of both bars (3 pixels a point, 402 points across):
 *   Instagram  bar 59 high, 26 in from each side, its foot 23 above the screen's bottom edge; the lit tab's
 *              capsule 49 high and 5 in all round, 76 wide (a fifth of the bar plus a little); icons about 21.
 *   Strava     bar 62 high, 21 in, foot 21 up; capsule 54 high and 4 in all round, 77 wide; icons about 22,
 *              bold words about 12, 5 under the icon.
 *   Ours today 52 high, 16 in, foot 38 up; capsule 44 high, 4 in; icons about 18, words 10; a round + 34 wide.
 *
 * Ours, in their proportions but our own: a full capsule 60 high, 20 in from each side, its foot 22 above
 * the bottom edge (12 into the phone's 34-point bottom strip, as theirs are); the capsule 4 in all round
 * and as wide as the lit tab's word plus 11 each side (at least 68); icons 24 (about 21 of drawing, as theirs), our
 * words at 11 under them. Its top (22 + 60 = 82 up) stays below today's (34 + BAR_METRICS.height = 90 up),
 * so every page's bottom room, the live session's bar, a clip's words, the Feed's windows and the
 * tutorial (all of which read the bar's height above) still clear it; on a phone with no home bar (and in a browser)
 * newBarFoot sets it 8 up instead of 12, so its top still never passes today's.
 */
export const NEW_BAR = {
  height: 60,
  /** How much of the phone's bottom strip the bar sits in: its foot is the strip less this (never under 12). */
  sink: 12,
  side: 20,
  /**
   * Room at the bar's round ends, inside it: 14 (was 9) so the first and last tabs sit far enough in for
   * the lit capsule to hold "Community" with room either side and still keep 4 in from the bar's end.
   */
  pad: 14,
  /** How far in the lit tab's capsule sits, all round. */
  inset: 4,
  icon: 24,
  label: 11,
  /**
   * Oct 28, owner: "the font under almost does not fit in the glass when your on the tab". The lit capsule
   * is as wide as the lit tab's own word plus `room` each side (never under `minLit`), measured on screen,
   * and changes width as it travels. Where even then "Community" will not fit at 11 with 10 each side
   * (a 375-point iPhone: SE, 13 mini), every word goes to 10.5 with a touch of negative tracking.
   */
  room: 11,
  minLit: 68,
  tightLabel: 10.5,
  tightTrack: -0.2,
  /** The round brand + (PLUS_LOOK 'round'), and its sign: a touch bigger for the taller bar (today's quiet pill's is 34 in 52). */
  plus: 42,
  plusIcon: 25,
  /** How far it tucks toward the edge while you scroll down (today's 12 would sit it on the home bar). */
  tuck: 6,
  /** How far the icons settle into the middle when the words go (half a word's line and its gap). */
  settle: 7,
  badgeLeft: 15,
} as const;

/**
 * The new bar's foot above the screen's bottom edge, from the phone's bottom strip (`bottom`: the strip, or 12 where there is none).
 * Never so high that its top passes today's (`bottom` + BAR_METRICS.height), which every page's bottom room, the live session's
 * bar and the Feed's windows are measured from: with no home bar (an iPhone SE, a browser) the 60-point bar sits 8 up, not 12
 * (review, Oct 28: at 12 its top stood 4 points above today's there).
 */
export function newBarFoot(bottom: number): number {
  return Math.min(Math.max(bottom - NEW_BAR.sink, 12), bottom + BAR_METRICS.height - NEW_BAR.height);
}

/**
 * The new bar's + (Oct 28, owner: "I like keeping + as a solid thing"):
 *   'icon'   a plain + in a ring in the row with the word "Create" under it, in the tabs' own colour, as
 *            Strava's Record (lit in the brand's colour while the Create box is up);
 *   'round'  today's solid round + in the brand's colour, 42 across in the 60-high bar.
 * Only this line changes it.
 */
export type PlusLook = 'icon' | 'round';
export const PLUS_LOOK = 'round' as PlusLook;
