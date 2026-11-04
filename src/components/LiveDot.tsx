import React, { useEffect, useState } from 'react';
import { Animated as RNAnimated, Easing as RNEasing, StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useLoopsRun } from '@/lib/loopShown';

import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';
import { reduceMotionEnabled } from '@/lib/useReducedMotion';
import { useNativeLoop } from '@/lib/nativeLoop';
import { useTapFast } from '@/features/navigation/pressV2';

const RING_MS = 1800;
const RING_EASE_NATIVE = RNEasing.out(RNEasing.cubic);

/**
 * A small green dot with a ring that leaves it every couple of seconds — the
 * waitlist scoreboard's "in play" mark, for anything still waiting on a
 * person. Still for anyone who has asked for less motion.
 */
export function LiveDot({ size = 8, color }: { size?: number; color?: string }) {
  useTheme();
  const ink = color ?? colors.brand;
  const ring = useSharedValue(0);
  // Out of sight, it rests and starts again from the beginning when back (see useLoopsRun).
  const runs = useLoopsRun();
  // Taps answering sooner (admins first): the ring runs on React Native's native driver (lib/nativeLoop), which moves
  // it without redrawing the app every frame. The same curve, timing, reach and fade; still under Reduce Motion.
  const native = useTapFast();
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    if (!runs) { cancelAnimation(ring); ring.value = 0; setMoving(false); return undefined; }
    let live = true;
    reduceMotionEnabled().then((reduced) => {
      if (!live || reduced) return;
      if (native) { setMoving(true); return; }
      ring.value = withRepeat(withTiming(1, { duration: RING_MS, easing: Easing.out(Easing.cubic) }), -1, false);
    }).catch(() => {});
    return () => { live = false; cancelAnimation(ring); ring.value = 0; setMoving(false); };
  }, [ring, runs, native]);
  const nativeRing = useNativeLoop(native && moving, RING_MS, RING_EASE_NATIVE);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + ring.value * 1.8 }], opacity: 0.55 * (1 - ring.value) }));
  return (
    <View style={{ width: size, height: size }}>
      {native ? (
        <RNAnimated.View
          style={[StyleSheet.absoluteFill, {
            borderRadius: size / 2, backgroundColor: ink,
            opacity: nativeRing.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [{ scale: nativeRing.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] }) }],
          }]}
        />
      ) : <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: ink }, ringStyle]} />}
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: ink }]} />
    </View>
  );
}
