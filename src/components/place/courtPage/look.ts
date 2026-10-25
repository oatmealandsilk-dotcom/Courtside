import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Which court page to show (Oct 24, owner, about Wakefield Middle School's
 * page: "Not only does this page look AI it also seems so out of place
 * follow should I have the same significance as playing here so they
 * shouldn't be like the same size ... The bottom of the page is super not
 * well organized. And also too many words").
 *
 *   'now'  today's page, exactly as it was.
 *   'A'    "Place card": the facts in one line under the name, a heart
 *          beside it, right now as one row, Start a session, then Play here
 *          with two small squares (Directions, Share); every empty section
 *          is one line.
 *   'B'    "Two big, rest quiet": the heart and Share ride over the map,
 *          Directions is a word in the town line, Start a session and Play
 *          here sit side by side (unequal), and the rest is one list.
 *   'C'    "Court sheet": a heart and Share beside the name, how it is right
 *          now as one coloured line, Start a session the one filled button,
 *          Play here at the top of Open hits, and every fact in one
 *          "About this court" list at the foot.
 *
 * Every feature stays in each: Start a session, right now, Directions,
 * Follow, Play here, Post, Share, See on map, the clips, the open hits,
 * King of the Court, what players say and Add what you know, the map credit.
 * Nothing ships until he picks one.
 */
export type CourtPageLook = 'now' | 'A' | 'B' | 'C';

export const COURT_PAGE = 'now' as CourtPageLook;

const LOOKS: readonly CourtPageLook[] = ['now', 'A', 'B', 'C'];

/**
 * The look in use: COURT_PAGE, except on the demo website (no database),
 * where a picture run may set `window.__courtPage` to try each one without
 * a rebuild. The app on a phone, and the live website, only ever read
 * COURT_PAGE.
 */
export function courtPageLook(): CourtPageLook {
  if (Platform.OS === 'web' && !supabase && typeof window !== 'undefined') {
    const asked = (window as unknown as { __courtPage?: unknown }).__courtPage;
    if (typeof asked === 'string' && (LOOKS as readonly string[]).includes(asked)) return asked as CourtPageLook;
  }
  return COURT_PAGE;
}
