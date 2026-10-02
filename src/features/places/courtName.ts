import type { Court } from '@/features/players/courts';
import { plain, wordStartIndex } from '@/features/search/words';

/** OpenStreetMap leaves most public courts unnamed; the list calls those "Public courts". */
export const labelOf = (c: Court) => (c.name === 'Tennis courts' ? 'Public courts' : c.name);

/**
 * How well a court's name answers what was typed, the way Search reads it:
 * every word typed must start a word of the name ("pu" finds Pullen Park,
 * not Campus); 0 when the name starts with the first word typed (a leading
 * "The" aside: "ra" is The Raleigh Raquet Club's start too), 1 when a later
 * word of it does. Null when it does not match.
 */
export function score(name: string, words: string[]): number | null {
  const n = plain(name);
  const start = n.startsWith('the ') ? 4 : 0;
  let rank = 1;
  for (const [i, w] of words.entries()) {
    const at = i === 0 && start && n.startsWith(w, start) ? start : wordStartIndex(n, w);
    if (at < 0) return null;
    if (i === 0 && (at === 0 || at === start)) rank = 0;
  }
  return rank;
}

/**
 * An id the map gave a court (OpenStreetMap's "way123456"). Only these carry
 * players' notes and posts; a hit's place or a chat's court travels with one
 * only when it was picked from the courts list, and anything else in that
 * slot (a typed place, an old message) is not trusted as one.
 */
export const isMapCourtId = (id?: string | null): id is string => !!id && /^(node|way|relation)\d{1,15}$/.test(id);

/**
 * A name that reads as a public court: a park, a rec or community centre, a
 * school, a playground. Lists put these first, and only these are named by
 * the app on its own ("Post the first hit at …"): a court called "Hillcrest
 * Tennis Club" may be members-only. It lowers that risk; it does not remove
 * it (owner decision 6).
 */
const PUBLIC_WORDS = /\b(park|rec|recreation|community|center|centre|school|playground|public)\b/i;
export const looksPublic = (name: string) => PUBLIC_WORDS.test(name);
