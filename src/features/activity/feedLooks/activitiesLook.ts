import { Platform } from 'react-native';

/**
 * Which look the Feed's Activities shows (Nov 27, owner: "make our website activity tab look like Hevy and
 * Strava ... or like Instagram's beginning for you page ... show me some examples"). Examples only, for his pick:
 *
 * - 'now': today's full-screen pages, one session per swipe (unchanged; the default).
 * - 'strava': a continuous list of activity cards (title, a row of big numbers, the picture, kudos).
 * - 'hevy': a continuous list of workout-log posts (a compact numbers row, the session's lines, the zones bar).
 * - 'classic': a continuous list in the classic Instagram home feed's shape (square picture first).
 * - 'mixed-a' / 'mixed-b': the classic list's behaviour, a session with nothing on it as a small card (three to a
 *   phone screen), a post with a photo or clip as one whole card about a screen tall; A puts the stats above the
 *   photo (Strava/Hevy's order), B under it (Instagram's).
 * - 'mixed-a2': A again, the card sitting as Strava/Hevy/Instagram's do (edge to edge, no box round the numbers, the
 *   photo full bleed, a title line).
 * - 'gallery' / 'gallery-rollup' (Nov 28, owner: "other ppl can only see it if it has a photo attatched ... like a
 *   scrolling gallary"): calmer cards (two numbers, no streak or level on the card); other people's sessions show
 *   only with a photo or clip, yours without one show to you alone as a small "Only you" card. 'gallery-rollup' also
 *   keeps other people's photo-less sessions as one quiet "who played" row per day, opened in place.
 *
 * Nothing chooses one but a web address's `?look=` (or this browser's saved choice), so the app as everyone has
 * it is exactly 'now'.
 *
 * - 'gv1'..'gv4' (Nov 28, owner: "do different designs or variations of gallery too"): four gallery designs with the
 *   gallery's rule (1 Instagram-pure, 2 Strava-photo, 3 Hevy-card, 4 a two-up grid); each '-rollup' adds the
 *   "who played" row.
 */
export type GalleryVariation = 'gv1' | 'gv2' | 'gv3' | 'gv4';
export type ActivitiesLook = 'now' | 'strava' | 'hevy' | 'classic' | 'mixed-a' | 'mixed-b' | 'mixed-a2' | 'gallery' | 'gallery-rollup'
  | GalleryVariation | `${GalleryVariation}-rollup`;

export const ACTIVITIES_LOOKS: ActivitiesLook[] = ['now', 'strava', 'hevy', 'classic', 'mixed-a', 'mixed-b', 'mixed-a2', 'gallery', 'gallery-rollup',
  'gv1', 'gv2', 'gv3', 'gv4', 'gv1-rollup', 'gv2-rollup', 'gv3-rollup', 'gv4-rollup'];

/** The gallery looks: other people's sessions only with a photo or clip. */
export const isGalleryLook = (l: ActivitiesLook) => l === 'gallery' || l === 'gallery-rollup' || l.startsWith('gv');
/** Which gallery variation a look is ('gv3-rollup' → 'gv3'), or null. */
export const galleryVariation = (l: ActivitiesLook): GalleryVariation | null => (l.startsWith('gv') ? (l.slice(0, 3) as GalleryVariation) : null);
/** A gallery look with the "who played" row. */
export const hasWhoPlayed = (l: ActivitiesLook) => l.endsWith('-rollup');
const KEY = 'courtside.activitiesLook';
const isLook = (v: unknown): v is ActivitiesLook => typeof v === 'string' && (ACTIVITIES_LOOKS as string[]).includes(v);

let chosen: ActivitiesLook | null = null;

/** The look this visit shows, read once: the address's `?look=`, then this browser's saved one, else 'now'. */
export function activitiesLook(): ActivitiesLook {
  if (chosen) return chosen;
  let look: ActivitiesLook = 'now';
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const asked = new URLSearchParams(window.location.search).get('look');
      if (isLook(asked)) {
        look = asked;
        try { window.localStorage.setItem(KEY, asked); } catch { /* private window: this visit only */ }
      } else {
        const saved = window.localStorage.getItem(KEY);
        if (isLook(saved)) look = saved;
      }
    } catch { /* no address or storage: today's look */ }
  }
  chosen = look;
  return look;
}
