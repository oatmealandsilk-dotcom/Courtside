import { useSyncExternalStore } from 'react';

/**
 * Whether the person is a guest (signed out on the website: guest mode,
 * Oct 17), on its own. The app's store (AppContext) sets it whenever that
 * changes, and the few small things that only need this one yes or no (the
 * like and save buttons, see useOptimisticToggle) read it from here, so they
 * redraw only when it flips, not on every change anywhere in the app (found
 * in review, Oct 17). Always false in the iPhone app.
 */
let guest = false;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function setGuestStatus(next: boolean) {
  if (next === guest) return;
  guest = next;
  listeners.forEach((fn) => fn());
}

export function useIsGuest(): boolean {
  return useSyncExternalStore(subscribe, () => guest, () => guest);
}
