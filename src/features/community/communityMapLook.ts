import { Platform } from 'react-native';

/**
 * The Community tab's Find Players map in the iPhone app (Nov 28, owner, of the app previews: "2 is better for map").
 *
 *   'overlay'  The map runs edge to edge from under the search box down to the screen's foot, under the bottom bar, the
 *              way Apple Maps does. On it: one small label top left ("Los Angeles · 7 open hits") and the Up to hit pill
 *              top right; Open to hit (title, "N near you", a small row of faces with I'm free and first names, no
 *              distances) lies along the map's lower part on the map controls' one fixed see-through fill (MapGlass),
 *              just clear of the bar. Below the map the page goes on as before (People you may know, …).
 *              "You're at <court>? Light it up" comes on Open to hit's panel, above its title; while "You're early" /
 *              "Bring your friends" is up, the map keeps the card's height and stops above the bar, so that card and
 *              its button show under it without scrolling.
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

/**
 * The iPhone app's first page, Community → Find Players (Nov 28, owner, of the pictures: "make it map then activity").
 *
 *   'map-feed'  One continuous scroll: the search box, the map ('overlay''s edge-to-edge map with its label and Up to hit;
 *               at least the card's own height, taller on a bigger phone: "The map should still be large though"), then
 *               Open to hit as the page's first row, right under the map on the page's own ground ("Under the map is
 *               fine"; never over the map: Apple 5.1.2(i), "The map never shows a stranger's face or name"; the line
 *               beside its title carries the town, "5 free in Los Angeles", faces with first names only), then the
 *               friends' activity: Activities' gallery + "friends played" (the same posts and rules as the Feed's
 *               Activities), its first item peeking above the bar as far as the map leaves room. Between its items, the page's other parts as occasional rows: People
 *               you may know after the 2nd, Open hits after the 5th, courts after the 9th, the city board after the
 *               13th, Near you after the 17th, New on CourtSide after the 21st (each only with something to show; those
 *               past the feed's end once no more pages come). The Feed tab's own Activities stays as it is.
 *   'map'       Find Players as 'overlay' alone (Nov 28's map 2): the tall map to the screen's foot with Open to hit
 *               laid over its lower part, the page's sections under it as before. (Open to hit is then over the map
 *               again, which the note to Apple above rules out for strangers: the safe way back is COMMUNITY_MAP_LOOK
 *               'now'.)
 *
 * Only this line changes it; going back is an over-the-air update (no database change, no new native code). Never on
 * the website (MAP_OVERLAY is the phone's only): there Find Players is exactly as before.
 */
export type HomeLook = 'map-feed' | 'map';
export const HOME_LOOK = 'map-feed' as HomeLook;

/** The map, then the activity, here: the iPhone (and any phone build) with the overlay map, never the website. */
export const HOME_FEED = MAP_OVERLAY && HOME_LOOK === 'map-feed';
