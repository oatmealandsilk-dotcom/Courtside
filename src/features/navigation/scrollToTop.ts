/**
 * "Tap the tab you are already on": the bar announces it here and whatever
 * scroller belongs to that tab glides back to the top. Keyed by the tab's
 * address so only that tab's page moves.
 */
type Listener = (pathname: string) => void;
const listeners = new Set<Listener>();

export function requestScrollToTop(pathname: string) {
  listeners.forEach((fn) => fn(pathname));
}

export function subscribeScrollToTop(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The tab a screen's memory key belongs to, so the screen knows when it is the one being asked. */
export const TAB_FOR_KEY: Record<string, string> = { discuss: '/discuss', coaches: '/coaches', profile: '/profile', home: '/' };

/**
 * "Posted — tap to see it": the strip asks the feed to bring a fresh post of
 * yours to the top. The feed deals itself again with that post first and
 * opens on it, the way Instagram lands you on the home feed after sharing,
 * instead of sliding a separate page in from the side.
 */
type RevealListener = (postId: string) => void;
const revealListeners = new Set<RevealListener>();

export function revealPost(postId: string) {
  revealListeners.forEach((fn) => fn(postId));
}

export function subscribeReveal(fn: RevealListener) {
  revealListeners.add(fn);
  return () => { revealListeners.delete(fn); };
}
