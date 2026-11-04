import React, { useState } from 'react';
import { Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';

import { loadInOn } from '@/features/navigation/loadIn';
import { useArriveGate } from './arriveGate';

export { useArriveGate, useArrivals } from './arriveGate';

/*
 * Arrive in a browser: the same arrivals as the phone's Arrive.tsx (only what turns up after a
 * page is on show, decided once when it is built), done as plain CSS animations. Not the phone's
 * entering animations: in a browser, Reanimated 4.5 pins an element with a custom entering
 * animation in place (position: absolute) a moment after it ends (RailCount.web.tsx, Oct 25), and
 * a row of faces would fold up. CSS has no clean-up: the thing starts in its first frame's place
 * and at rest is ordinary content. Things leaving simply go, as before; words swap with a fade in.
 */

export type ArriveLook = 'rise' | 'pop' | 'slide' | 'fade' | 'lift';

const LAST_SLOT = 6;
const OUT_CUBIC = 'cubic-bezier(0.33, 1, 0.68, 1)';
const BACK_OUT = 'cubic-bezier(0.34, 1.4, 0.64, 1)';
const LOOKS: Record<ArriveLook, { from: { opacity: number; transform: object[] }; ms: number; gap: number; ease: string }> = {
  rise: { from: { opacity: 0, transform: [{ translateY: 6 }, { scale: 0.94 }] }, ms: 260, gap: 40, ease: OUT_CUBIC },
  pop: { from: { opacity: 0, transform: [{ scale: 0.6 }] }, ms: 320, gap: 50, ease: BACK_OUT },
  slide: { from: { opacity: 0, transform: [{ translateX: 24 }] }, ms: 280, gap: 30, ease: OUT_CUBIC },
  fade: { from: { opacity: 0, transform: [] }, ms: 220, gap: 30, ease: OUT_CUBIC },
  lift: { from: { opacity: 0, transform: [{ translateY: 6 }] }, ms: 220, gap: 30, ease: OUT_CUBIC },
};

/** A CSS animation for react-native-web (it compiles animationKeyframes into @keyframes); not a type React Native knows. */
function cssFor(look: ArriveLook, slot: number): ViewStyle {
  const L = LOOKS[look];
  return {
    animationKeyframes: [{ '0%': L.from, '100%': { opacity: 1, transform: L.from.transform.map((t) => Object.fromEntries(Object.keys(t).map((k) => [k, k === 'scale' ? 1 : 0]))) } }],
    animationDuration: `${L.ms}ms`,
    animationDelay: `${Math.min(Math.max(0, slot), LAST_SLOT) * L.gap}ms`,
    animationTimingFunction: L.ease,
    // Its first frame's look during its beat's wait, so it never shows at rest first.
    animationFillMode: 'backwards',
  } as unknown as ViewStyle;
}

export function Arrive({ slot, look = 'rise', leave, glide = false, style, children, pointerEvents }: {
  slot: number | null;
  look?: ArriveLook;
  leave?: 'shrink' | 'fade' | false;
  glide?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
}) {
  const [play] = useState(slot);
  // As the phone's: built as no arrival, with no way out (load-in on) or glide, its contents stand as they are.
  const [wrapped] = useState(() => play !== null || glide || (!!leave && loadInOn()));
  if (!wrapped) return <>{children}</>;
  return <View style={[style, play === null ? null : cssFor(look, play)]} pointerEvents={pointerEvents}>{children}</View>;
}

const SWAP_IN = {
  animationKeyframes: [{ '0%': { opacity: 0, transform: [{ translateY: 4 }] }, '100%': { opacity: 1, transform: [{ translateY: 0 }] } }],
  animationDuration: '180ms',
  animationTimingFunction: OUT_CUBIC,
} as unknown as TextStyle;

export function SwapText({ text, style, still = false, ...rest }: Omit<TextProps, 'children' | 'style'> & { text: string; style?: StyleProp<TextStyle>; still?: boolean }) {
  const gate = useArriveGate(still);
  const live = gate();
  if (!text) return null;
  // New words are a new SwapWords (keyed by them), which decides once, as it is built, whether they fade in.
  return <SwapWords key={text} text={text} live={live} style={style} {...rest} />;
}

function SwapWords({ text, live, style, ...rest }: Omit<TextProps, 'children' | 'style'> & { text: string; live: boolean; style?: StyleProp<TextStyle> }) {
  const [play] = useState(live);
  return <Text style={[style, play ? SWAP_IN : null]} {...rest}>{text}</Text>;
}

/** The phone's way in and out for a leaf with no view round it (a badge): none in a browser, where it simply appears and goes as before. */
export const arriveEntering = (_slot: number | null, _look: ArriveLook = 'pop'): undefined => undefined;
export const arriveExiting = (_on: boolean): undefined => undefined;
