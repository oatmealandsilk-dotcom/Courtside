import { Platform } from 'react-native';

/**
 * The Community tab's Find Players map in the iPhone app (Nov 28, owner, of the app previews: "2 is better for map").
 *
 *   'overlay'  The map runs edge to edge from under the search box down to the screen's foot, under the bottom bar, the
 *              way Apple Maps does. On it: one small label top left ("Los Angeles · 7 open hits") and the Up to hit pill
 *              top right; Open to hit (title, "N near you", a small row of faces with I'm free and first names, no
 *              distances) lies along the map's lower part on the map controls' one fixed see-through fill (MapGlass),
 *              just clear of the bar. Below the map the page goes on as before (People you may know, …).
 *   'now'      The map card as it was until Nov 28: a rounded card with the city's name in its middle and the weather,
 *              Open to hit under it.
 *
 * Only this line changes it; going back is setting 'now' and shipping an over-the-air update (no database change, no new
 * native code). The bottom bar is not part of it: everyone keeps today's bar. Never on the website (its Community has
 * its own map, NearbyMap.web and the guest screen): there it is always 'now'. The earlier previews (rounds 1 and 3, with
 * a near-me row or with nothing over the map) are kept on branch design/app-c-preview only.
 */
export type CommunityMapLook = 'overlay' | 'now';
export const COMMUNITY_MAP_LOOK = 'overlay' as CommunityMapLook;

/** The overlay look is on here: the iPhone (and any phone build), never the website. */
export const MAP_OVERLAY = Platform.OS !== 'web' && COMMUNITY_MAP_LOOK === 'overlay';
