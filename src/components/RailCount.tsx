import React, { useLayoutEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Reanimated, { Easing, Keyframe } from 'react-native-reanimated';

import { compactNumber } from '@/lib/format';
import { useReducedMotion } from '@/lib/useReducedMotion';

/*
 * A count under a rail button, Instagram's way (Oct 24, owner: "Prolly how it
 * is now"): a number only where there is one, never a word or a 0.
 *
 * When it changes it rolls, like a counter's drum: going up, the old number
 * slides up and out of its line while the new one comes up from below; going
 * down, the other way. Both move together over ROLL_MS, clipped to the line, so
 * it reads as one quick turn rather than a fade. The line is always held (a
 * blank one at 0), so a first count arriving or the last one going moves
 * nothing else on the rail. The figures are tabular (the rail's label style),
 * so "9" to "10" does not shift sideways either.
 *
 * A browser has its own twin, RailCount.web.tsx (the same roll in CSS: these
 * Keyframes break there); a change here wants the same change there.
 *
 * Done with entering and exiting animations on the animation thread: the new
 * number is drawn in its starting place from its very first frame (no flash of
 * it at rest first), and at rest both are plain text, nothing animated left
 * holding a value.
 */

const ROLL_MS = 200;
/** How far a number travels in or out: nearly the line's height, so it leaves the clipped line as it fades. */
const TRAVEL = 14;
const ROLL_EASE = Easing.out(Easing.cubic);

const rollIn = (from: number) => new Keyframe({
  0: { opacity: 0, transform: [{ translateY: from }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: ROLL_EASE },
}).duration(ROLL_MS);
const rollOut = (to: number) => new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: to }], easing: ROLL_EASE },
}).duration(ROLL_MS);

/** Up: in from below, out over the top. Down: the reverse. */
const IN = { up: rollIn(TRAVEL), down: rollIn(-TRAVEL) };
const OUT = { up: rollOut(-TRAVEL), down: rollOut(TRAVEL) };

type Way = 'up' | 'down';

export function RailCount({ value, style, maxFontSizeMultiplier }: { value: number; style?: StyleProp<TextStyle>; maxFontSizeMultiplier?: number }) {
  const still = useReducedMotion();
  const text = value > 0 ? compactNumber(value) : '';
  // What is on show, and which way it came in (none: it was there from the start, or Reduce Motion).
  const [shown, setShown] = useState<{ text: string; value: number; came: Way | null }>({ text, value, came: null });
  const changing = text !== shown.text;
  const way: Way = value >= shown.value ? 'up' : 'down';
  // A change is drawn in two passes before the screen updates: this one gives the old number its
  // way out (an exiting animation is read from the last props it was drawn with), the next swaps in
  // the new one with its way in.
  useLayoutEffect(() => {
    if (changing) setShown({ text, value, came: still ? null : way });
  }, [changing, text, value, way, still]);
  return (
    <View style={styles.line}>
      {shown.text ? (
        <Reanimated.Text
          key={shown.text}
          entering={shown.came ? IN[shown.came] : undefined}
          exiting={changing && !still ? OUT[way] : undefined}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          style={[style, styles.center]}
        >
          {shown.text}
        </Reanimated.Text>
      ) : (
        // No count: a blank line holds the place (never a 0).
        <Reanimated.Text key="" maxFontSizeMultiplier={maxFontSizeMultiplier} style={[style, styles.center]}> </Reanimated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // The whole button's width (so an outgoing "10" is never cut at the sides by a narrower "9"), one line tall, clipped.
  line: { alignSelf: 'stretch', minWidth: 44, alignItems: 'center', overflow: 'hidden' },
  center: { textAlign: 'center' },
});
