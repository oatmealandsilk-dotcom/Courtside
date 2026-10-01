import { Platform } from 'react-native';

/**
 * Pull-to-refresh, one set of numbers for every page that has it: Home and
 * the rest alike.
 *
 * On the phone a page rests just past a blank strip. Pulling down first
 * scrolls that strip into view, one for one with the finger, the way you
 * reach the top of any list. Past the strip's top the phone's own stretch
 * takes over: the page moves about half as far as the finger, and less the
 * further it goes. That give is what makes it feel like pulling against
 * something rather than scrolling, and the line sits part way into it. Let
 * go past the line and the phone's own bounce settles the page into the
 * held gap while the fetch runs; let go short of it and the page goes back
 * to where it rests, and nothing happens.
 *
 * A browser has no stretch of its own, so there the same curve is worked
 * out by hand from the finger (`rubberBand`).
 */

/** The gap held open under the top while the fetch runs (the system's own is about 60). */
export const PULL_GAP = 56;

/** How far into the stretch the line sits: about 95pt of finger past the strip's top. */
export const PULL_STRETCH = 48;

/**
 * How open the gap is at the line. A phone without the stretch (Android)
 * cannot go past the strip's top at all, so there the top itself is the line.
 */
export const PULL_LINE = Platform.OS === 'ios' ? PULL_GAP + PULL_STRETCH : PULL_GAP;

/**
 * In a browser the whole pull is stretch, from the first point: the line is
 * where about 150pt of finger has gone, the same as on the phone.
 */
export const WEB_PULL_LINE = 76;

/**
 * Home's line in a browser. On the phone, Home's pull first uncovers the room
 * under the clock as well, so it takes about 200pt of finger; this is where
 * the browser's stretch has used up the same.
 */
export const WEB_HOME_PULL_LINE = 97;

/** Easing back this far above the line lets go of it again, without a second tick. */
export const PULL_DISARM = 12;

/** The disc turns at least this long from the moment you let go, so a quick fetch still reads as one. */
export const PULL_MIN_SPIN = 700;

/**
 * A fetch that hangs never keeps the page held past this: the page comes back
 * and the fetch is left to finish on its own behind.
 */
export const PULL_GIVE_UP = 8000;

/**
 * Let go past the line, the phone works out where its bounce will stop. Within
 * this much of the strip's top counts as on it, and the phone's own bounce is
 * left to carry the page there rather than being replaced.
 */
export const PULL_LAND_SLACK = 4;

/**
 * The way back once the fetch is done: a spring with no bounce, most of the
 * way in a quarter of a second and settled in about half of one. It starts
 * from rest, so it eases away rather than jumping off, and a finger can
 * catch it at any point. It counts as home once it is a fraction of a point
 * away (by default a spring keeps creeping, unseen, for twice as long).
 */
export const PULL_RETURN = { mass: 1, stiffness: 196, damping: 28, overshootClamping: true, energyThreshold: 1e-5 } as const;

/** The disc's size, and the band it sits in. */
export const PULL_DISC = 28;

/** How far the pull has come toward the line, 0 to 1. */
export function pullProgress(gap: number, line: number) {
  'worklet';
  return Math.max(0, Math.min(1, (gap - 8) / (line - 8)));
}

/**
 * Where the disc (and Home's greeting) sits: in the middle of the open gap,
 * so it rides down with the pull and back up with the return, never under
 * the page. Measured from the top of the gap.
 */
export function pullRowLift(gap: number) {
  'worklet';
  return Math.max(gap / 2, PULL_DISC / 2) - PULL_DISC / 2;
}

/** The disc shows once there is room for it, and goes again as the gap closes. */
export function pullRowOpacity(gap: number) {
  'worklet';
  return Math.max(0, Math.min(1, (gap - 12) / 20));
}

/**
 * The phone's stretch, for a browser that has none: how far the page moves
 * for this much finger, in a box this tall. About half the finger at first,
 * less and less after, and never more than the box.
 */
export function rubberBand(finger: number, room: number) {
  'worklet';
  const d = Math.max(1, room);
  return (1 - 1 / ((Math.max(0, finger) * 0.55) / d + 1)) * d;
}

/** The finger it takes to move the page this far: the stretch run backwards, for picking up a page mid-move. */
export function fingerFor(moved: number, room: number) {
  'worklet';
  const d = Math.max(1, room);
  const v = Math.max(0, Math.min(moved, d - 1));
  return ((d / 0.55) * v) / (d - v);
}

/**
 * Waits for a pull's fetch, but never longer than PULL_GIVE_UP: one that
 * hangs is left to finish on its own behind. Gives back what the fetch
 * returned, or `false` when it failed or ran out of time.
 */
export function pullFetch<T>(work: () => Promise<T> | T): Promise<T | false> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), PULL_GIVE_UP);
    Promise.resolve()
      .then(work)
      .then(
        (value) => { clearTimeout(timer); resolve(value); },
        () => { clearTimeout(timer); resolve(false); },
      );
  });
}
