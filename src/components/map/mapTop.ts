import { Platform } from 'react-native';

/**
 * Which top the full map wears, while a calmer one is tried out (Oct 11,
 * owner: "could the top row and weather be better optimized").
 *
 * - `today`: three rows: Back, the search and Location; the filter chips; the
 *   city chip with its weather (and, zoomed out, "Zoom in to see courts").
 * - `A`: two rows: the city and its weather fold into the search bar ("Search
 *   Los Angeles", "☁ 69°" at its end), the chips under it, and only while
 *   zoomed out a small "Zoom in to see courts" under the chips.
 *
 * Everyone sees `today` unless asked. In a browser, `?maptop=A` turns A on for
 * the visit (kept for the tab, so signing in or a reload keeps it) and
 * `?maptop=today` turns it off again. On a phone, only a development build,
 * by setting PHONE_DEV_LOOK below; a store or update build is always `today`.
 */
export type MapTopLook = 'today' | 'A';

/** A development build on a phone: set to 'A' to try the two-row top there. Never shipped switched on. */
const PHONE_DEV_LOOK: MapTopLook = 'today';

const KEPT = 'courtside-maptop';

function readLook(): MapTopLook {
  if (Platform.OS !== 'web') return typeof __DEV__ !== 'undefined' && __DEV__ ? PHONE_DEV_LOOK : 'today';
  try {
    if (typeof window === 'undefined') return 'today';
    const asked = new URLSearchParams(window.location.search).get('maptop');
    if (asked === 'A') window.sessionStorage.setItem(KEPT, 'A');
    else if (asked) window.sessionStorage.removeItem(KEPT);
    return window.sessionStorage.getItem(KEPT) === 'A' ? 'A' : 'today';
  } catch { return 'today'; }
}

/** Read once, as the page (or the app) loads. */
export const MAP_TOP: MapTopLook = readLook();
