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
  // Off, the number in full; 'wait', its starting point; on, it counts from there (as CountUp).
  useEffect(() => {
    if (!play || reduced || typeof requestAnimationFrame !== 'function') { setShown(value); return undefined; }
    setShown(from);
    if (play === 'wait') return undefined;
    // Timed from the moment it was turned on (plus its delay), as the phone's is, so its first frame is
    // already on its way rather than a frame spent standing at the start.
    const begin = performance.now() + delay;
    const step = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - begin) / Math.max(1, duration)));
      setShown(from + (value - from) * outCubic(p));
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => { frame.current = requestAnimationFrame(step); }, delay);
    return () => { clearTimeout(timer); if (frame.current != null) cancelAnimationFrame(frame.current); };
  }, [value, from, play, reduced, delay, duration]);
  return (
    <Text aria-hidden style={[{ fontVariant: ['tabular-nums'] }, style]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {countText(shown, part)}
    </Text>
  );
}
