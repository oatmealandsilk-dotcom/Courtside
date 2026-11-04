import { makeMutable } from 'react-native-reanimated';

/**
 * When a page (Screen) last moved under a scroll, and whether a finger is on one: written on the animation
 * thread as it scrolls, read now and then by work that would rather wait for a still page (SwipeSurface's
 * warm preview, Nov 3 review: built mid-scroll, it caught a thread's scroll for 40-45 ms).
 */
export const pageScrolledAt = makeMutable(0);
export const pageScrollHeld = makeMutable(false);

/** How long (ms) every page has been still: 0 while a finger is on one (a hold over 8 s, a page gone mid-drag, counts as still). */
export function pagesStillFor(): number {
  const still = Date.now() - pageScrolledAt.value;
  return pageScrollHeld.value && still < 8000 ? 0 : still;
}
