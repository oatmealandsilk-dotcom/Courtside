import { useSyncExternalStore } from 'react';

import { BAR_METRICS, nativeBarTop } from './tabBarLook';

/**
 * Which bottom bar NavBar draws on a phone right now (Nov 28): today's quiet pill (most people), the new bar (tabBarLook's
 * NEW_BAR), or Apple's own (A, components/NativeBar; admins first: barLens's useBarApple). Said by NavBar itself as it
 * draws one, so whatever sits over or runs under the bar reads the bar that is really there.
 */
export type PhoneBar = 'quiet' | 'new' | 'apple';

let drawn: PhoneBar = 'quiet';
const listeners = new Set<() => void>();
const read = () => drawn;
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** NavBar: this is the bar on the screen now. */
export function setPhoneBar(bar: PhoneBar) {
  if (bar === drawn) return;
  drawn = bar;
  listeners.forEach((fn) => fn());
}

/** The bar NavBar draws on a phone ('quiet' until it has drawn one). */
export function usePhoneBar(): PhoneBar {
  return useSyncExternalStore(subscribe, read, read);
}

/** The same, read once (for code that is not drawing: the Feed's windows as they open). */
export function phoneBarNow(): PhoneBar {
  return drawn;
}

/**
 * How high above the screen's bottom edge whatever sits over the bar keeps clear of it (a page's last row, the live
 * session's bar, the Feed's windows), from the phone's bottom strip (`insetBottom`, 0 with no home bar): today's quiet
 * pill's top, as always, or Apple's bar's where that stands higher. Apple's bar is the phone's own size: 83 points on
 * every iPhone, so on one without a home bar (an SE) its top is 15 points above the quiet pill's; with a home bar it is
 * 7 below it, and nothing changes.
 */
export function barClearTop(bar: PhoneBar, insetBottom: number): number {
  const today = Math.max(insetBottom, 12) + BAR_METRICS.height;
  return bar === 'apple' ? Math.max(today, nativeBarTop(insetBottom)) : today;
}
