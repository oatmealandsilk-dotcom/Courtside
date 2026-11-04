import { startTransition, useEffect, useState } from 'react';

/**
 * Whether a page was opened or closed a moment ago (any router call: push, back, navigate), for the parts that can
 * wait until it has slid in (Nov 4, owner: "EVERY FUCKING THING TAKES WAY TOO LONG TO RESPOND"). The pages opened
 * from anywhere write to the app as they open (a chat or Notifications marked read, a player's posts, a court's
 * answers), and the four tabs underneath redrew for each write (Community alone 60 to 190 ms in the Simulator) while
 * the page slid in, even pages opened from another page (a chat from Messages). A covered tab holds what it shows for
 * this long instead and then catches up as background work (tabFocus's OffScreenLater: taps answering sooner only).
 *
 * Heard from the router's own queue of calls (the one every router call goes through, only listened to here, never
 * changed): the moment a tap asks, before the new page is built.
 */
const SLIDE_MS = 600;

let on = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
let listening = false;

function startListening() {
  if (listening) return;
  listening = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { routingQueue } = require('expo-router/build/global-state/routingQueue') as typeof import('expo-router/build/global-state/routingQueue');
    routingQueue.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        on = false;
        listeners.forEach((fn) => fn());
      }, SLIDE_MS);
      if (on) return;
      on = true;
      listeners.forEach((fn) => fn());
    });
  } catch {
    // A router without that queue: never "just navigated", as before.
  }
}

const subscribe = (fn: () => void) => {
  startListening();
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

/**
 * True from a router call until SLIDE_MS after the last one. Turning on is heard in the tap's own go (before the new
 * page writes anything); turning off redraws as background work, so the catching up never holds a tap up.
 */
export function useJustNavigated(): boolean {
  const [now, setNow] = useState(on);
  useEffect(() => {
    const off = subscribe(() => { if (on) setNow(true); else startTransition(() => setNow(false)); });
    if (on !== now) setNow(on);
    return off;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return now;
}
