import React, { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme, type ThemeName } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

interface Props {
  /** How tall the wash is before it has faded out entirely. */
  height?: number;
  /** 1 is the waitlist page's strength; a card inside a screen wants less. */
  strength?: number;
  style?: StyleProp<ViewStyle>;
  /** What the wash fades into: the page by default, a card's own colour inside a card. */
  fade?: string;
  /** Draw another court's wash — the theme list shows each court as itself. */
  theme?: ThemeName;
}

type Glow = readonly [r: number, g: number, b: number, alpha: number];
/**
 * Two glows per court — one low on the left, one high on the right — so the
 * wash has a shape rather than a tint. The home courts wear one colour in
 * both; each Grand Slam wears its two colours, the pair everyone knows it by.
 * Alpha is the strength at each glow's centre; both fade to nothing.
 */
export const WASHES: Record<ThemeName, readonly [left: Glow, right: Glow]> = {
  default: [[197, 116, 72, 0.24], [197, 116, 72, 0.19]],
  clean: [[197, 116, 72, 0.18], [197, 116, 72, 0.14]],
  night: [[214, 138, 96, 0.18], [214, 138, 96, 0.14]],
  // Melbourne: the blue court, and the sun on it.
  ao: [[46, 133, 191, 0.26], [236, 140, 84, 0.22]],
  // Paris: clay, and the sun on it — green and blue both went muddy against the clay.
  'roland-garros': [[198, 116, 67, 0.34], [240, 190, 60, 0.24]],
  // London: grass, and the club's purple.
  wimbledon: [[78, 138, 74, 0.26], [79, 38, 131, 0.20]],
  // New York: the warm lights low, the yellow ball high, on the night-blue ground.
  'us-open': [[208, 138, 94, 0.42], [245, 213, 71, 0.26]],
};
const rgb = (g: Glow) => `rgb(${g[0]}, ${g[1]}, ${g[2]})`;

/**
 * The waitlist page's wash: one glow low on the left, one high on the right,
 * both feathered to nothing before the bottom edge. It sits behind a screen's
 * opening moment or inside a card. The colours are the court's own.
 */
export function Wash({ height = 320, strength = 1, style, fade, theme: wanted }: Props) {
  const { theme: current } = useTheme();
  const theme = wanted ?? current;
  const [l, r] = WASHES[theme] ?? WASHES.default;
  // The court's name is part of every gradient's id: iOS keeps a gradient by
  // its id and would not repaint one whose colours changed under the same
  // name, which left the old court's glow on the new court's page.
  const id = `${useId().replace(/[^a-zA-Z0-9]/g, '')}${theme.replace(/-/g, '')}`;
  const to = fade ?? colors.bg;
  return (
    <View pointerEvents="none" style={[styles.wrap, { height }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={`a${id}`} cx="6" cy="58" rx="62" ry="58" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={rgb(l)} stopOpacity={l[3] * strength} />
            <Stop offset="1" stopColor={rgb(l)} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`b${id}`} cx="94" cy="12" rx="60" ry="64" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={rgb(r)} stopOpacity={r[3] * strength} />
            <Stop offset="1" stopColor={rgb(r)} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`fade${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.35" stopColor={to} stopOpacity={0} />
            <Stop offset="1" stopColor={to} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#a${id})`} />
        <Rect x="0" y="0" width="100" height="100" fill={`url(#b${id})`} />
        <Rect x="0" y="0" width="100" height="100" fill={`url(#fade${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
});
