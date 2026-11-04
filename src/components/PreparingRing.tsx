import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, ZoomIn, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors, spacing, typography } from '@/theme';

const ACircle = Animated.createAnimatedComponent(Circle);
const STROKE = 3;

/**
 * The ring shown while a video is got ready. The phone gives no progress
 * for its own converting, so the ring does not pretend to: a short arc
 * turns steadily, the way the phone's own spinner does, and closes into a
 * full circle the moment the video lands.
 */
export function PreparingRing({ label, note, done = false, size = 68 }: { label?: string; note?: string; done?: boolean; /** The ring's width; small enough to stand in for an icon. */ size?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const SIZE = size;
  const R = (SIZE - STROKE) / 2;
  const LAP = 2 * Math.PI * R;
  const turn = useSharedValue(0);
  const arc = useSharedValue(0.28);
  useEffect(() => {
    turn.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
  }, [turn]);
  useEffect(() => {
    if (done) arc.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
  }, [done, arc]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: LAP * (1 - arc.value) }), [LAP]);
  return (
    <Animated.View entering={ZoomIn.duration(220).easing(Easing.out(Easing.back(1.4)))} style={styles.box} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Getting it ready'}>
      <Animated.View style={spin}>
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
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
      </Animated.View>
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
