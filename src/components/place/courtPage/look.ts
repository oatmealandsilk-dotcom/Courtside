import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Which court page to show.
 *
 *   'final' (Oct 25, owner: "Court page still needs work. Completely
 *           optimize court page. Open hits should probaly show up before
 *           posts and activities there"): option A of Oct 24 ("Place card",
 *           the review's pick) made whole. A heart by the name, the facts in
 *           one line ("1 court · ● Hard · Lights · Public"), right now as one
 *           row, Start a session here, Play here with two small squares
 *           (Directions, Share); then the open hits, the clips, King of the
 *           Court, what players say, every empty one a single line.
 *   'now'   the page before it (Oct 10's place card), kept one switch away.
 */
export type CourtPageLook = 'now' | 'final';

export const COURT_PAGE = 'final' as CourtPageLook;

const LOOKS: readonly CourtPageLook[] = ['now', 'final'];

/**
 * The look in use: COURT_PAGE, except on the demo website (no database),
 * where a picture run may set `window.__courtPage` to show the other one
 * without a rebuild. The app on a phone, and the live website, only ever
 * read COURT_PAGE.
 */
export function courtPageLook(): CourtPageLook {
  if (Platform.OS === 'web' && !supabase && typeof window !== 'undefined') {
    const asked = (window as unknown as { __courtPage?: unknown }).__courtPage;
    if (typeof asked === 'string' && (LOOKS as readonly string[]).includes(asked)) return asked as CourtPageLook;
  }
  return COURT_PAGE;
}
