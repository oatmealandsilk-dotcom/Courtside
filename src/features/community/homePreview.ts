import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * A picture of the first page as the map, then the friends' activity feed right under it (Nov 28, owner: "I want to see
 * map then activity under so map, and then basically Strava/ hevy style feed"; then "Or just do gallery+ friends no need
 * for Strava hevt"). Pictures only: nothing changes in the app until he has seen them and said yes.
 *
 * Community → Find Players becomes one continuous scroll:
 *  1. the search field and the map as in the app preview of option C, round 2 (one small label, Up to hit, the Open to
 *     hit row on the map's foot), but shorter, so the top of the first activity shows just above the bar;
 *  2. under it, the Activities feed in the look he picked for it ('gallery-rollup': the gallery and the "friends played"
 *     row), continuous and infinite, with the gallery's own behaviour;
 *  3. what sat under the map before goes into that feed as occasional rows (People you may know is its follow block).
 * The Discussions tab, the Feed tab and the bar (Bar A) stay exactly as they are.
 *
 * '1' = Gallery + friends played. On only in a demo build (no live backend) bundled with EXPO_PUBLIC_HOME_PREVIEW set,
 * and never on the website, so a store build, an over-the-air update or the website never shows it, even if this branch
 * were merged by mistake.
 */
const LOOK = Platform.OS !== 'web' && !isSupabaseConfigured ? process.env.EXPO_PUBLIC_HOME_PREVIEW : undefined;
export const HOME_MAP_FEED = LOOK === '1' || LOOK === '2' || LOOK === '3';
/**
 * '2' = '1' with Open to hit UNDER the map, not on it (Nov 28, for Apple: we told Apple the map never shows a stranger's
 * face or name). The map ends above the strip; the strip is the page's first row, on the page's own solid ground with a
 * hairline between, and a stranger free today in town shows their town under their first name (friends as on '1').
 * The map gives up the strip's height so the first activity still peeks above the bar.
 */
export const HOME_STRIP_UNDER = LOOK === '2';
/**
 * '3' = Open to hit under the map with the map kept big (Nov 28, owner: "The map should still be large though"): the
 * map is exactly as tall as on '1' (never under the card's 406, taller on taller phones), Open to hit right under it on
 * the page's own ground with a hairline between, compact: the town in the header line for everyone ("5 free in Los
 * Angeles"), then faces and first names only, a touch smaller so the row is one tidy line. The first activity peeks
 * as much as is left above the bar; the map's size wins.
 */
export const HOME_UNDER_BIG_MAP = LOOK === '3';
/** The feed's look under the map: the one he picked for Activities (Nov 28, "Gallaty+ friends played"). */
export const HOME_FEED_LOOK = 'gallery-rollup' as const;
