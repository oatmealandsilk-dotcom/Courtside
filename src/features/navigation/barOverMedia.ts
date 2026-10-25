import { useSyncExternalStore } from 'react';

/**
 * Whether the Feed has a picture (a clip, an Instant) filling the screen
 * right now, as its own top row reads it. The quiet pill (tabBarLook)
 * turns dark over it the way today's glass does, so its icons stay readable.
 */
let onPicture = false;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const read = () => onPicture;

export function setFeedOnPicture(next: boolean) {
  if (next === onPicture) return;
  onPicture = next;
  listeners.forEach((fn) => fn());
}

export function useFeedOnPicture(): boolean {
  return useSyncExternalStore(subscribe, read, read);
}
