import { Platform } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResponsive } from '@/lib/useResponsive';

/** The floating tab bar: a pill this tall, this far above the bottom edge. */
export const TAB_BAR_H = 62;
export const TAB_BAR_GAP = 10;
/**
 * What a page keeps clear at the bottom on a phone, near enough for styles
 * that cannot ask: the pill, its gap, and a home-indicator inset (an
 * iPhone's 34). Android's navigation bar is its own height (48 with three
 * buttons, about 24 with gestures), read once from the phone as the app opens.
 */
const BOTTOM_STRIP = Platform.OS === 'android' ? Math.max(initialWindowMetrics?.insets.bottom ?? 48, 12) : 34;
export const BAR_OVERLAY_PX = TAB_BAR_H + TAB_BAR_GAP + BOTTOM_STRIP;

/** How much of the bottom the floating bar covers on this device — nothing on a computer, where the sidebar is the bar. */
export function useBarInset(): number {
  const { isPhone } = useResponsive();
  const insets = useSafeAreaInsets();
  return isPhone ? TAB_BAR_H + TAB_BAR_GAP + Math.max(insets.bottom, 12) : 0;
}
