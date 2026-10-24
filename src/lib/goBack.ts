import { router, type Href } from 'expo-router';
import { catchUpNow, noteOwnBack, setCatchUpNav } from '@/theme/catchUp';

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
interface RootNavigation { isReady: () => boolean; getRootState: () => unknown; addListener?: (type: 'state', callback: () => void) => () => void }
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
 * The see-through sheets: pages that open over the one you were on and leave
 * it showing underneath (the `transparentModal` screens in app/_layout.tsx,
 * keep the two lists together), plus Likes, which hides the bottom bar over
 * the Feed the way those sheets do.
 */
const SEE_THROUGH = new Set([
  'compose', 'ask', 'comments', 'session-stats', 'who-played', 'health-share', 'post-menu', 'invite', 'log-session',
  'session-tag', 'court-report', 'court-now', 'start-session', 'new-session', 'live-session', 'flyby', 'map-visibility',
  'open-to-hit', 'tennis-sheet', 'review-request', 'hit-request/new', 'edit-post', 'share', 'pick-group', 'find-groups',
  'group-form', 'group-invite', 'pick-court', 'pick-session', 'ask-coach', 'messages/new', 'likes',
]);

/** Whether the page on top is a see-through sheet (see SEE_THROUGH): the page under it is still the one you are on. */
export function sheetOnTop(): boolean {
  try {
    if (!rootNavigation?.isReady()) return false;
    let state = rootNavigation.getRootState() as NavState | undefined;
    for (let depth = 0; state?.routes?.length && depth < 8; depth++) {
      const route = state.routes[state.index ?? state.routes.length - 1];
      if (!route) return false;
      if (SEE_THROUGH.has(route.name)) return true;
      if (route.name === '(tabs)') return false;
      state = route.state as NavState | undefined;
    }
  } catch { /* Not up yet. */ }
  return false;
}

/** Calls `onChange` after each change of page, once the screens have redrawn for it; returns the way to stop. */
export function onPageChange(onChange: () => void): () => void {
  return rootNavigation?.addListener?.('state', onChange) ?? (() => undefined);
}

/** Whether the page on show (down the pages on top, from the outside in) is the one named. */
function pageOnShow(name: string): boolean {
  try {
    if (!rootNavigation?.isReady()) return false;
    let state = rootNavigation.getRootState() as NavState | undefined;
    for (let depth = 0; state?.routes?.length && depth < 8; depth++) {
      const route = state.routes[state.index ?? state.routes.length - 1];
      if (!route) return false;
      if (route.name === name) return true;
      state = route.state as NavState | undefined;
    }
  } catch { /* Not up yet. */ }
  return false;
}

/** The tab the tabs are on ('/discuss', '/', '/coaches', '/profile'), whatever is open over them; null if unknown. */
function currentTab(): string | null {
  try {
    if (!rootNavigation?.isReady()) return null;
    // The tabs' route, wherever it sits (the root's own route holds the stack of pages).
    const find = (state: NavState | undefined, depth: number): NavState | undefined => {
      if (!state?.routes || depth > 8) return undefined;
      for (const route of state.routes) {
        if (route.name === '(tabs)') return route.state as NavState | undefined;
        const inner = find(route.state as NavState | undefined, depth + 1);
        if (inner) return inner;
      }
      return undefined;
    };
    const tabs = find(rootNavigation.getRootState() as NavState | undefined, 0);
    const route = tabs?.routes?.[tabs.index ?? 0];
    if (!route) return null;
    return route.name === 'index' ? '/' : `/${route.name}`;
  } catch { return null; }
}

// The theme's catch-up (src/theme/catchUp.ts) asks which tab is on and when the tabs come back into view.
setCatchUpNav({ currentTab, tabsOnShow, pageOnShow, onPageChange });

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
  // A theme just picked: Home and the tab now on show are on it as they show (catchUp).
  catchUpNow(['active', '/']);
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
  // A theme just picked: the tab this may uncover is on it as it shows (catchUp), from the Theme page
  // too, since Profile is under it (Oct 24: Theme lives in Profile's ☰). A tab already caught up costs nothing.
  noteOwnBack();
  if (!router.canGoBack()) catchUpNow('all');
  else catchUpNow('active');
  if (router.canGoBack()) router.back();
  // '/' is the splash screen's address too (see HOME): Home is meant.
  else router.replace(fallback === '/' ? HOME : fallback);
}
