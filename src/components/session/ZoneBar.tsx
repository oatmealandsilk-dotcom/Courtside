import type { CountPlay } from './countFormat';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/lib/useReducedMotion';

/**
 * The five zones as one bar, easiest on the left: each segment as long as
 * its share of the session, 2pt apart. It grows in from the left when
 * `play` turns on. `colors` are zoneColors(), easiest first.
 */
export function ZoneBar({ zones, colors, height = 10, play = false, delay = 0, duration = 500, square = false, style }: {
  zones: number[];
  colors: string[];
  height?: number;
  play?: CountPlay;
  delay?: number;
  duration?: number;
  /** Square ends (the foot along a photo's bottom edge). */
  square?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const grow = useSharedValue(play !== false && !reduced ? 0 : 1);
  // Grows once, as the numbers count (CountUp): 'wait' holds it empty until then; shown full, it never empties to grow again.
  const settled = useRef(play === false || reduced);
  useEffect(() => {
    if (play === 'wait' && !reduced) { grow.value = settled.current ? 1 : 0; return; }
    if (!play || reduced || settled.current) { grow.value = 1; settled.current = true; return; }
    settled.current = true;
    grow.value = 0;
    grow.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
  }, [play, reduced, delay, duration, grow]);
  const growStyle = useAnimatedStyle(() => ({ width: `${grow.value * 100}%` }));
  const total = zones.reduce((a, b) => a + b, 0) || 1;
  const r = square ? 0 : height / 2;
  return (
    <View style={[{ height }, style]} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Reanimated.View style={[styles.row, { height }, growStyle]}>
        {zones.map((m, i) => (m > 0 ? (
          <View key={i} style={{ flexGrow: m / total, flexBasis: 0, height, borderRadius: r, backgroundColor: colors[i] }} />
        ) : null))}
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2, overflow: 'hidden' },
});
