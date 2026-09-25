import React, { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/**
 * A small green dot with a ring that leaves it every couple of seconds — the
 * waitlist scoreboard's "in play" mark, for anything still waiting on a
 * person. Still for anyone who has asked for less motion.
 */
export function LiveDot({ size = 8, color }: { size?: number; color?: string }) {
  useTheme();
  const ink = color ?? colors.brand;
  const ring = useSharedValue(0);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!live || reduced) return;
      ring.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic) }), -1, false);
    }).catch(() => {});
    return () => { live = false; };
  }, [ring]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + ring.value * 1.8 }], opacity: 0.55 * (1 - ring.value) }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: ink }, ringStyle]} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: ink }]} />
    </View>
  );
}
