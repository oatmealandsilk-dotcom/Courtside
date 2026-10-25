import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { compactNumber } from '@/lib/format';
import { useReducedMotion } from '@/lib/useReducedMotion';

/*
 * RailCount in a browser: the same count and the same roll as RailCount.tsx
 * (a number only where there is one, never a word or a 0; going up the new
 * number comes in from below and the old one leaves over the top, going down
 * the reverse, ROLL_MS, clipped to its line), done as plain CSS animations.
 *
 * Why not the phone's entering and exiting animations: in a browser,
 * Reanimated 4.5 runs a timed clean-up a second after any custom entering
 * animation (5 x its length) that pins the element with position: absolute
 * where it was measured as the roll ended. The count's line then folded to
 * nothing and clipped the number away, about a second after every like or save
 * (Oct 25 review). CSS has no clean-up: the new number is in its starting place
 * from its first frame, the old one stays in React just for the roll and is
 * then removed, and at rest the number is ordinary text in its line.
 */

const ROLL_MS = 200;
/** How far a number travels in or out: nearly the line's height, so it leaves the clipped line as it fades. */
const TRAVEL = 14;
/** Easing.out(Easing.cubic), as the phone's roll. */
const ROLL_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';

type Way = 'up' | 'down';

/** A CSS animation for react-native-web (it compiles animationKeyframes into @keyframes); not a type React Native knows. */
const roll = (from: { opacity: number; y: number }, to: { opacity: number; y: number }, fill: 'backwards' | 'forwards') => ({
  animationKeyframes: [{
    '0%': { opacity: from.opacity, transform: [{ translateY: from.y }] },
    '100%': { opacity: to.opacity, transform: [{ translateY: to.y }] },
  }],
  animationDuration: `${ROLL_MS}ms`,
  animationTimingFunction: ROLL_EASE,
  animationFillMode: fill,
}) as unknown as TextStyle;

type Shown = { text: string; value: number; n: number; came: Way | null; gone: { text: string; way: Way; n: number } | null };

export function RailCount({ value, style, maxFontSizeMultiplier }: { value: number; style?: StyleProp<TextStyle>; maxFontSizeMultiplier?: number }) {
  const still = useReducedMotion();
  const text = value > 0 ? compactNumber(value) : '';
  const [shown, setShown] = useState<Shown>({ text, value, n: 0, came: null, gone: null });
  // A new number: swapped in during this same draw (React redraws before anything reaches the screen),
  // the old one kept for its way out. Nothing rolls with Reduce Motion, or for a blank line.
  if (text !== shown.text) {
    const way: Way = value >= shown.value ? 'up' : 'down';
    setShown({
      text,
      value,
      n: shown.n + 1,
      came: still || !text ? null : way,
      gone: still || !shown.text ? null : { text: shown.text, way, n: shown.n },
    });
  }
  // Once the roll is over the old number goes (it holds its last frame, out of sight, until then) and
  // the new one drops its animation, so it is plain text at rest: a page shown again after being hidden
  // (display: none) would otherwise play the roll a second time.
  const { gone, n } = shown;
  const rolling = shown.came !== null || gone !== null;
  useEffect(() => {
    if (!rolling) return;
    const t = setTimeout(() => setShown((s) => (s.n === n ? { ...s, came: null, gone: null } : s)), ROLL_MS + 40);
    return () => clearTimeout(t);
  }, [rolling, n]);
  return (
    <View style={styles.line}>
      {/* In the line, so it sizes it as plain text does (a blank line at 0 holds the place); keyed so each new number rolls afresh. */}
      <Text key={`n${shown.n}`} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[style, styles.center, shown.came ? IN[shown.came] : null]}>
        {shown.text || ' '}
      </Text>
      {gone ? (
        <Text key={`g${gone.n}`} aria-hidden maxFontSizeMultiplier={maxFontSizeMultiplier} style={[style, styles.center, styles.gone, OUT[gone.way]]}>
          {gone.text}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The whole button's width (so an outgoing "10" is never cut at the sides by a narrower "9"), one line tall, clipped.
  line: { alignSelf: 'stretch', minWidth: 44, alignItems: 'center', overflow: 'hidden' },
  center: { textAlign: 'center' },
  // The old number on its way out, over the line rather than in it.
  gone: { position: 'absolute', top: 0, left: 0, right: 0 },
});

/** Up: in from below, out over the top. Down: the reverse. Created once, so the browser gets each as one class. */
const IN = StyleSheet.create({
  up: roll({ opacity: 0, y: TRAVEL }, { opacity: 1, y: 0 }, 'backwards'),
  down: roll({ opacity: 0, y: -TRAVEL }, { opacity: 1, y: 0 }, 'backwards'),
});
const OUT = StyleSheet.create({
  up: roll({ opacity: 1, y: 0 }, { opacity: 0, y: -TRAVEL }, 'forwards'),
  down: roll({ opacity: 1, y: 0 }, { opacity: 0, y: TRAVEL }, 'forwards'),
});
