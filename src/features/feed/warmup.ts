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

/** Whether the curtain has finished fading and is off the screen. Playback waits for this. */
let down = false;
const downListeners = new Set<() => void>();
export function setCurtainDown() {
  if (down) return;
  down = true;
  downListeners.forEach((fn) => fn());
}
const subscribeDown = (fn: () => void) => { downListeners.add(fn); return () => { downListeners.delete(fn); }; };
export function useCurtainDown() {
  return useSyncExternalStore(subscribeDown, () => down, () => down);
}
