import React, { useCallback, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors } from '@/theme';

/**
 * Leaving a sign-in step without a cut: the page settles into the plain
 * ground colour, then the next page arrives with its own entrance. Returns
 * the curtain to render last in the page, and `leave(go)` to call instead of
 * navigating straight away.
 */
export function useLeave() {
  const shade = useSharedValue(0);
  const going = useRef(false);
  const leave = useCallback((go: () => void) => {
    if (going.current) return;
    going.current = true;
    shade.value = withTiming(1, { duration: 220, easing: Easing.in(Easing.quad) }, (done) => { if (done) runOnJS(go)(); });
  }, [shade]);
  const style = useAnimatedStyle(() => ({ opacity: shade.value }));
  const curtain = <Animated.View pointerEvents="none" style={[styles.curtain, { backgroundColor: colors.bg }, style]} />;
  return { leave, curtain };
}

const styles = StyleSheet.create({
  curtain: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 },
});
