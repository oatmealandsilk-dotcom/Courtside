import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, ZoomIn, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors, spacing, typography } from '@/theme';

const ACircle = Animated.createAnimatedComponent(Circle);
const STROKE = 3;

/**
 * The ring that fills while a video is got ready — the way a photo arrives
 * from iCloud. The phone gives no progress for its own converting, so the
 * ring moves the way that work does: quick at first, patient near the end,
 * never standing still, and it closes the moment the video lands.
 */
export function PreparingRing({ label, note, done = false, size = 68 }: { label?: string; note?: string; done?: boolean; /** The ring's width; small enough to stand in for an icon. */ size?: number }) {
  const SIZE = size;
  const R = (SIZE - STROKE) / 2;
  const LAP = 2 * Math.PI * R;
  const styles = useThemedStyles(styleDefinitions);
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(0.92, { duration: 9000, easing: Easing.out(Easing.cubic) });
  }, [progress]);
  useEffect(() => {
    if (done) progress.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) });
  }, [done, progress]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: LAP * (1 - progress.value) }), [LAP]);
  return (
    <Animated.View entering={ZoomIn.duration(220).easing(Easing.out(Easing.back(1.4)))} style={styles.box} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Getting it ready'}>
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.border} strokeWidth={STROKE} fill="none" />
        <ACircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={colors.brand}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${LAP} ${LAP}`}
          animatedProps={ringProps}
          // Starts at the top and fills clockwise, like the phone's own.
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      {label ? (
        <View style={styles.words}>
          <Text style={styles.label}>{label}</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  box: { alignItems: 'center', gap: spacing.md },
  words: { alignItems: 'center', gap: 4 },
  label: { ...typography.bodyStrong, color: colors.text, textAlign: 'center' },
  note: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
});
