import { Platform } from 'react-native';
import { router, type Href } from 'expo-router';

import { HOME } from '@/lib/goBack';
import { setInstantExit } from '@/features/navigation/instantExit';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { askedSection, requestSection } from '@/features/navigation/swipeOrder';

/** The four tabs' own addresses. */
export type TabPath = '/' | '/discuss' | '/coaches' | '/profile';

/**
 * Where the app opens: Community, on Find Players (the map). Every "you're
 * in, now open the app" moment — the splash, the end of sign-up, switching
 * account, the tutorial's replay — comes through here, so the start page is
 * these two lines and nowhere else.
 *
 * Home (goHome, HOME) still means the feed: whatever goes to the feed on
 * purpose, like landing on your own post after sharing it, still goes there.
 */
export const START_TAB: TabPath = '/discuss';
/** The section of the start tab it opens on. Community reads this for its first section too. */
export const START_SECTION = 'players';

/**
 * Whether a fresh open lands on the feed. The splash curtain (see warmup and
 * WarmCurtain) is up from the start then and waits for the feed's first
 * pages; opening anywhere else, the splash puts it up as it hands over and it
 * waits only for the start page to draw. The feed then shows its own loading
 * pages when you first get to it.
 */
// Read as any tab, not the one written above, so this still compiles the day the start changes.
export const OPENS_ON_FEED: boolean = (START_TAB as TabPath) === '/';

/** The start tab as an address. Home's is HOME, never '/': that is also the splash screen's. */
export const START_HREF: Href = OPENS_ON_FEED ? HOME : START_TAB;

/** Whether this address is the start tab ('/index' is another spelling of Home's). */
export function isStartTab(pathname: string): boolean {
  return pathname === START_TAB || (OPENS_ON_FEED && pathname === '/index');
}

/** Whether this address is one of the four tabs' own, not a page opened on top of them. */
export function isTabPage(pathname: string): boolean {
  return ['/', '/index', '/discuss', '/coaches', '/profile'].includes(pathname);
}

/**
 * Community opens on Find Players (the map), from the top, whenever the bar
 * takes you there from somewhere else: another tab, or a page opened on top.
 * Only a swipe from the Feed lands on Discussions, the page next door,
 * because that is where the finger went (TabsPager, the tabs' web layout).
 *
 * A section asked for just before that the tab has not taken yet (a topic
 * chip, a thread's back swipe, "Find players" on an empty list) is left
 * alone: that ask was the reason for going there.
 */
export function askForCommunityMap() {
  if (askedSection('/discuss') === undefined) requestSection('/discuss', 'players');
  requestScrollToTop('/discuss', true);
}

/**
 * To the start page, from anywhere, the way goHome goes to the feed: every
 * page opened on top of the tabs closes, and the tabs move across to
 * Community with Find Players showing. The section is asked for first, so
 * it is already in place when the tab slides into view.
 */
export function goToStart() {
  requestSection(START_TAB, START_SECTION);
  if (router.canDismiss()) router.dismissTo(START_HREF);
  else router.navigate(START_HREF);
}

/**
 * To one of the four tabs from anywhere, after asking it for a section (a
 * topic chip, a thread's back swipe, "Find players" on an empty list): every
 * page on top closes and the tabs move across, the way goHome goes to the
 * feed. Pushing a tab's address from a page on top built a second copy of
 * the tabs over the first, and the copy underneath had already taken the
 * section asked for, so the threads asked for opened on the map.
 *
 * `instant`: the page on top just goes, with no Back slide (on the phone),
 * because a swipe has already slid the tab into view.
 */
export function goToTab(pathname: TabPath, instant = false) {
  const href: Href = pathname === '/' ? HOME : pathname;
  if (!router.canDismiss()) { router.navigate(href); return; }
  if (!instant || Platform.OS === 'web') { router.dismissTo(href); return; }
  setInstantExit(true);
  // One frame for the stack to take the "no slide" setting before the page is dismissed (as the bar does).
  requestAnimationFrame(() => requestAnimationFrame(() => {
    router.dismissTo(href);
    setTimeout(() => setInstantExit(false), 450);
  }));
}

/**
 * Into the app on its start page, in place of the page you are on: the end
 * of setup, where there is nothing underneath to go back to.
 */
export function replaceWithStart() {
  requestSection(START_TAB, START_SECTION);
  router.replace(START_HREF);
}
