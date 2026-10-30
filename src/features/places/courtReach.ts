import { isMapCourtId } from '@/features/places/courtName';
import { fetchCourts, peekCourts, type Court } from '@/features/players/courts';
import { milesBetween } from '@/features/players/geo';
import type { LatLng } from '@/features/players/positions';

/*
 * How far a court reaches: who counts as at it (lightUp's "I'm playing here" from Up to hit, Find Players'
 * "You're at <court>?", and since Oct 30 whether a Busy or Full answer lights it, migration 207). Moved here
 * from features/places/lightUp unchanged, so the app's store can use it without importing the store back.
 */

/** The map's own rule for the same court (features/places/court sameCourt): within 0.15 mi of its pin. */
const SAME_COURT_MILES = 0.15;
/** A big place reaches further: this much more per court past AT_COURT_BASE_COURTS, up to AT_COURT_MAX_MILES. */
const AT_COURT_PER_COURT_MILES = 0.01;
const AT_COURT_BASE_COURTS = 4;
const AT_COURT_MAX_MILES = 0.35;

/**
 * How far from a court's pin you still count as at it (Oct 29, owner: "But what if like my club has 20 courts. The
 * area is much bigger"): SAME_COURT_MILES (about 240 m) for up to 4 courts, about 16 m more for each court past 4,
 * at most 0.35 mi (about 560 m): 8 courts 0.19 mi, 12 courts 0.23 mi, 20 courts 0.31 mi. The server places a friend
 * on a big club's court as far out (migration 206, map_players).
 */
export const atCourtMiles = (courts: number): number =>
  Math.min(AT_COURT_MAX_MILES, SAME_COURT_MILES + AT_COURT_PER_COURT_MILES * Math.max(0, courts - AT_COURT_BASE_COURTS));

/** Named courts this close together are one place (a big club's courts can fall into two or three of the map's pins). */
const ONE_PLACE_MILES = 0.5;

/** How many courts the place a pin stands for has: its own, plus same-named pins close by (an unnamed pin is its own place). */
/** A name that only says what it is ("Tennis Courts", "Public courts", "Courts"), in any case: not a place's own name. */
const GENERIC_NAME = /^\s*(public\s+)?(tennis\s+)?courts?\s*$/i;

export function placeCourts(c: Court, courts: Court[]): number {
  if (!c.name || GENERIC_NAME.test(c.name)) return Math.max(1, c.count);
  let n = Math.max(1, c.count);
  for (const o of courts) if (o.id !== c.id && o.name === c.name && milesBetween(o, c) <= ONE_PLACE_MILES) n += Math.max(1, o.count);
  return n;
}

/**
 * The court you are standing at: the nearest one within reach of its pin (atCourtMiles: further at a big club), a
 * club's too, never someone's home court; or null. Nearest by how far into its reach you are, so a small park beside
 * a big club still wins when you stand on it.
 */
export function courtAt(at: LatLng, courts: Court[]): Court | null {
  let best: Court | null = null;
  let bestShare = 1;
  for (const c of courts) {
    if (!isMapCourtId(c.id) || c.access === 'private') continue;
    const share = milesBetween(at, c) / atCourtMiles(placeCourts(c, courts));
    if (share < bestShare) { best = c; bestShare = share; }
  }
  return best;
}

/**
 * Whether a spot is within this court's reach (atCourtMiles, as courtAt measures it), worked out on the phone: the
 * demo's stand-in for the server's own answer (migration 207, which decides for real). False when the court is not
 * among those near the spot.
 */
export async function atCourtFor(courtId: string, at: LatLng): Promise<boolean> {
  const list = peekCourts(at) ?? await Promise.race([
    fetchCourts(at).catch(() => [] as Court[]),
    new Promise<Court[]>((resolve) => { setTimeout(() => resolve([]), 5000); }),
  ]);
  const c = list.find((x) => x.id === courtId);
  return !!c && milesBetween(at, c) <= atCourtMiles(placeCourts(c, list));
}
