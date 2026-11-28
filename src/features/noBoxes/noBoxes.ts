import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * The "no boxes" look, for pictures only (Nov 28, owner: "but i mena in
 * general i think the currenct box look is bad. and i think we have other
 * spots where stuff like that exists"). The website sign-up ask he chose (D,
 * "Plain") in every other spot that drew the box: a centred card with an icon
 * tile on top, a centred bold headline, centred grey words and a full-width
 * green button (or an outlined box button) stacked under it.
 *
 * In the no-boxes look the words sit left-aligned, the main action is a
 * compact ink button sized to its word (a plain text action where it is not
 * the main point), the second choice is words, corners are small, nothing
 * glows, and a pop-up is a sheet from the foot on a phone. Brand green stays a
 * small accent.
 *
 * Off for everyone. On only in a demo build: EXPO_PUBLIC_NO_BOXES=1 at build
 * time (the iPhone simulator's pictures), or ?noboxes=1 in the demo website's
 * address (kept for the rest of that visit; ?noboxes=0 turns it off). The live
 * website (a build with Supabase) and the store app never see it.
 */
const KEY = 'courtside-noboxes';
let chosen: boolean | null = null;

export function noBoxes(): boolean {
  if (chosen !== null) return chosen;
  chosen = false;
  if (isSupabaseConfigured) return chosen;
  if (process.env.EXPO_PUBLIC_NO_BOXES === '1') { chosen = true; return chosen; }
  if (Platform.OS !== 'web' || typeof window === 'undefined') return chosen;
  try {
    const asked = new URLSearchParams(window.location.search).get('noboxes');
    if (asked === '1' || asked === '0') {
      window.sessionStorage.setItem(KEY, asked);
      chosen = asked === '1';
    } else chosen = window.sessionStorage.getItem(KEY) === '1';
  } catch { /* no storage: today's look */ }
  return chosen;
}
