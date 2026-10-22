import React, { useEffect, useState } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { isCurtainDown, useCurtainReady } from '@/features/feed/warmup';
import { useReducedMotion } from '@/lib/useReducedMotion';

/**
 * The start page's sections arriving as the opening curtain lifts (Oct 21,
 * owner: "make it absolute peak", and "don't make designs too bold"): each
 * one rises 7 points and fades in on its own, a beat after the one above
 * it, the whole of it done in 250 ms. Only on the very first showing of the
 * app: a section built later (coming back to the tab, data arriving after
 * the lift) is simply there. With Reduce Motion on, a plain fade.
 *
 * It is only ever put round a section's own content: never round the map
 * (its frame is there at once, and a web view a phone cannot see may stop
 * drawing), and never round anything glass (it goes see-through, Oct 17).
 */
const STEP_MS = 30;
const LAST_STEP = 3;
const RISE_MS = 160;
const RISE = 7;

/** Whether the first showing has played: from then on every section is simply there. */
let played = false;

export function FirstReveal({ order, children }: { order: number; children: React.ReactNode }) {
  // Decided once, when the section is built: hidden only under a curtain that has not gone yet.
  const [hold] = useState(() => !played && !isCurtainDown());
  const lifting = useCurtainReady();
  const still = useReducedMotion();
  const shown = useSharedValue(hold ? 0 : 1);
  useEffect(() => {
    if (!hold || !lifting) return;
    played = true;
    shown.value = withDelay(Math.min(order, LAST_STEP) * STEP_MS, withTiming(1, { duration: RISE_MS, easing: Easing.out(Easing.cubic) }));
  }, [hold, lifting, order, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: still ? 0 : (1 - shown.value) * RISE }] }));
  if (!hold) return <>{children}</>;
  return <Animated.View style={style}>{children}</Animated.View>;
}
