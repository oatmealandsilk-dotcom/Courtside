import React, { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/lib/useReducedMotion';

const CURVE = Easing.bezier(0.4, 0, 0.2, 1);
/** How long a row takes to fold shut; remove the item from the list after this. */
export const FOLD_AWAY_MS = 220;

/**
 * A row on its way out of a list (Oct 22 sweep): it fades and folds its height
 * to nothing, so the rows below glide up into its place instead of jumping.
 * Until `gone` it is a plain box at its own height, with nothing animated, so
 * a long list draws exactly as before. The page takes the row out of its data
 * once FOLD_AWAY_MS has passed.
 */
export function FoldAway({ gone, children }: { gone: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const height = useSharedValue(-1);
  const progress = useSharedValue(1);
  useEffect(() => {
    if (gone) progress.value = withTiming(0, { duration: FOLD_AWAY_MS, easing: CURVE });
  }, [gone, progress]);
  const style = useAnimatedStyle(() => {
    if (progress.value >= 1 || height.value < 0) return {};
    return reduce
      ? { opacity: progress.value }
      : { height: height.value * progress.value, opacity: progress.value, overflow: 'hidden' as const };
  });
  return (
    <Animated.View
      pointerEvents={gone ? 'none' : 'auto'}
      onLayout={(e) => { if (!gone) height.value = e.nativeEvent.layout.height; }}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
