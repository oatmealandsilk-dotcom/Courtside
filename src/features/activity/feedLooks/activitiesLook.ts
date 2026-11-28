import { Platform } from 'react-native';

/**
 * Which look the Feed's Activities shows (Nov 27, owner: "make our website activity tab look like Hevy and
 * Strava ... or like Instagram's beginning for you page ... show me some examples"). Examples only, for his pick:
 *
 * - 'now': today's full-screen pages, one session per swipe (unchanged; the default).
 * - 'strava': a continuous list of activity cards (title, a row of big numbers, the picture, kudos).
 * - 'hevy': a continuous list of workout-log posts (a compact numbers row, the session's lines, the zones bar).
 * - 'classic': a continuous list in the classic Instagram home feed's shape (square picture first).
 *
 * Nothing chooses one but a web address's `?look=` (or this browser's saved choice), so the app as everyone has
 * it is exactly 'now'.
 */
export type ActivitiesLook = 'now' | 'strava' | 'hevy' | 'classic';

export const ACTIVITIES_LOOKS: ActivitiesLook[] = ['now', 'strava', 'hevy', 'classic'];
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
