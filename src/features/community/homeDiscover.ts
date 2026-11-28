import { useSyncExternalStore } from 'react';

import { SIM_DRIVER } from '@/lib/simDriver';
import { HOME_FEED } from './communityMapLook';

/*
 * PICTURES ONLY (Nov 28, owner: "show abc etc"; branch design/home-discover). Community as ONE page (no "Find Players |
 * Discussions" row: the map, Open to hit under it, then the friends' activity) in three takes, and the bottom bar's
 * second tab as Discover ("Posts | Discussions"). A demo-only switch, bundled with EXPO_PUBLIC_HOME_DISCOVER:
 *
 *   'a'  Peek     the map as tall as it can be while the first activity's name and the top of its photo show above the bar.
 *   'b'  Sheet    the map fills the page; a solid panel with a grab handle rests above the bar (Open to hit and the first
 *                 activity's header); dragged up it is the whole activity feed over the map, dragged down it rests again.
 *   'c'  Heading  the taller map, Open to hit under it, and just above the bar a plain "Friends' activity" heading.
 *
 * Groups (owner: "maybe take out groups for now"): not in Discover's row. If they stay, the quiet place for them is a
 * "Your groups" row at the top of Posts (one line of small group faces, Instagram's story row), shown only to someone
 * in a group, or a Groups row under Profile; nothing built for it here.
 *
 * Before any of this ships (the design pass leaves them, pictures only):
 *  - DiscoverTab is a second full Discuss (the map's and players' work runs twice): split Discover into its own page.
 *  - Community's section is forced to 'players' here, so every ask for Community's Discussions now lands wrong and
 *    must go to Discover → Discussions: openTopic.ts, PostCard (topic label), TabsPager (section asks on swipes),
 *    app/saved.tsx ("Browse Community"), app/question/[id].tsx (swipe back; done for the picture), the website's
 *    (tabs)/_layout.web.tsx asks. "Posted — tap to see it" (scrollToTop) and the Feed's own '/' asks now reach
 *    Discover: route them to the new post's place.
 *  - Friends' photo posts that are not sessions now show only in Discover, mixed with everyone's: rankFeed lifts people
 *    you follow (+6, +3 when they follow back), keep it that way there.
 *  - Clips in Discover's feed show their cover; Instagram plays the clip on screen, muted. Not built (the demo's clips
 *    are drawn court cards, so a picture could not show it): one muted player for the card most on screen.
 *
 * Off (unset, the default) the app is exactly feat/home-map-feed's. The iPhone only (HOME_FEED), never the website.
 * In a simulator build (SIM_DRIVER) "homelook v=a|b|c" switches between the three without a new bundle.
 */
export type HomeDiscoverLook = 'a' | 'b' | 'c';

const asked = process.env.EXPO_PUBLIC_HOME_DISCOVER;
const START: HomeDiscoverLook | null = HOME_FEED && (asked === 'a' || asked === 'b' || asked === 'c') ? asked : null;

/** The Discover tab in place of the Feed (any of the three takes). Fixed for the build. */
export const DISCOVER_ON = START !== null;

let look = START;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const read = () => look;

/** Which take Community shows (null: the switch is off). */
export function useHomeDiscover(): HomeDiscoverLook | null {
  return useSyncExternalStore(subscribe, read, read);
}

/** The simulator's proof only: another take, without a new bundle. */
export function setHomeDiscover(next: string | undefined) {
  if (!SIM_DRIVER || !DISCOVER_ON) return;
  if (next !== 'a' && next !== 'b' && next !== 'c') return;
  if (next === look) return;
  look = next;
  listeners.forEach((fn) => fn());
}
