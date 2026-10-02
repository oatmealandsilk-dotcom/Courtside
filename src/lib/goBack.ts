import { router, type Href } from 'expo-router';

/**
 * Home's own address. Not '/': that address is also the splash screen's
 * (app/index.tsx), and going to it from a page opened on top of the tabs
 * replays the logo and then builds a whole second copy of the app on top of
 * the first — two feeds, two sets of video players, and no bottom bar while
 * the logo is up. '/(tabs)' only ever means the tabs that are already there.
 */
export const HOME: Href = '/(tabs)';

/**
 * To Home, from anywhere: every page opened on top of the tabs is closed (a
 * Create box, a challenge page, a profile two pages deep), and the tabs move
 * across to Home. Already on a tab, the tabs simply move across.
 */
export function goHome() {
  if (router.canDismiss()) router.dismissTo(HOME);
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
