import React, { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/lib/useReducedMotion';

/**
 * Pops its child in when it first draws (or when `token` changes): from
 * small and a little low, fading up, then still. A plain animated style
 * rather than an entering animation, so it stays put inside a sheet that is
 * moving or scrolling while it plays.
 */
export function Pop({ children, token, delay = 0, duration = 320, from = 0.6, rise = 4, style }: {
  children: React.ReactNode;
  token?: string | number;
  delay?: number;
  duration?: number;
  from?: number;
  rise?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) { p.value = 1; return; }
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
  }, [token, reduced, delay, duration, p]);
  const anim = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: rise * (1 - p.value) }, { scale: from + (1 - from) * p.value }] }));
  return <Reanimated.View style={[style, anim]}>{children}</Reanimated.View>;
}
