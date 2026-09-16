import { useSyncExternalStore } from 'react';

/**
 * Whether the feed has its first pages ready. The app shell keeps the splash
 * curtain up until this says yes, across the route change from the splash
 * screen into the tabs — one curtain, never swapped, so nothing can flicker.
 */
let warm = false;
const listeners = new Set<() => void>();

export function setFeedWarm(value: boolean) {
  if (warm === value) return;
  warm = value;
  listeners.forEach((fn) => fn());
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function useFeedWarm() {
  return useSyncExternalStore(subscribe, () => warm, () => warm);
}
