import type { HitRequest } from '@/data/types';
import type { LatLng } from '@/features/players/positions';

/*
 * "Flexible": a hit with no court picked yet (Oct 25, the owner: "an option to
 * put like TBD … basically like we don't have to choose a court right now").
 * Whoever joins sorts the court out with the poster in the hit's chat.
 *
 * The hit's place then has no id, lat or lng, only `flexible`, the town it is
 * near (`near`, "Cary") and a rough `area`, so the Open hits list can say how
 * far it is and the server can tell players nearby. The area is never where
 * anyone is: the app sends a point rounded to 0.05° (a town-sized square,
 * about 5 km), and the database (migration 187) replaces it with their town's
 * point, or rounds it again: never the map's rough spot. No screen ever draws it or shows
 * coordinates, only "near Cary" and a rounded distance.
 *
 * The name is written out too ("Court flexible · near Cary"), so an older app
 * and the server's own sentences (the chat's title, alerts) read well with no
 * change: to them it is a place that was only typed.
 */

type Place = HitRequest['place'];

/** The picker's row and its chosen card. */
export const FLEXIBLE_TITLE = 'Flexible';
export const FLEXIBLE_LINE = 'Pick the court together in the chat';
/** How a flexible hit's place reads on its card and in lists. */
export const FLEXIBLE_COURT = 'Court flexible';

/** Whether a hit (or a place) has no court yet. */
export const isFlexiblePlace = (place: Place | null | undefined): boolean => place?.flexible === true;
export const isFlexibleHit = (hit: Pick<HitRequest, 'place'>): boolean => isFlexiblePlace(hit.place);

/**
 * A town's name the way the server keeps it (migration 187): the part before
 * the first comma, letters, spaces and . ' - only, at most 40 characters.
 * "Cary, NC" is "Cary". Nothing left: none.
 */
export function nearWord(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const word = raw.split(',')[0].replace(/[^\p{L}\s.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
  return word || undefined;
}

/** "Court flexible · near Cary", or just "Court flexible" with no town. The server writes the same. */
export function flexibleName(near?: string): string {
  return near ? `${FLEXIBLE_COURT} · near ${near}` : FLEXIBLE_COURT;
}

/** A point to a town-sized square: 0.05° (about 5 km). Never finer than this leaves the phone. */
const roughly = (v: number) => Number((Math.round(v * 20) / 20).toFixed(2));

/**
 * The place a flexible hit is posted with: the town's name and a rough point
 * where the courts list was centred. The database rebuilds all of it from
 * scratch (migration 187); before that migration this is what is kept, and
 * it is only a town-sized square.
 */
export function flexiblePlace(near: string | undefined, hint: LatLng): Place {
  const town = nearWord(near);
  return { flexible: true, name: flexibleName(town), ...(town ? { near: town } : {}), area: { lat: roughly(hint.lat), lng: roughly(hint.lng) } };
}

/** Where a flexible hit is, roughly: for the Open hits list's distance only. Null for a court or a typed place. */
export function hitArea(hit: Pick<HitRequest, 'place'>): LatLng | null {
  if (!isFlexibleHit(hit)) return null;
  const a = hit.place.area;
  if (!a || typeof a.lat !== 'number' || typeof a.lng !== 'number' || !Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return null;
  return { lat: a.lat, lng: a.lng };
}

/** The place as its card says it: "Court flexible · near Cary" for a flexible hit, else its own name. */
export function placeLabel(place: Place): string {
  return isFlexiblePlace(place) ? flexibleName(place.near) : place.name;
}

/**
 * The place inside a sentence: "at Pullen Park", "near Cary" (a flexible hit
 * with a town), or nothing at all (flexible, no town).
 */
export function placeInSentence(place: Place): string {
  if (!isFlexiblePlace(place)) return `at ${place.name}`;
  return place.near ? `near ${place.near}` : '';
}

/** Where a hit was played, for the log ("At Cary"): its court, its town when it was flexible, or nothing. */
export function placeForLog(place: Place): string {
  return isFlexiblePlace(place) ? place.near ?? '' : place.name;
}
