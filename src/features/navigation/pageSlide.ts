import { router } from 'expo-router';

import { HOME } from '@/lib/goBack';
import { SWIPE_STOPS, requestSection, shownSection } from '@/features/navigation/swipeOrder';

/**
 * A page turn asked for by code rather than a finger: the tutorial moving
 * the pages along under its tips, so what the player sees is exactly what a
 * swipe does.
 *
 * In a browser the swipe surfaces listen here and play the very slide a
 * released swipe plays (SwipeSurface.web): the tabs' own surface for a move
 * to another tab, Community's section surface for a move inside it. On the
 * phone nothing needs to listen: the tab row (TabsPager) and the section
 * rows (SectionPager) already glide whenever the tab or the section changes,
 * so asking for the section and going to the tab is the slide.
 */

/** One stop on the strip (see SWIPE_STOPS): a tab and, for Community and Profile, its section. */
export interface PageStop { pathname: string; section: string }
export interface PageSlide { direction: 1 | -1; to: PageStop }

/** The tabs' own surface listens on this; a tab's section surface on the tab's address. */
export const TABS_SLIDE = 'tabs';

const surfaces = new Map<string, (slide: PageSlide) => boolean>();
/** A surface says it can play slides; it answers false when it can't right now (mid-swipe, a computer's layout). */
export function listenForSlides(channel: string, fn: (slide: PageSlide) => boolean): () => void {
  surfaces.set(channel, fn);
  return () => { if (surfaces.get(channel) === fn) surfaces.delete(channel); };
}

/** Where a stop sits along the strip, left to right; -1 for a page that is not on it. */
const placeOf = (stop: PageStop) => SWIPE_STOPS.findIndex((s) => s.pathname === stop.pathname && (!s.section || s.section === stop.section));

/** The stop a tab is showing now: the section it last reported, or its first. */
export function stopFor(pathname: string): PageStop {
  const first = SWIPE_STOPS.find((s) => s.pathname === pathname)?.section ?? '';
  return { pathname, section: shownSection(pathname) ?? first };
}

/** Whether the tab page on show is already this stop. */
export function isAtStop(pathname: string, to: PageStop): boolean {
  const at = placeOf(stopFor(pathname));
  return at >= 0 && at === placeOf(to);
}

/**
 * From the tab page on show to another stop, sliding the way a swipe would.
 * Where nothing can slide (the phone, whose pagers glide by themselves; a
 * computer's sidebar layout; a surface mid-swipe) it asks for the section
 * and goes to the tab.
 */
export function slidePagesTo(fromPathname: string, to: PageStop): void {
  const from = stopFor(fromPathname);
  const a = placeOf(from);
  const b = placeOf(to);
  if (b < 0 || a === b) return;
  if (a >= 0) {
    const channel = from.pathname === to.pathname ? to.pathname : TABS_SLIDE;
    if (surfaces.get(channel)?.({ direction: b > a ? 1 : -1, to })) return;
  }
  if (to.section) requestSection(to.pathname, to.section);
  // Home's address is HOME, never '/': that is also the splash screen's (see goBack).
  if (to.pathname !== from.pathname) router.navigate(to.pathname === '/' ? HOME : to.pathname);
}
