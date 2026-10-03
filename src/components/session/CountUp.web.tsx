import React, { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useReducedMotion } from '@/lib/useReducedMotion';
import { countText, type CountPart } from './countFormat';

export type { CountPart } from './countFormat';

const outCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * The browser's count-up (see CountUp for the phone's): the same props and
 * the same curve, drawn frame by frame with requestAnimationFrame. With
 * reduced motion asked for, it shows the number straight away.
 */
export function CountUp({ value, part = 'int', delay = 0, duration = 700, play = true, style, maxFontSizeMultiplier }: {
  value: number;
  part?: CountPart;
  delay?: number;
  duration?: number;
  play?: boolean;
  style?: StyleProp<TextStyle>;
  maxFontSizeMultiplier?: number;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(play && !reduced ? 0 : value);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    if (!play || reduced || typeof requestAnimationFrame !== 'function') { setShown(value); return undefined; }
    setShown(0);
    let start = 0;
    const timer = setTimeout(() => {
      const step = (t: number) => {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / Math.max(1, duration));
        setShown(value * outCubic(p));
        if (p < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    }, delay);
    return () => { clearTimeout(timer); if (frame.current != null) cancelAnimationFrame(frame.current); };
  }, [value, play, reduced, delay, duration]);
  return (
    <Text aria-hidden style={[{ fontVariant: ['tabular-nums'] }, style]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {countText(shown, part)}
    </Text>
  );
}
