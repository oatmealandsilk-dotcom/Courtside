import { isPublicPath } from '@/features/share/publicPaths';

/**
 * Where a guest (signed out, on the website: guest mode, Oct 17) may go,
 * and for anywhere else what to say they need an account for. The four tabs,
 * a thread, a clip's comments, a coach's page and every page a shared link
 * opens (publicPaths) are for reading; anything that makes, changes, sends
 * or shows people (a profile beyond its name, the map, chats, alerts,
 * search) asks "Join CourtSide to …" instead (see AppShell).
 */
const OPEN = new Set([
  '/', '/index', '/discuss', '/coaches', '/profile',
  // Not '/account' (found in review, Oct 17): with no account it is an empty Account center, so it asks to join.
  '/sign-in', '/onboarding', '/birthday', '/comments',
  '/about', '/help', '/guidelines', '/privacy',
]);

const ASK: [RegExp, string][] = [
  [/^\/(compose|edit-post|log-session|auto-log-ask|pick-session|start-session|new-session|live-session|share-session|share-card|health-share|pick-court|pick-location|pick-group|session-tag)$/, 'post'],
  [/^\/(ask|ask-coach)$/, 'ask a question'],
  [/^\/hit-request\/new$/, 'post a hit'],
  [/^\/(messages|share)(\/|$)/, 'message players'],
  [/^\/notifications$/, 'see your notifications'],
  [/^\/search$/, 'search players and threads'],
  [/^\/(map|flyby|open-to-hit|map-visibility|court-now|court-report)$/, 'see courts and open hits'],
  [/^\/(likes|who-played|follows)$/, 'see who liked and played'],
  [/^\/session-stats$/, 'see session stats'],
  [/^\/user\//, 'see player profiles'],
  [/^\/(ai-coach|coach-question|coach-request)(\/|$)/, 'ask a coach'],
  [/^\/(find-groups|groups|group-form|group-invite)$/, 'join groups'],
  [/^\/post-menu$/, 'save or report this'],
];

/**
 * Null when a guest may open this page; otherwise what to ask them to join
 * for. `landed`: this is the page they arrived on (a shared link to a
 * profile still opens its public card, as it always has).
 */
export function guestAskFor(pathname: string, landed: boolean): string | null {
  if (OPEN.has(pathname)) return null;
  if (/^\/question\/[^/]+\/?$/.test(pathname) || /^\/coach\/[^/]+\/?$/.test(pathname)) return null;
  if (landed && isPublicPath(pathname)) return null;
  for (const [re, what] of ASK) if (re.test(pathname)) return what;
  // A shared link's page reached from inside (a post, a court, an open hit): its public card.
  if (isPublicPath(pathname)) return null;
  return 'see this';
}
