import React, { useState } from 'react';
import { StyleSheet, Text, View, type TextProps, type TextStyle, type ViewProps } from 'react-native';

/*
 * softLayer in a browser: the same ways in and out as softLayer.ts, done as plain CSS animations on plain text
 * and views (react-native-web compiles animationKeyframes into @keyframes; the browser starts each on the
 * element's first paint). Why not Reanimated here: its animated components read animation* style keys as their
 * own CSS animations and never hand react-native-web its animationKeyframes (Oct 29 recording), and its custom
 * entering animations pin an element absolute a second later in a browser (RailCount.web). A change here wants
 * the same change in softLayer.ts.
 */

export const SOFT_MS = 220;
/** A swap: the old word's way out. */
const OUT_MS = 95;
/** A swap: when the new word starts, once the old one is all but gone. */
export const SWAP_HOLD_MS = 80;
/** A swap: when the new word is in place. */
export const SWAP_MS = 260;
/** Easing.out(Easing.cubic), as the phone's. */
const EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';

export type InWay = 'rise' | 'fade' | 'grow';
export type OutWay = 'quick' | 'fade';

type Frame = { opacity: number; transform?: Record<string, number>[] };
const css = (frames: Record<string, Frame>, ms: number, fill: 'backwards' | 'forwards') => ({
  animationKeyframes: [frames],
  animationDuration: `${ms}ms`,
  animationTimingFunction: EASE,
  animationFillMode: fill,
}) as unknown as TextStyle;

const HOLD = `${Math.round((SWAP_HOLD_MS / SWAP_MS) * 1000) / 10}%`;
const low = { opacity: 0, transform: [{ translateY: 3 }] };

/** Created once, so the browser gets each as one class. */
const IN = StyleSheet.create({
  // Held unseen until the old word is all but gone, then rising: the easing runs per step, so the rise eases out.
  rise: css({ '0%': low, [HOLD]: low, '100%': { opacity: 1, transform: [{ translateY: 0 }] } }, SWAP_MS, 'backwards'),
  fade: css({ '0%': { opacity: 0 }, '100%': { opacity: 1 } }, SOFT_MS, 'backwards'),
  grow: css({ '0%': { opacity: 0, transform: [{ scale: 0.92 }] }, '100%': { opacity: 1, transform: [{ scale: 1 }] } }, SOFT_MS, 'backwards'),
});
const OUT = StyleSheet.create({
  quick: css({ '0%': { opacity: 1 }, '100%': { opacity: 0 } }, OUT_MS, 'forwards'),
  fade: css({ '0%': { opacity: 1 }, '100%': { opacity: 0 } }, SOFT_MS, 'forwards'),
  // At rest out of sight once its way out is done.
  gone: { opacity: 0 },
});

/** A word coming in (`way`), or at rest (null). */
export function InText({ way, style, ...rest }: TextProps & { way: InWay | null }) {
  return React.createElement(Text, { ...rest, style: [style, way ? IN[way] : null] });
}

/** Something coming in whole (the avatar's disc), or at rest (null). */
export function InView({ way, style, ...rest }: ViewProps & { way: InWay | null }) {
  return React.createElement(View, { ...rest, style: [style, way ? IN[way] : null] });
}

/** An old word on its way out. */
export function OutText({ way, style, ...rest }: TextProps & { way: OutWay }) {
  const [w] = useState(way);
  return React.createElement(Text, { ...rest, style: [style, OUT.gone, OUT[w]] });
}
