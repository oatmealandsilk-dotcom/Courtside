import { useState } from 'react';
import { StyleSheet, View, type ColorValue, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useDrawFast } from '@/lib/drawFast';

/**
 * A card's soft corner wash: `from` in the top-left corner, gone into `to` three quarters of the way towards the
 * bottom right (the Tennis card's pop, Clean's light box, a session card's soft box). The same as expo-linear-gradient
 * from (0, 0) to (0.9, 1) with stops at 0 and 0.75.
 *
 * Why its own piece (Nov 4, owner: "There's still way too much latency delay"): expo's gradient is painted by hand
 * on the phone's main thread, and painted again every time a page opens over the card (twice: as the page slides in
 * and as it lands) and as a swipe back starts. React Native's own gradient (a style's backgroundImage) is a layer
 * iOS's compositor draws, never repainted by hand.
 *
 * The CSS gradient is told the same line: its angle runs along (0.9 × width, height), and since a CSS gradient runs
 * corner to corner while expo's runs to the point (0.9, 1), the 0.75 stop moves to 0.75 × |d|² / (d · (width,
 * height)), d = (0.9 × width, height), which needs the card's size: until it is known (its first frame) the card
 * keeps expo's. Checked side by side in the Simulator in every court, light and dark (speed-numbers.txt).
 *
 * iOS only, behind taps answering sooner (lib/drawFast: TAP_FAST, admins first).
 */
export function CornerWash({ from, to, radius }: { from: ColorValue; to: ColorValue; radius: number }) {
  const fast = useDrawFast() && typeof from === 'string' && typeof to === 'string';
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = fast ? (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
  } : undefined;
  const image = fast && size && size.w > 0 && size.h > 0 ? cornerImage(String(from), String(to), size.w, size.h) : null;
  if (image) return <View pointerEvents="none" onLayout={onLayout} style={[StyleSheet.absoluteFill, { borderRadius: radius, experimental_backgroundImage: image }]} />;
  return <LinearGradient pointerEvents="none" onLayout={onLayout} colors={[from, to]} locations={[0, 0.75]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />;
}

/** expo's (0, 0) → (0.9, 1) gradient, stops 0 and 0.75, as a CSS linear-gradient for a w × h box. */
export function cornerImage(from: string, to: string, w: number, h: number): string {
  const dx = 0.9 * w;
  const dy = h;
  // CSS angles: 0deg points up, 90deg right; the direction is (sin, -cos) with y down.
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const stop = (0.75 * (dx * dx + dy * dy)) / (dx * w + dy * h);
  return `linear-gradient(${angle.toFixed(4)}deg, ${from} 0%, ${to} ${(stop * 100).toFixed(4)}%)`;
}
