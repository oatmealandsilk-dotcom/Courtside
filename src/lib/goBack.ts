import { router, type Href } from 'expo-router';

/**
 * Back, with somewhere to go. The router's own back does nothing when this
 * page is the first one opened — after a reload, or from a shared link — so
 * a back arrow would sit there dead. This falls through to a sensible page.
 */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
