import { Platform } from 'react-native';

/**
 * The guest Community screen's look on the website (Nov 27, owner, on his screenshot of it: "On this screen
 * all the impeccable shit needs to be run it's so ass", then "Mainly the middle map, and the bottom bar,
 * everything else is fair but can be improved"). Three options for him to pick from, each a different take
 * on the map card (GuestCourtsMap.web) and the website's bottom bar (TabBarLooks, web only):
 *
 *   'now'  exactly today's screen and bar.
 *   'a'    Refined: the same parts, craft fixed. A crisp map on top with the words and one 44 button in a
 *          footer under it; the bar the same floating pill, nearly solid, with no colour bleeding through.
 *   'b'    Distilled: fewer parts. A crisp map with only its court pins, then one headline, one line and one
 *          button under it, no box; the bar docked to the bottom edge, solid, one ink for the lit tab.
 *   'c'    Native: an edge-to-edge map with one small chip, and an iPhone Settings-style row under it as the
 *          button; the bar the new capsule (NEW_BAR) with its lens, on calm frosted glass.
 *
 * The iPhone app never reads this: its bar stays "Bar A", and the guest map is the website's alone. Pick one
 * by setting GUEST_COMMUNITY_LOOK and shipping; until then, in a browser, ?gc=a|b|c|now shows one (kept for
 * the visit), so one build can be shot all four ways.
 */
export type GuestCommunityLook = 'now' | 'a' | 'b' | 'c';
export const GUEST_COMMUNITY_LOOK = 'now' as GuestCommunityLook;

const LOOKS: readonly GuestCommunityLook[] = ['now', 'a', 'b', 'c'];
const KEPT = 'courtside-gc';
let chosen: GuestCommunityLook | null = null;

/** The look in use: GUEST_COMMUNITY_LOOK, or in a browser one asked for with ?gc= (kept for the visit). Always 'now' off the web. */
export function guestCommunityLook(): GuestCommunityLook {
  if (chosen) return chosen;
  chosen = GUEST_COMMUNITY_LOOK;
  if (Platform.OS !== 'web') { chosen = 'now'; return chosen; }
  if (typeof window !== 'undefined') {
    try {
      const asked = new URLSearchParams(window.location.search).get('gc') as GuestCommunityLook | null;
      if (asked && LOOKS.includes(asked)) { window.sessionStorage.setItem(KEPT, asked); chosen = asked; }
      else {
        const kept = window.sessionStorage.getItem(KEPT) as GuestCommunityLook | null;
        if (kept && LOOKS.includes(kept)) chosen = kept;
      }
    } catch { /* no storage: the default */ }
  }
  return chosen;
}

/** The website bar's option (null: today's bar). Never anything but null on a phone. */
export function webBarLook(): 'a' | 'b' | 'c' | null {
  if (Platform.OS !== 'web') return null;
  const look = guestCommunityLook();
  return look === 'now' ? null : look;
}
