import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

let trigger: ((go: () => void) => void) | null = null;

/**
 * Logging out, switching or adding an account without a cut: the whole app
 * settles into the page colour, the change happens behind it, and the
 * curtain lifts onto the sign-in page. Without the curtain mounted it just goes.
 */
export function leaveGently(go: () => void) {
  if (trigger) trigger(go);
  else go();
}

/** Rendered once, above everything, by the root layout. */
export function SignOutCurtainHost() {
  useTheme();
  const shade = useSharedValue(0);
  const busy = useRef(false);
  useEffect(() => {
    const release = () => { busy.current = false; };
    const run = (go: () => void) => {
      go();
      // A moment for the next page to draw under the curtain, then it lifts.
      setTimeout(() => {
        shade.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) }, () => runOnJS(release)());
      }, 260);
    };
    trigger = (go) => {
      if (busy.current) return;
      busy.current = true;
      shade.value = withTiming(1, { duration: 240, easing: Easing.in(Easing.quad) }, (done) => { if (done) runOnJS(run)(go); });
    };
    return () => { trigger = null; };
  }, [shade]);
  const style = useAnimatedStyle(() => ({ opacity: shade.value }));
  return <Animated.View pointerEvents="none" style={[styles.curtain, { backgroundColor: colors.bg }, style]} />;
}

const styles = StyleSheet.create({
  curtain: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 9999 },
});
