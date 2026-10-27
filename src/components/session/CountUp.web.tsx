import React, { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useReducedMotion } from '@/lib/useReducedMotion';
import { countText, type CountPart, type CountPlay } from './countFormat';

export type { CountPart } from './countFormat';

const outCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * The browser's count-up (see CountUp for the phone's): the same props and
 * the same curve, drawn frame by frame with requestAnimationFrame. With
 * reduced motion asked for, it shows the number straight away.
 */
export function CountUp({ value, from = 0, part = 'int', delay = 0, duration = 700, play = true, style, maxFontSizeMultiplier }: {
  value: number;
  /** Where the count starts (0 unless a clock starts at its first hour). */
  from?: number;
  part?: CountPart;
  delay?: number;
  duration?: number;
  play?: CountPlay;
  style?: StyleProp<TextStyle>;
  maxFontSizeMultiplier?: number;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(play !== false && !reduced ? from : value);
  const frame = useRef<number | null>(null);
  // Counts up once: a number already shown in full never falls back to 0 to count again when `play` comes on (as CountUp).
  const settled = useRef(play === false || reduced);
  useEffect(() => {
    if (play === 'wait' && !reduced) { setShown(settled.current ? value : from); return undefined; }
    if (!play || reduced || settled.current || typeof requestAnimationFrame !== 'function') { settled.current = true; setShown(value); return undefined; }
    settled.current = true;
    setShown(from);
    let start = 0;
    const timer = setTimeout(() => {
      const step = (t: number) => {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / Math.max(1, duration));
        setShown(from + (value - from) * outCubic(p));
        if (p < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    }, delay);
    return () => { clearTimeout(timer); if (frame.current != null) cancelAnimationFrame(frame.current); };
  }, [value, from, play, reduced, delay, duration]);
  return (
    <Text aria-hidden style={[{ fontVariant: ['tabular-nums'] }, style]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {countText(shown, part)}
    </Text>
  );
}
