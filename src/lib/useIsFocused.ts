import { useIsFocused as useRouteFocused } from 'expo-router';
import { useTabActive } from '@/features/navigation/tabFocus';

/**
 * Whether this screen is the one on top.
 *
 * Replaces @react-navigation/native's hook of the same name. That package was
 * never a dependency of this project — it came along under expo-router, and
 * expo-router dropped it in SDK 57 when it moved to a different navigation
 * core. expo-router now carries its own copy, built on that core.
 *
 * It asks the router at the very first render rather than assuming "on top"
 * until told otherwise: a screen that opens already covered (the feed under
 * a page opened from a notification at launch) knows it from the start, so a
 * clip on it never starts behind the page you are looking at.
 */
export function useIsFocused(): boolean {
  const focused = useRouteFocused();
  // Inside the tab row, a tab that has slid off screen is not focused either.
  // Both are called unconditionally — a hook behind `&&` gets skipped
  // whenever the left side is false, which shifts every hook after it.
  const tabActive = useTabActive();
  return focused && tabActive;
}
