import { useSyncExternalStore } from 'react';

/**
 * Every page a sideways swipe stops at, left to right: Community's two
 * sections (Find Players, where the app opens, then Discussions), Home,
 * Coaching, and Profile's three. The phone's TabsPager and the bar follow
 * the same order.
 */
export const SWIPE_STOPS = [
  { pathname: '/discuss', section: 'players' },
  { pathname: '/discuss', section: 'discussions' },
  { pathname: '/', section: '' },
  { pathname: '/coaches', section: '' },
  { pathname: '/profile', section: 'Posts' },
  { pathname: '/profile', section: 'Clips' },
  { pathname: '/profile', section: 'Tagged' },
] as const;
export function swipeDestination(pathname: string, section: string | undefined, direction: 1 | -1) {
  // A tab that has not said which section it shows is on its first one: Find Players, or Posts.
  const index = SWIPE_STOPS.findIndex(stop => stop.pathname === pathname && (!stop.section || stop.section === (section ?? (pathname === '/discuss' ? 'players' : 'Posts'))));
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
const shownListeners = new Set<() => void>();
let telling = false;
export const reportSection = (pathname: string, section: string) => {
  if (shown.get(pathname) === section) return;
  shown.set(pathname, section);
  // Reported while the tab draws, so whoever is watching (the tutorial) is
  // told just after that draw, never in the middle of it.
  if (telling) return;
  telling = true;
  void Promise.resolve().then(() => { telling = false; shownListeners.forEach((fn) => fn()); });
};
export const shownSection = (pathname: string) => shown.get(pathname);
const subscribeShown = (fn: () => void) => { shownListeners.add(fn); return () => { shownListeners.delete(fn); }; };
/** The same, for a screen that redraws when it changes (the tutorial waits for Find Players). */
export function useShownSection(pathname: string): string | undefined {
  return useSyncExternalStore(subscribeShown, () => shown.get(pathname), () => shown.get(pathname));
}

/**
 * Asks a tab to show a particular section before it slides into view — so a
 * swipe from Home lands on Discussions, the section next to it, the way the
 * strips line up.
 *
 * The ask is also kept until the tab itself takes it. A tab that is not
 * built yet (a thread opened from a link, or a browser tab not visited this
 * visit) hears nothing, and would otherwise open on its first section: for
 * Community, the map, when the ask was for the threads. It is kept even when
 * someone is listening, since in a browser the only listener mid-swipe is
 * often the picture of the tab sliding in, not the tab.
 */
const requestListeners = new Map<string, Set<(section: string) => void>>();
const asked = new Map<string, string>();
export const requestSection = (pathname: string, section: string) => {
  asked.set(pathname, section);
  requestListeners.get(pathname)?.forEach((fn) => fn(section));
};
/** The last section asked of this tab that it has not taken yet: read as the tab is built. */
export const askedSection = (pathname: string) => asked.get(pathname);
/** Taken: the tab has it, so it can never come back after the tab is rebuilt. */
export const takeAskedSection = (pathname: string) => {
  const section = asked.get(pathname);
  asked.delete(pathname);
  return section;
};
export const subscribeSectionRequest = (pathname: string, fn: (section: string) => void) => {
  const set = requestListeners.get(pathname) ?? new Set();
  set.add(fn);
  requestListeners.set(pathname, set);
  return () => { set.delete(fn); };
};
