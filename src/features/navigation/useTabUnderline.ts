import { useEffect } from 'react';
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * The underline beneath a row of tabs, kept on the animation thread.
 *
 * `progress` is written by the page swipe itself while the finger is down
 * (-1..1, toward the next tab), so the line moves in the very same frame as
 * the page instead of a beat behind it. A tap glides it; a finished swipe has
 * already carried it to the new tab, so it simply lands there.
 */
export function useTabUnderline(index: number, count: number, tabWidth: number) {
  const progress = useSharedValue(0);
  const base = useSharedValue(index);
  useEffect(() => {
    if (Math.abs(progress.value) >= 0.99) {
      base.value = index;
      progress.value = 0;
    } else {
      progress.value = 0;
      base.value = withTiming(index, { duration: 240, easing: Easing.out(Easing.cubic) });
    }
  }, [index, base, progress]);
  const style = useAnimatedStyle(() => {
    const at = Math.max(0, Math.min(count - 1, base.value + progress.value));
    return { transform: [{ translateX: at * tabWidth }] };
  });
  return { progress, style };
}
