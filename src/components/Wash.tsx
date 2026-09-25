import React, { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

interface Props {
  /** How tall the wash is before it has faded out entirely. */
  height?: number;
  /** 1 is the waitlist page's strength; a card inside a screen wants less. */
  strength?: number;
  style?: StyleProp<ViewStyle>;
  /** What the wash fades into: the page by default, a card's own colour inside a card. */
  fade?: string;
}

/** Perceived lightness of a hex colour, 0..1 — enough to tell a dark court from a light one. */
function lightness(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/**
 * The waitlist page's wash: clay low on the left, the court's own green high
 * on the right, both feathered to nothing before the bottom edge. It sits
 * behind a screen's opening moment or inside a card, never under a list.
 * Colours come from the palette, so each court washes in its own colours.
 */
export function Wash({ height = 320, strength = 1, style, fade }: Props) {
  // Reading the theme here is what redraws the gradients when it changes.
  useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const dark = lightness(colors.bg) < 0.5;
  const s = strength * (dark ? 0.7 : 1);
  const to = fade ?? colors.bg;
  return (
    <View pointerEvents="none" style={[styles.wrap, { height }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={`clay${id}`} cx="6" cy="58" rx="62" ry="58" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.clay} stopOpacity={0.42 * s} />
            <Stop offset="1" stopColor={colors.clay} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`grass${id}`} cx="94" cy="12" rx="60" ry="64" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.brand} stopOpacity={0.26 * s} />
            <Stop offset="1" stopColor={colors.brand} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`fade${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.35" stopColor={to} stopOpacity={0} />
            <Stop offset="1" stopColor={to} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#clay${id})`} />
        <Rect x="0" y="0" width="100" height="100" fill={`url(#grass${id})`} />
        <Rect x="0" y="0" width="100" height="100" fill={`url(#fade${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
});
