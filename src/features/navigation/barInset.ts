import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResponsive } from '@/lib/useResponsive';
import { barClearTop, usePhoneBar } from './phoneBar';
import { BAR_METRICS } from './tabBarLook';

/** The floating tab bar: a pill this tall, this far above the bottom edge (each look's own: tabBarLook). */
export const TAB_BAR_H = BAR_METRICS.height;
export const TAB_BAR_GAP = BAR_METRICS.gap;
/**
 * What a page keeps clear at the bottom on a phone, near enough for styles
 * that cannot ask: the pill, its gap, and a home-indicator inset (an
 * iPhone's 34). Android's navigation bar is its own height (48 with three
 * buttons, about 24 with gestures), read once from the phone as the app opens.
 */
const BOTTOM_STRIP = Platform.OS === 'android' ? Math.max(initialWindowMetrics?.insets.bottom ?? 48, 12) : 34;
export const BAR_OVERLAY_PX = TAB_BAR_H + TAB_BAR_GAP + BOTTOM_STRIP;

/**
 * How much more of the bottom the live session's bar takes while it is on
 * show above the tab bar (src/components/session/LiveBar): its height and
 * its gap, 0 without it. The bar says so itself as it comes and goes, so a
 * page's last row, a clip's words and the map's cards rise clear of it.
 */
let liveBarSpace = 0;
const liveListeners = new Set<() => void>();
const subscribeLive = (fn: () => void) => { liveListeners.add(fn); return () => { liveListeners.delete(fn); }; };
const readLive = () => liveBarSpace;
export function setLiveBarSpace(points: number) {
  if (points === liveBarSpace) return;
  liveBarSpace = points;
  liveListeners.forEach((fn) => fn());
}

/** The live session's bar's room over the tab bar (its height and gap), 0 without it. */
export function useLiveBarSpace(): number {
  return useSyncExternalStore(subscribeLive, readLive, readLive);
}

/**
 * How much of the bottom the floating bar covers on this device, with the live session's bar over it — nothing on a
 * computer, where the sidebar is the bar. The bar's top is phoneBar's barClearTop: today's bar's, or Apple's own where
 * that stands higher (an iPhone SE).
 */
export function useBarInset(): number {
  const { isPhone } = useResponsive();
  const insets = useSafeAreaInsets();
  const live = useLiveBarSpace();
  const bar = usePhoneBar();
  return isPhone ? barClearTop(bar, insets.bottom) + TAB_BAR_GAP + live : 0;
}
