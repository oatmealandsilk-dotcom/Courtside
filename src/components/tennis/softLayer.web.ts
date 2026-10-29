import { StyleSheet, Text, View, type TextStyle } from 'react-native';

/*
 * softLayer in a browser: the same ways in and out as softLayer.ts, done as plain CSS animations
 * (react-native-web compiles animationKeyframes into @keyframes). Why not the phone's entering animations:
 * Reanimated 4.5 runs a timed clean-up after any custom entering animation in a browser that pins the
 * element with position: absolute (RailCount.web), which would fold the card's lines. A change here wants
 * the same change in softLayer.ts.
 */

export const SOFT_MS = 220;
/** Easing.out(Easing.cubic), as the phone's. */
const EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';

export type InWay = 'rise' | 'fade' | 'grow';
export type OutWay = 'quick' | 'fade';

type Frame = { opacity: number; transform?: Record<string, number>[] };
const css = (from: Frame, to: Frame, ms: number, fill: 'backwards' | 'forwards') => ({
  animationKeyframes: [{ '0%': from, '100%': to }],
  animationDuration: `${ms}ms`,
  animationTimingFunction: EASE,
  animationFillMode: fill,
}) as unknown as TextStyle;

/** Created once, so the browser gets each as one class. */
const IN = StyleSheet.create({
  rise: css({ opacity: 0, transform: [{ translateY: 3 }] }, { opacity: 1, transform: [{ translateY: 0 }] }, SOFT_MS, 'backwards'),
  fade: css({ opacity: 0 }, { opacity: 1 }, SOFT_MS, 'backwards'),
  grow: css({ opacity: 0, transform: [{ scale: 0.92 }] }, { opacity: 1, transform: [{ scale: 1 }] }, SOFT_MS, 'backwards'),
});
const OUT = StyleSheet.create({
  quick: css({ opacity: 1 }, { opacity: 0 }, Math.round(SOFT_MS * 0.5), 'forwards'),
  fade: css({ opacity: 1 }, { opacity: 0 }, SOFT_MS, 'forwards'),
});

export function layerIn(way: InWay | null): { entering?: undefined; style?: TextStyle } {
  return way ? { style: IN[way] } : {};
}

export function layerOut(way: OutWay): { entering?: undefined; style?: TextStyle } {
  return { style: OUT[way] };
}

/**
 * What a layer is drawn with in a browser: plain text and view. Reanimated 4's animated components read
 * animation* style keys as their own CSS animations and never hand react-native-web its animationKeyframes,
 * so on them these animations did not run (Oct 29 recording).
 */
export const LayerText = Text;
export const LayerView = View;
