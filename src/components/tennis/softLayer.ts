import React, { useEffect, useState } from 'react';
import type { TextProps, ViewProps } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

/*
 * How the sign-up's live card (PlayerCard's 'setup' variant, ONBOARDING_V2) lets a word change, ease-out,
 * nothing bouncy. A word swapped for another goes one after the other, never on top of each other: the old one
 * is gone in OUT_MS, the new one waits SWAP_HOLD_MS and rises 3pt into place, done at SWAP_MS (round 4 review:
 * the two drawn together at once read as a double exposure, "Austin" printed over "Your town").
 *
 * On a phone each layer's opacity is a shared value that starts where the layer starts (0 coming in, 1 going),
 * set on its very first frame by the render itself, then eased on the animation thread: nothing waits on an
 * entering animation to begin, so a frame-late start can never blink the old word off or flash the new one.
 * A browser has its own twin, softLayer.web.ts (plain CSS animations); a change here wants the same change there.
 */

export const SOFT_MS = 220;
/** A swap: the old word's way out. */
const OUT_MS = 95;
/** A swap: when the new word starts, once the old one is all but gone. */
export const SWAP_HOLD_MS = 80;
/** A swap: when the new word is in place. */
export const SWAP_MS = 260;
const RISE_MS = SWAP_MS - SWAP_HOLD_MS;
const EASE = Easing.out(Easing.cubic);

/** How a new word comes in: after the old one goes, rising 3pt as it fades in; only fading in (letters typed after the old ones); or growing a touch (the avatar's disc taking a new colour). */
export type InWay = 'rise' | 'fade' | 'grow';
/** How an old one goes: quickly, before the new one rises (a swap); or over the whole change (letters taken away). */
export type OutWay = 'quick' | 'fade';

function useComing(way: InWay | null) {
  // The way it came in with, kept for its whole life (the swap clears `way` once it is in).
  const [w] = useState(way);
  const p = useSharedValue(w ? 0 : 1);
  useEffect(() => {
    if (w === 'rise') p.value = withDelay(SWAP_HOLD_MS, withTiming(1, { duration: RISE_MS, easing: EASE }));
    else if (w) p.value = withTiming(1, { duration: SOFT_MS, easing: EASE });
  }, [w, p]);
  return useAnimatedStyle(() => {
    if (w === 'rise') return { opacity: p.value, transform: [{ translateY: 3 * (1 - p.value) }] };
    if (w === 'grow') return { opacity: p.value, transform: [{ scale: 0.92 + 0.08 * p.value }] };
    return { opacity: p.value };
  });
}

/** A word coming in (`way`), or at rest (null). */
export function InText({ way, style, ...rest }: TextProps & { way: InWay | null }) {
  const a = useComing(way);
  return React.createElement(Reanimated.Text, { ...rest, style: [style, a] });
}

/** Something coming in whole (the avatar's disc), or at rest (null). */
export function InView({ way, style, ...rest }: ViewProps & { way: InWay | null }) {
  const a = useComing(way);
  return React.createElement(Reanimated.View, { ...rest, style: [style, a] });
}

/** An old word on its way out, drawn fully shown on its first frame. */
export function OutText({ way, style, ...rest }: TextProps & { way: OutWay }) {
  // The way it went as it mounted, kept for its whole (short) life.
  const [w] = useState(way);
  const p = useSharedValue(1);
  useEffect(() => {
    p.value = withTiming(0, { duration: w === 'quick' ? OUT_MS : SOFT_MS, easing: EASE });
  }, [w, p]);
  const a = useAnimatedStyle(() => ({ opacity: p.value }));
  return React.createElement(Reanimated.Text, { ...rest, style: [style, a] });
}
