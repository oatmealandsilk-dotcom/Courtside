import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * Where you are in Start a group: three dots, the one you are on drawn out
 * into a short green bar, the ones done in green, the ones ahead quiet. The
 * bar slides between them (still, with Reduce Motion).
 */

const DOT = 7;
const BAR = 22;

function Dot({ state }: { state: 'done' | 'now' | 'ahead' }) {
  const styles = useThemedStyles(styleDefinitions);
  const width = useSharedValue(state === 'now' ? BAR : DOT);
  useEffect(() => {
    width.value = withTiming(state === 'now' ? BAR : DOT, { duration: 240, reduceMotion: ReduceMotion.System });
  }, [state, width]);
  const style = useAnimatedStyle(() => ({ width: width.value }));
  return <Animated.View style={[styles.dot, state === 'ahead' && styles.ahead, style]} />;
}

export function StepDots({ step, count = 3 }: { step: number; count?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step + 1} of ${count}`}
      accessibilityValue={{ min: 1, max: count, now: step + 1 }}
    >
      {Array.from({ length: count }, (_, i) => <Dot key={i} state={i < step ? 'done' : i === step ? 'now' : 'ahead'} />)}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 20 },
  dot: { height: DOT, borderRadius: radius.pill, backgroundColor: colors.brand },
  ahead: { backgroundColor: colors.borderStrong },
});
