import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * A look at the website's Community option C inside the iPhone app (Nov 27, owner, after picking C for the website:
 * "honeslty c is the best for native. and honeslty lets see what that also looks like in the app"). Pictures only:
 * nothing changes in the app until he has seen them and said yes.
 *
 * Round 1 (EXPO_PUBLIC_APP_C_PREVIEW=1): the Community tab's map card edge to edge with one small label on it
 * ("Los Angeles · 3 open hits"), no big city name or weather pill, an iPhone Settings-style near-me row under it, and
 * C's bar look (the rounded capsule with a soft highlight under the lit tab, one ink for the lit tab).
 *
 * Round 2 (Nov 28, owner on round 1: "the map looks better but it needs to stay larger, also the continue thing is wack
 * as hell. maybe bring the open to hit people bar on top of th emap and expand the map even larger. and then make one
 * wher eit sjust the map larger without being overlayed the continue thing is just super ai so id jsut get rid fo it"):
 * both drop the near-me row and keep round 1's label, edge-to-edge map and bar; the map fills the screen down to the bar.
 *   '2' Overlay: the Open to hit row sits on the map's lower part, on the map controls' one see-through fill (MapGlass).
 *   '3' Big map: nothing over the map but its label and Up to hit; Open to hit stays under it.
 *
 * On only in a demo build (no live backend) bundled with EXPO_PUBLIC_APP_C_PREVIEW set, and never on the website, so a
 * store build, an over-the-air update or the website never shows it, even if this branch were merged by mistake.
 */
const ROUND = Platform.OS !== 'web' && !isSupabaseConfigured ? process.env.EXPO_PUBLIC_APP_C_PREVIEW : undefined;
export const APP_C_PREVIEW = ROUND === '1' || ROUND === '2' || ROUND === '3';
/** Round 1 only: the near-me row under the card. */
export const APP_C_NEAR_ROW = ROUND === '1';
/** Rounds 2 and 3: the map as tall as the screen allows, down to the bar. */
export const APP_C_BIG_MAP = ROUND === '2' || ROUND === '3';
/** Round 2: Open to hit on the map. */
export const APP_C_OVERLAY = ROUND === '2';
