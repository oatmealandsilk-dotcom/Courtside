import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Which sign-up ask a visitor sees on the website (Nov 28, owner: "The new web
 * link pop ups are better could could be even better" / "I just feel like the
 * square and green button does not seem human and seems like ai toy like").
 * Four takes to look at side by side before one is kept; nothing changes for
 * anyone until he picks:
 *   today  the live prompt (X's signed-out prompt): the default
 *   a      a small bubble by the button that was tapped (YouTube)
 *   b      a person-first sheet: their face and the post, the ask in ink
 *   c      no pop-up: a slim bar at the foot says it, until the next swipe (Instagram web)
 *   d      a plain letter: words, then two quiet buttons at the right
 * Add ?joinlook=a (b, c, d) to the demo website's address to choose; the
 * choice is kept for the rest of that visit. The live website (a build with
 * Supabase) and the phones always get today's.
 */
export type JoinLook = 'today' | 'a' | 'b' | 'c' | 'd';

const KEY = 'courtside-joinlook';
const LOOKS: readonly JoinLook[] = ['today', 'a', 'b', 'c', 'd'];
const isLook = (v: unknown): v is JoinLook => typeof v === 'string' && (LOOKS as readonly string[]).includes(v);

let chosen: JoinLook | null = null;

export function joinLook(): JoinLook {
  if (chosen) return chosen;
  chosen = 'today';
  if (Platform.OS !== 'web' || isSupabaseConfigured || typeof window === 'undefined') return chosen;
  try {
    const asked = new URLSearchParams(window.location.search).get('joinlook');
    if (isLook(asked)) {
      window.sessionStorage.setItem(KEY, asked);
      chosen = asked;
    } else {
      const kept = window.sessionStorage.getItem(KEY);
      if (isLook(kept)) chosen = kept;
    }
  } catch { /* no storage: today's */ }
  return chosen;
}
