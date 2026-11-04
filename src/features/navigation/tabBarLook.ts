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
 * Apple's own tab bar (Nov 2, barLens's A; components/NativeBar), whose size and place the phone decides. On an
 * iPhone with a home bar it is laid out as iOS has always laid a tab bar out, 49 points over the bottom strip,
 * and on iOS 26 its glass capsule fills the top 62 of that: measured from his screenshot of Strava's (Apple's
 * own bar), 62 high, 21 in from each side, its foot 21 above the screen's bottom edge (34 + 49 - 62 = 21).
 * Our round + sits in the middle of that capsule, and the bar's box is exactly the room the phone's bar takes
 * (the box swallows touches meant for the page under it, so it is never bigger). Unproven until it is seen
 * in the Simulator: if the capsule stands anywhere else, these are the numbers to change.
 *   frame    the bar's own height over the bottom strip;
 *   capsule  the glass capsule's height, from the frame's top;
 *   side     how far in from each side the capsule's ends are (the tutorial's lit tabs are measured on it);
 *   icon     the tab icons' size.
 * Its top (34 + 49 = 83 up) stays below today's bar's (34 + BAR_METRICS.height = 90 up), which every page's
 * bottom room is measured from.
 */
export const NATIVE_BAR = { frame: 49, capsule: 62, side: 21, icon: 25 } as const;

/**
 * Apple's bar's lit bubble once it has landed (Nov 4, owner, after the three bars side by side: "I like the clearness or
 * apples own glass but it's just a bit too big when it lands because the circle almost cuts into the other pages icons").
 *
 * What sets it (Nov 4, measured in the Simulator from the bar's own views): the bubble at rest is exactly the lit tab's
 * button, and Apple sizes the five buttons (our four tabs and the empty middle place under our +) itself, in one of two ways.
 *   Stretched (most phones): each button wants its word's width plus about 31 points, never under about 73; the five are
 *     stretched together to fill the glass, each overlapping its neighbours by 20 points. So the long words' buttons
 *     (Community, Coaching) get the biggest bubbles, and a lit neighbour's bubble, reaching 20 points into them, stops
 *     about a point from "Community" (Feed lit) or "Coaching" (Profile lit).
 *   Equal (wide phones): once the phone is wide enough, all five buttons are the longest lit word plus 33, spread evenly
 *     (they overlap less), so every bubble is the same size with more room around it.
 * The icon pictures' size, the word's offset, UIKit's own itemWidth, itemSpacing and itemPositioning change none of it
 * (tried), and neither do smaller words alone at 402 points (8 to 9 tried live: still stretched).
 *
 *   'today'   Apple's own: words 10 (semibold when lit). Equal from 422 points wide (an iPhone Pro Max or Plus).
 *   'small'   words 9 (semibold when lit), and Apple's equal buttons from 407 points wide instead of 422. On a
 *             402-point phone Community's and Coaching's bubbles are 3 points smaller and Feed's and Profile's 2 bigger,
 *             and the two tight spots (Feed lit, Profile lit) stay about as tight; from 407 every bubble is 85 (Community's
 *             up to 19 smaller, Coaching's up to 7, Feed's and Profile's about the same), and from 422 every bubble is 5
 *             smaller than today's 90. The words' size is the only other change.
 * (Nov 4 review: 'even' and 'even10', invisible room around the long words, were dropped: they made Community's and
 * Coaching's bubbles bigger, not smaller, and on a 440-point phone pushed Coaching's under the round +.)
 * Only this line changes it (A itself stays off: barLens's BAR_NATIVE_FOR_*).
 */
export type NativeBubble = 'today' | 'small';
export const NATIVE_BUBBLE = 'today' as NativeBubble;
/**
 * Each option's words' size (null: Apple's own, 10) and the screen width from which Apple lays the buttons out equal
 * (Nov 4, Simulator, the bar resized live: 'today' stretched at 420 and equal at 424; 'small' stretched at 406 and equal at 408).
 */
const BUBBLES: Record<NativeBubble, { word: number | null; equalFrom: number }> = {
  today: { word: null, equalFrom: 422 },
  small: { word: 9, equalFrom: 407 },
};

/**
 * Apple's bar's own measures (above; Simulator, Nov 4), in points: what each stretched button wants on top of its word,
 * the least it takes, how far stretched neighbours overlap, the glass's distance from the screen's sides and its buttons'
 * from its ends, and what an equal button takes on top of the longest lit word.
 */
const APPLE_BAR = { want: 30.77, least: 73.37, overlap: 20, side: 21, inset: 4, equal: 33 } as const;
/** The four words (Community, Feed, Coaching, Profile) as Apple draws them lit (semibold), at 10 points. */
const LIT_WORDS_10 = [57.33, 24.67, 47.33, 33] as const;

/** How Apple's bar is set up for a screen this wide: the words' size (null: Apple's own) and the five places' middles. */
export type NativeBarSetup = { word: number | null; places: readonly number[] };

/**
 * The bar's setup for NATIVE_BUBBLE on a screen `width` points wide: where Apple puts the middle of each of its five
 * places, worked out from its measures (above). The tutorial's targets and the Feed tab's hold sit on them (Nov 3: on
 * five equal places they were up to 17 points off). Checked against Apple's own buttons, resized live from 375 to 440
 * points: within 1 point for both options at every width, with Bold Text off (Nov 4; before, 'today' scaled the
 * 402-point places and was up to 12 points off on a 440-point phone).
 */
export function nativeBarSetup(width: number, bubble: NativeBubble = NATIVE_BUBBLE): NativeBarSetup {
  const look = BUBBLES[bubble];
  const k = (look.word ?? 10) / 10;
  const words = LIT_WORDS_10.map((w) => w * k);
  const start = APPLE_BAR.side + APPLE_BAR.inset;
  // The glass less its ends' insets (352 on a 402-point screen).
  const span = width - 2 * start;
  let places: number[];
  if (width >= look.equalFrom) {
    // Equal buttons, the first and last against the glass's ends, the rest evenly between.
    const w = Math.max(...words) + APPLE_BAR.equal;
    places = [0, 1, 2, 3, 4].map((i) => start + w / 2 + (i * (span - w)) / 4);
  } else {
    // Stretched: the five buttons, overlapping, fill the glass (432 on a 402-point screen).
    const want = [words[0], words[1], 0, words[2], words[3]].map((w) => Math.max(w + APPLE_BAR.want, APPLE_BAR.least));
    const stretch = (span + 4 * APPLE_BAR.overlap) / want.reduce((a, b) => a + b, 0);
    let x = start;
    places = want.map((w) => { const middle = x + (w * stretch) / 2; x += w * stretch - APPLE_BAR.overlap; return middle; });
  }
  // The middle place is our round +, always in the middle of the screen.
  places[2] = width / 2;
  return { word: look.word, places };
}

/** The room Apple's bar takes above the screen's bottom edge, from the phone's bottom strip (`inset`, 0 with no home bar). */
export function nativeBarRoom(inset: number): number {
  return Math.max(inset + NATIVE_BAR.frame, NATIVE_BAR.capsule + 12);
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
