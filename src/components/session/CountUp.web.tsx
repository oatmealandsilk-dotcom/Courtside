import React, { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useReducedMotion } from '@/lib/useReducedMotion';
import { countText, type CountPart, type CountPlay } from './countFormat';

export type { CountPart, CountPlay } from './countFormat';

const outCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * The browser's count-up (see CountUp for the phone's): the same props and
 * the same curve, drawn frame by frame with requestAnimationFrame. With
 * reduced motion asked for, it shows the number straight away.
 */
export function CountUp({ value, from = 0, resume = false, part = 'int', delay = 0, duration = 700, play = true, style, maxFontSizeMultiplier }: {
  value: number;
  /** Where the count starts (0 unless a clock starts at its first hour). */
  from?: number;
  /** A new value after the first counts on from the number on show, not from `from` (see CountUp). */
  resume?: boolean;
  part?: CountPart;
  delay?: number;
  duration?: number;
  play?: CountPlay;
  style?: StyleProp<TextStyle>;
  maxFontSizeMultiplier?: number;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(play && !reduced ? from : value);
  const frame = useRef<number | null>(null);
  // The number on show, for a count that carries on from it (`resume`).
  const onShow = useRef(shown);
  onShow.current = shown;
  const shownOnce = useRef(false);
  useEffect(() => {
    // Waiting: held at the start, still (with Reduce Motion, the number itself).
    if (play === 'wait' && !reduced) { setShown(from); return undefined; }
    const onward = resume && shownOnce.current;
    shownOnce.current = true;
    if (!play || reduced || typeof requestAnimationFrame !== 'function') { setShown(value); return undefined; }
    const start0 = onward ? onShow.current : from;
    setShown(start0);
    let start = 0;
    const timer = setTimeout(() => {
      const step = (t: number) => {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / Math.max(1, duration));
        setShown(start0 + (value - start0) * outCubic(p));
        if (p < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    }, delay);
    return () => { clearTimeout(timer); if (frame.current != null) cancelAnimationFrame(frame.current); };
  }, [value, from, resume, play, reduced, delay, duration]);
  return (
    <Text aria-hidden style={[{ fontVariant: ['tabular-nums'] }, style]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {countText(shown, part)}
    </Text>
  );
}
