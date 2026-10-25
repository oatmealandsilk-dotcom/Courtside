/**
 * Two look switches, one place (Oct 24, owner: "a lot of our stuff looks too
 * round, also let's make the gradient in the back less obvious"). Both start
 * at 'now', which is the app exactly as it was; flipping one here changes
 * the whole app at once. Colours, fonts and layouts never change here.
 *
 * ROUNDNESS — how round corners are:
 *   'now'       as today (cards 14–20, sheets 24, buttons 18 / 12, chips and inputs pills)
 *   'less'      cards 12, sheets 20, buttons 12 / 10, chips 10, inputs 10
 *   'much-less' cards 8,  sheets 14, buttons 8 / 8,   chips 8,  inputs 8
 * Things meant to be round stay round whatever this says: avatars, round
 * icon buttons, status pills, the tab bar's pill.
 *
 * WASH — the soft coloured glow behind the top of a page (components/Wash.tsx):
 *   'now' as today · 'soft' about half · 'faint' about a quarter · 'none' a flat page
 */
export type Roundness = 'now' | 'less' | 'much-less';
export type WashLook = 'now' | 'soft' | 'faint' | 'none';

export const ROUNDNESS: Roundness = 'less';
export const WASH: WashLook = 'faint';

/** How much of each court's wash is drawn: 1 is today's. */
export const WASH_SCALE = ({ now: 1, soft: 0.5, faint: 0.25, none: 0 } as const)[WASH as WashLook];

const SCALES = {
  //          small   mid    card   sheet  chip   input
  less: { xs: 6, sm: 10, card: 12, sheet: 20, chip: 10, input: 10 },
  'much-less': { xs: 4, sm: 8, card: 8, sheet: 14, chip: 8, input: 8 },
} as const;

const scale = (ROUNDNESS as Roundness) === 'now' ? null : SCALES[ROUNDNESS as Exclude<Roundness, 'now'>];

/**
 * A corner as it is today, at the chosen roundness. Today's value comes back
 * unchanged at 'now'. Otherwise it goes by size: 5–8 small bits, 9–13 tiles,
 * inputs and compact buttons, 14–20 cards and full buttons, 21 and up
 * sheets and big panels. 4 and under (hairline bars) never change.
 */
export function corner(now: number): number {
  if (!scale || now <= 4 || now >= 100) return now;
  if (now <= 8) return Math.min(now, scale.xs);
  if (now <= 13) return Math.min(now, scale.sm);
  if (now <= 20) return Math.min(now, scale.card);
  return Math.min(now, scale.sheet);
}

/** A chip's corner: a pill today, a rounded rectangle when less round. */
export const chipCorner = scale ? scale.chip : 999;
/** A pill- or rounded text field's corner: as given today, the input size when less round. */
export const inputCorner = (now: number) => (scale ? Math.min(now, scale.input) : now);
/** The bar a row of chips or a segmented switch sits in: a pill today, the chip's corner plus its padding when less round. */
export const trackCorner = (pad: number) => (scale ? scale.chip + pad : 999);

/**
 * LESS_AI (Oct 24, owner: "looks a bit too ai", "too much words") — one
 * switch for the hand-made pass: icon tiles off list rows, explainer
 * sentences and filler copy gone, quieter Follow buttons, flat cards with no
 * glow, the court surface wherever a court is listed. false is the app
 * exactly as it was; true turns the whole pass on at once.
 */
export const LESS_AI: boolean = false;

/*
 * The parts of the hand-made pass that are ON (Oct 24). He circled four of the
 * six panels on the Before | After summary and said "Do these quadrants".
 * Everything he did not circle (the Profile pill row, the Health page, and
 * the rest of the list) stays behind LESS_AI above, still off.
 */

/** "Do these quadrants" (Oct 24), panel 1: each court shows its surface (Hard, Clay) at the start of its line and the court icon tile is gone, in Search, Find Players, open hits, map court pins and the court page. */
export const LESS_AI_COURTS: boolean = true;

/** "Do these quadrants" (Oct 24), panel 1 + 8, open hits only: hit cards outlined with no shadow, and the "Looking for a hit?" field without its glow. */
export const LESS_AI_HITS: boolean = true;

/** "Do these quadrants" (Oct 24), panel 4 + 6: on Discussions, a thread and its comments, the topic is a muted word on the name's line (still a tap), zero counts hide, no grey pill behind votes, plain tag links, no sort-menu hints, no "This week" pill, and empty states without the extra sentence. */
export const LESS_AI_DISCUSS: boolean = true;

/** "Do these quadrants" (Oct 24), panel 4 + 9 + 11: Your sessions without "Only you see this.", a flat summary card, rows that lead with the date, and no hours repeated on This week. */
export const LESS_AI_SESSIONS: boolean = true;
