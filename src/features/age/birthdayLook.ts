import { Platform } from 'react-native';

/**
 * Which birthday page to show (Oct 17, owner: "Make the UI of the what's
 * your birthday and are you 13 years or older ... a lot better"). Two
 * designs, to look at side by side on the website before one is kept:
 *   a  "Wheel": the phone's own kind of date wheel (month, day, year)
 *   b  "Refined fields": three big boxes, MM / DD / YYYY (the default, Oct
 *      17 review: it starts empty, typing 1979 beats rolling 47 rows, and it
 *      uses the phone's own number pad, so it is the safer one for Apple)
 * Add ?bdaylook=a or ?bdaylook=b to a web address to choose; the choice is
 * kept for the rest of that visit. Phones always get the default.
 */
export type BirthdayLook = 'a' | 'b';

const DEFAULT_LOOK: BirthdayLook = 'b';
const KEY = 'courtside-bdaylook';

let chosen: BirthdayLook | null = null;

export function birthdayLook(): BirthdayLook {
  if (chosen) return chosen;
  chosen = DEFAULT_LOOK;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const asked = new URLSearchParams(window.location.search).get('bdaylook');
      if (asked === 'a' || asked === 'b') {
        window.sessionStorage.setItem(KEY, asked);
        chosen = asked;
      } else {
        const kept = window.sessionStorage.getItem(KEY);
        if (kept === 'a' || kept === 'b') chosen = kept;
      }
    } catch { /* no storage: the default */ }
  }
  return chosen;
}
