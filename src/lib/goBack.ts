import { router, type Href } from 'expo-router';

/**
 * Home's own address. Not '/': that address is also the splash screen's
 * (app/index.tsx), and going to it from a page opened on top of the tabs
 * replays the logo and then builds a whole second copy of the app on top of
 * the first — two feeds, two sets of video players, and no bottom bar while
 * the logo is up. '/(tabs)' only ever means the tabs that are already there.
 */
export const HOME: Href = '/(tabs)';

/** Just enough of the app's navigation to see which page is on show. */
interface NavState { index?: number; routes?: { name: string; state?: unknown }[] }
interface RootNavigation { isReady: () => boolean; getRootState: () => unknown }
let rootNavigation: RootNavigation | null = null;

/** The shell hands over the app's navigation once it is up (see AppShell), so the helpers below can look at it. */
export function setRootNavigation(navigation: RootNavigation | null) {
  rootNavigation = navigation;
}

/**
 * Whether the tabs themselves are the page on show, with nothing opened over
 * them. Not the same as "nothing to close": a page can sit *under* the tabs
 * — the app opened on a shared link, an invite or a reloaded page, and a
 * tab was reached from there — and then the router says there is something
 * to close even on a tab. Asked to close down to the tabs from the tabs, it
 * sent the request to the tab row, which has no idea how to close anything,
 * and the bar's Feed button did nothing at all (Oct 5, owner: "sometimes I
 * can't tap the feed button").
 */
export function tabsOnShow(): boolean {
  try {
    if (!rootNavigation?.isReady()) return false;
    let state = rootNavigation.getRootState() as NavState | undefined;
    // Down the pages on show, from the outside in, until the tabs or the end.
    for (let depth = 0; state?.routes?.length && depth < 8; depth++) {
      const route = state.routes[state.index ?? state.routes.length - 1];
      if (!route) return false;
      if (route.name === '(tabs)') return true;
      state = route.state as NavState | undefined;
    }
  } catch { /* Not up yet: go by the router alone. */ }
  return false;
}

/**
 * Whether going to a tab means closing pages first: something is open on
 * top of the tabs. On a tab itself the tabs simply move across.
 */
export function mustCloseToReachTabs(): boolean {
  return !tabsOnShow() && router.canDismiss();
}

/**
 * To Home, from anywhere: every page opened on top of the tabs is closed (a
 * Create box, a challenge page, a profile two pages deep), and the tabs move
 * across to Home. Already on a tab, the tabs simply move across.
 */
export function goHome() {
  if (mustCloseToReachTabs()) router.dismissTo(HOME);
  else router.navigate(HOME);
}

/**
 * Back, with somewhere to go. The router's own back does nothing when this
 * page is the first one opened — after a reload, or from a shared link — so
 * a back arrow would sit there dead. This falls through to a sensible page:
 * Home unless the page names another.
 */
export function goBack(fallback: Href = HOME) {
  if (router.canGoBack()) router.back();
  // '/' is the splash screen's address too (see HOME): Home is meant.
  else router.replace(fallback === '/' ? HOME : fallback);
}
