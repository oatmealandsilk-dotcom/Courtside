import { createContext, useContext, useSyncExternalStore } from 'react';

/**
 * The clip you swipe away from stops the moment the swipe is decided (the
 * finger lifts having gone far or fast enough), not once the next page has
 * finished landing (Oct 25, owner: "The old video I scrolled past still playes
 * a hair too long, it waits until the screen fully lands"). That is how Reels
 * and TikTok feel. The next clip still starts as it lands, and a swipe that
 * springs back never stops the clip it started on.
 *
 * Everything else about the page on screen still changes on landing (the
 * Feed's `active`: what is fetched ahead, what counts as seen, the tips, the
 * comments stage), so this is kept apart from it. The pager (VerticalPager)
 * says which page a decided swipe is leaving; the players drawn on that page
 * (ClipVideo, ClipPlayback.web) hear it and stop, without the Feed drawing
 * anything again while the feed glides.
 *
 * Held by the page's key rather than its place, so a feed dealt again
 * mid-swipe never stops the wrong page. The pager lets go of it once it has
 * landed and the Feed has drawn the new page on screen as the active one.
 */
export interface PageLeaving {
  /** The key of the page a decided swipe is leaving, or null. */
  get: () => string | null;
  set: (key: string | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function makePageLeaving(): PageLeaving {
  let key: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => key,
    set: (next) => {
      if (next === key) return;
      key = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** Given by a VerticalPager to everything inside it. */
export const PageLeavingContext = createContext<PageLeaving | null>(null);
/** The key of the pager page something is drawn on (VerticalPager's own key for it); null outside a pager. */
export const PageKeyContext = createContext<string | null>(null);

const nothingToHear = () => () => undefined;

/** True while a decided swipe is leaving the page this is drawn on. Always false outside a pager. */
export function usePageLeaving(): boolean {
  const store = useContext(PageLeavingContext);
  const key = useContext(PageKeyContext);
  return useSyncExternalStore(
    store ? store.subscribe : nothingToHear,
    () => !!store && key !== null && store.get() === key,
    () => false,
  );
}
