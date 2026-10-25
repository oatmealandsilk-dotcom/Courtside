import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/*
 * Whether CourtSide had been used on this phone (or in this browser) before this open (Oct 25), for a
 * setting that starts one way for a new player and the other for everyone else: Match phone, on from
 * the start for a new player only (owner: "Match phone. On for new users"; src/theme/ThemeProvider.tsx).
 *
 * Read once, as the app's code first loads (app/_layout.tsx brings this file in first; nothing in the
 * app saves anything while its code loads), so before this open has saved anything of its own: the
 * names of what is already saved here. Used before = any of CourtSide's own saved things is there,
 * leaving out the website's link counting (LINK_MARKS). Every name the app saves under starts
 * "courtside" (a theme picked, tips seen, the tutorial, recent searches, and on a phone the crash
 * reporter's note, written on every open since Oct 1), and Supabase keeps a sign-in under one starting
 * "sb-". A fresh install has none: a phone app's storage goes with it when it is deleted, so
 * reinstalling counts as new, as does a browser that never opened the app (or whose site data was
 * cleared). The signed-in account's age is not used: it is known only after sign-in, long after the
 * first screen is drawn, and "new on this phone" is what a look on this phone goes by.
 */
const OURS = /^(courtside|sb-)/;
/**
 * Not a sign of having used the app: what the website saves before the app ever opens.
 * courtsidebase.com lands on app.courtsidebase.com/waitlist.html (Cloudflare's redirect, the same
 * site as the app, so the same storage), which, for a link with a label (?ref=fb, a player's handle,
 * an affiliate's code), saves a random visitor id and a once-a-day mark for that link
 * (courtside-seen-fb) and then opens the app. The old welcome.html does the same. Counted, every new
 * player who came through a link (the Facebook ad, an invite) would start with Match phone off.
 * The app's own "Get the app" marks (courtside-seen-app-…, src/features/guest/campaign.ts) are the
 * same kind of mark.
 */
const LINK_MARKS = /^courtside-(visitor$|seen-)/;

function webKeys(): string[] | null {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key != null) keys.push(key);
    }
    return keys;
  } catch {
    return null;
  }
}

function phoneKeys(): Promise<string[] | null> | null {
  try {
    // Asked as this file loads: the phone's store answers in the order it is asked, so nothing this
    // open saves later can be in the answer.
    return AsyncStorage.getAllKeys().then((keys) => [...keys], () => null);
  } catch {
    return null;
  }
}

/** What was saved here as this open began; null when it could not be read. A browser's at once, a phone's when its store answers. */
const atOpen: string[] | null | Promise<string[] | null> = Platform.OS === 'web' ? webKeys() : phoneKeys();

/** The names saved here as this open began (null: could not be read). */
export const keysAtOpen = (): Promise<string[] | null> => Promise.resolve(atOpen);

/** The same, at once, in a browser (its storage reads straight away); null on a phone. */
export const keysAtOpenNow = (): string[] | null => (Array.isArray(atOpen) ? atOpen : null);

/** Whether CourtSide was used here before this open, `except` (the setting being decided) left out; null when it cannot be told. */
export function usedBefore(keys: readonly string[] | null, except?: string): boolean | null {
  if (!keys) return null;
  return keys.some((key) => key !== except && OURS.test(key) && !LINK_MARKS.test(key));
}
