import React, { useEffect } from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextStyle } from 'react-native';
import Reanimated, { Easing, cancelAnimation, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/lib/useReducedMotion';
import { countText, type CountPart } from './countFormat';

export type { CountPart } from './countFormat';

const AnimatedInput = Reanimated.createAnimatedComponent(TextInput);

/**
 * A number that counts up from 0 to `value` once `play` is on, then rests:
 * the session's time, its heart rate. On a phone it runs on the UI thread (a
 * read-only text box whose words Reanimated sets each frame), so a busy page
 * never makes it stutter. With Reduce Motion on, it simply shows the number.
 * See CountUp.web for the browser's.
 */
export function CountUp({ value, from = 0, part = 'int', delay = 0, duration = 700, play = true, style, maxFontSizeMultiplier }: {
  value: number;
  /** Where the count starts (0 unless a clock starts at its first hour). */
  from?: number;
  part?: CountPart;
  delay?: number;
  duration?: number;
  /** Off: the final number, still. Turned on: counts up from 0. */
  play?: boolean;
  style?: StyleProp<TextStyle>;
  maxFontSizeMultiplier?: number;
}) {
  const reduced = useReducedMotion();
  const v = useSharedValue(play && !reduced ? from : value);
  useEffect(() => {
    cancelAnimation(v);
    if (!play || reduced) { v.value = value; return; }
    v.value = from;
    v.value = withDelay(delay, withTiming(value, { duration, easing: Easing.out(Easing.cubic) }));
  }, [value, from, play, reduced, delay, duration, v]);
  const animatedProps = useAnimatedProps(() => {
    const text = countText(v.value, part);
    return { text, defaultValue: text } as never;
  });
  return (
    <AnimatedInput
      editable={false}
      underlineColorAndroid="transparent"
      importantForAccessibility="no"
      accessibilityElementsHidden
      pointerEvents="none"
      defaultValue={countText(play && !reduced ? from : value, part)}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      animatedProps={animatedProps}
      style={[styles.input, style]}
    />
  );
}

const styles = StyleSheet.create({
  // A text box drawn as plain words: no padding, no frame.
  input: { padding: 0, margin: 0, borderWidth: 0, fontVariant: ['tabular-nums'] },
});
