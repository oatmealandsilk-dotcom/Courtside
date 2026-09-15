export const SWIPE_STOPS = [
  { pathname: '/', section: '' },
  { pathname: '/discuss', section: 'discussions' },
  { pathname: '/discuss', section: 'players' },
  { pathname: '/coaches', section: '' },
  { pathname: '/profile', section: 'Posts' },
  { pathname: '/profile', section: 'Clips' },
  { pathname: '/profile', section: 'Tagged' },
] as const;
export function swipeDestination(pathname: string, section: string | undefined, direction: 1 | -1) {
  const index = SWIPE_STOPS.findIndex(stop => stop.pathname === pathname && (!stop.section || stop.section === (section ?? (pathname === '/discuss' ? 'discussions' : 'Posts'))));
  if (index < 0) return undefined;
  return SWIPE_STOPS[index + direction];
}
export function horizontalSwipe(dx: number, dy: number) {
  return Math.abs(dx) >= 65 && Math.abs(dx) > Math.abs(dy) * 1.6;
}

/**
 * Which section each tab is showing right now, reported by the tab itself.
 * The shell around the tabs cannot see their route params reliably mid-swipe,
 * and guessing from the swipe direction sent people to the wrong page.
 */
const shown = new Map<string, string>();
export const reportSection = (pathname: string, section: string) => { shown.set(pathname, section); };
export const shownSection = (pathname: string) => shown.get(pathname);

/**
 * Asks a tab to show a particular section before it slides into view — so a
 * swipe back from Coaching lands on Find Players, the way the strips line up.
 */
const requestListeners = new Map<string, Set<(section: string) => void>>();
export const requestSection = (pathname: string, section: string) => {
  requestListeners.get(pathname)?.forEach((fn) => fn(section));
};
export const subscribeSectionRequest = (pathname: string, fn: (section: string) => void) => {
  const set = requestListeners.get(pathname) ?? new Set();
  set.add(fn);
  requestListeners.set(pathname, set);
  return () => { set.delete(fn); };
};
