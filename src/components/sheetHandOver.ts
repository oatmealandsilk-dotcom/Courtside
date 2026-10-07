/**
 * One sheet handing over to the next page's sheet, in its place (Oct 7:
 * Start a session's Start, to the live page). Without it the first sheet
 * slid all the way down, the page behind showed undimmed for a moment, and
 * the live page rose from the bottom again: a dip in the middle of Start's
 * one moment. Handed over, the first sheet's contents fade where they are,
 * and the next sheet opens already up at that height, the dim already in
 * place, then settles at its own height as its contents fade in: one sheet
 * whose contents change. Both DragSheet twins read and write it.
 */
let handed: { height: number; at: number } | null = null;
/** How long a hand-over waits for the next sheet to take it before it lapses (a page that never came). */
const LAPSE_MS = 1500;

/** The leaving sheet: how tall it stood, for the next one to open at. */
export function handOverSheet(height: number) {
  handed = { height: Math.max(1, Math.round(height)), at: Date.now() };
}

/** The height the sheet before left for this one, if it handed over just now. Read when the sheet first draws. */
export function arrivingHeight(): number | null {
  const h = handed;
  return h && Date.now() - h.at < LAPSE_MS ? h.height : null;
}

/** The next sheet has taken it: any sheet after opens the usual way. */
export function takeHandOver() {
  handed = null;
}

/** How long the leaving sheet's contents take to fade, and the arriving one's to come in. */
export const HAND_OUT_MS = 140;
export const HAND_IN_MS = 220;
