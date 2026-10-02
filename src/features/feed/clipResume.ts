/**
 * The feed's rule for coming back to a clip, the way Instagram's Reels do it:
 * swipe away and back within a few seconds and it carries on where it was;
 * come back later and it starts over from the part its author kept.
 *
 * The spot is kept here, by clip, rather than inside one player. The feed
 * keeps only the page behind built, and a re-deal rebuilds every page, so the
 * clip you come straight back to can have a brand-new player: it still knows
 * where you were.
 *
 * A page pushed over the feed, another tab, or the app going to the
 * background is not a swipe. The players hold their own place for those and
 * carry on from it however long it took (see ClipVideo and ClipPlayback.web).
 */
export const RESUME_WINDOW_MS = 5000;

const spots = new Map<string, { time: number; at: number }>();

/** The clip was swiped away `time` seconds in. */
export function noteLeft(uri: string, time: number) {
  spots.set(uri, { time, at: Date.now() });
}

/**
 * Where to pick the clip up if it was swiped away recently enough, or null to
 * start it over. The spot is used up either way. `cameBack` is when the clip
 * came back on screen: a player that had to load first still counts from
 * then, not from the moment it was ready.
 */
export function takeLeft(uri: string, cameBack = Date.now()): number | null {
  const now = Date.now();
  const spot = spots.get(uri);
  spots.delete(uri);
  // Spots too old to matter are dropped as we go, so this never grows with the feed.
  for (const [key, old] of spots) if (now - old.at > RESUME_WINDOW_MS) spots.delete(key);
  return spot && cameBack - spot.at <= RESUME_WINDOW_MS ? spot.time : null;
}

/**
 * The spot `takeLeft` would give back for a clip that came on screen at
 * `cameBack`, without using it up: a player built while its clip is already
 * on screen loads from there rather than from the start, so there is no
 * second wait when it jumps.
 */
export function peekLeft(uri: string, cameBack = Date.now()): number | null {
  const spot = spots.get(uri);
  return spot && cameBack - spot.at <= RESUME_WINDOW_MS ? spot.time : null;
}

/** The clip carried on from where it stood (it had been paused or covered): an older spot no longer applies. */
export function forgetLeft(uri: string) {
  spots.delete(uri);
}
