import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/lib/useReducedMotion';

/**
 * A tick that draws itself in, left to right, the way a pen would: the short
 * stroke first, then the long one. Used where something has just been done
 * ("Just log it", the "Logged" note). With Reduce Motion it is simply there.
 * The same on a phone and in a browser: a reveal of the tick, not an SVG
 * stroke animation, which a browser's build does not run the same way.
 */
export function DrawnTick({ size, color, delay = 0, duration = 280, token = 0 }: {
  size: number;
  color: string;
  delay?: number;
  duration?: number;
  /** Change it to draw the tick again. */
  token?: number;
}) {
  const reduced = useReducedMotion();
  const draw = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) { draw.value = 1; return; }
    draw.value = 0;
    draw.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
  }, [reduced, delay, duration, token, draw]);
  const reveal = useAnimatedStyle(() => ({ width: size * draw.value }));
  return (
    <View style={{ width: size, height: size }}>
      <Reanimated.View style={[styles.clip, { height: size }, reveal]}>
        <Ionicons name="checkmark" size={size} color={color} />
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
