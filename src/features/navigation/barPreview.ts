import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Other bottom bars, pictures only (Nov 28, owner, after the map 2 picture: "Let me see some other bottom bars").
 * Nothing here reaches a person: only a demo build (no Supabase, the made-up demo data) on a phone app, bundled
 * with EXPO_PUBLIC_BAR_PREVIEW set (or the simulator driver's "barpreview v=..."). Off (the default), and
 * everywhere else, the bar is exactly today's.
 *
 *   'quiet'  today's bar for everyone (tabBarLook's 'B', the quiet pill), whoever is signed in;
 *   'new'    the admins' bar today (tabBarLook's NEW_BAR with its lens), whoever is signed in;
 *   'apple'  Apple's own iOS 26 tab bar ("Bar A", Nov 4; NativeBar), never shipped;
 *   '1'      Classic edge: full width on the bottom edge, a hairline on top, the page's own colour, icons with
 *            small words, the lit tab in ink with its icon filled, the + a plain outlined plus with its word;
 *   '2'      Icons only: Instagram's classic bar, five line icons evenly spaced, the lit one filled, the + a
 *            square-plus outline, a hairline on top;
 *   '3'      Small floating capsule: a compact glass capsule (Threads and X on iOS 26), icons only, the lit
 *            one filled in ink, no coloured bubble, the + a plain icon in the row;
 *   '4'      Quiet pill, calmer: today's quiet pill with an ink outlined + instead of the green circle, its
 *            words a touch smaller, the lit tab in the brand's green (icon and word only).
 * (BarPreviews draws 1 to 3; TabBarLooks draws 4 as a variant of the quiet pill; NavBar picks.)
 */
export type BarPreview = 'off' | 'quiet' | 'new' | 'apple' | '1' | '2' | '3' | '4';
const ALL: readonly BarPreview[] = ['off', 'quiet', 'new', 'apple', '1', '2', '3', '4'];

/** Only a demo build of the phone app: never the website, never a build with the live server. */
const PREVIEW_OK = !isSupabaseConfigured && Platform.OS !== 'web';
const fromEnv = process.env.EXPO_PUBLIC_BAR_PREVIEW as BarPreview | undefined;

let current: BarPreview = PREVIEW_OK && fromEnv && ALL.includes(fromEnv) ? fromEnv : 'off';
const listeners = new Set<() => void>();
const read = () => current;
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** The simulator driver's "barpreview v=1": another bar from now on (a demo build only; ignored anywhere else). */
export function setBarPreview(v: string | undefined) {
  if (!PREVIEW_OK) return;
  const next = (ALL as readonly string[]).includes(v ?? '') ? (v as BarPreview) : 'off';
  if (next === current) return;
  current = next;
  listeners.forEach((fn) => fn());
}

/** The bar being previewed ('off': today's, as everywhere outside a demo build). */
export function useBarPreview(): BarPreview {
  return useSyncExternalStore(subscribe, read, read);
}
