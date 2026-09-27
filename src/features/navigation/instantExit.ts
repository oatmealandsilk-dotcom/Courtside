import { useSyncExternalStore } from 'react';

/**
 * While on, pages leave the stack with no slide. Used when a tab is tapped
 * from a page pushed on top of a different tab (the map, then Coaching):
 * sliding the page away to the right, like Back, while the tabs glide left
 * underneath reads as going the wrong way. It just goes, and the tabs glide.
 */
let on = false;
const listeners = new Set<() => void>();

export function setInstantExit(next: boolean) {
  if (on === next) return;
  on = next;
  listeners.forEach((fn) => fn());
}

export function useInstantExit(): boolean {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => on,
    () => on,
  );
}
