import { useEffect, useSyncExternalStore } from 'react';

/**
 * Things opened over a tab that the tutorial must not start underneath: a
 * post's menu, a photo or video opened full screen, an "are you sure?". A
 * page pushed on top already holds it (it is not a tab); these don't change
 * the address, so each says so here while it is up. The tutorial waits until
 * every one has gone, then starts as usual.
 *
 * Kept apart from tourStore, with nothing imported, so the small helpers
 * that ask questions (lib/confirm) can use it without pulling in the router.
 */
let holds = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Holds the tutorial back until the returned function is called (once; a second call does nothing). */
export function holdTour(): () => void {
  holds += 1;
  emit();
  let gone = false;
  return () => {
    if (gone) return;
    gone = true;
    holds = Math.max(0, holds - 1);
    emit();
  };
}

/** Whether anything is holding the tutorial back right now. */
export function useTourHeld(): boolean {
  return useSyncExternalStore(subscribe, () => holds > 0, () => holds > 0);
}

/** Holds the tutorial back for as long as `on` is true, and lets go if the component goes. */
export function useHoldTour(on: boolean): void {
  useEffect(() => (on ? holdTour() : undefined), [on]);
}
