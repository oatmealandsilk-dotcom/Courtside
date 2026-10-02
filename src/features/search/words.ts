/**
 * How every search box in the app reads what was typed, in one place so
 * they all agree: case, accents and extra spaces never matter, and a word
 * typed matches from the start of a word ("pu" finds Pullen Park, not
 * Campus). Search, Add location and the court pickers all use these.
 */

/** Lower case, no accents, single spaces: "Pullen  Park" and "pullen park" are the same search. */
export const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Whether position `i` of `text` begins a word: the start, or after a space or a mark. */
export const atWordStart = (text: string, i: number) => i === 0 || !/[\p{L}\p{N}]/u.test(text[i - 1]);

/** Where `needle` first starts a word in `hay` (both plain), or -1. */
export function wordStartIndex(hay: string, needle: string): number {
  if (!needle) return -1;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) if (atWordStart(hay, i)) return i;
  return -1;
}

/** Whether `needle` starts a word somewhere in `hay` (both plain): "serve" in "kick serve", not in "observe". */
export const startsWord = (hay: string, needle: string): boolean => wordStartIndex(hay, needle) >= 0;
