import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/** `t` of the way from one #RRGGBB colour to another. */
function mix(a: string, b: string, t: number): string {
  const ch = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return a;
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The page's wash, whispered inside a filled brand surface (a primary pill,
 * the create button, a chosen chip): a lighter tone of the fill pooling low
 * on the left and a soft beige high on the right, so a green button has the
 * same gentle depth as the page behind it instead of reading flat. Lay it
 * as the first child; it fills its parent and clips to `radius` itself, so
 * the parent keeps its lift shadow.
 */
/**
 * Each court's fade, tuned so it reads equally lively on its own colour: a
 * lighter tone of the fill pooling low on the left (`glow`, how far toward
 * `toward` and how strong) and a soft light high on the right (`sheen`).
 * Clay glows apricot rather than pink, Melbourne glows sky, London's green
 * catches purple, and New York's yellow warms to amber at the top, since
 * white barely shows on yellow.
 */
// New York's is the quietest: a bright yellow takes very little before it glows.
const LOOKS: Record<string, { toward: string; t: number; glow: number; sheen: string; sheenAt: number }> = {
  default: { toward: '#FFFFFF', t: 0.4, glow: 0.6, sheen: '#ECE4D3', sheenAt: 0.3 },
  'roland-garros': { toward: '#FFC79A', t: 0.55, glow: 0.7, sheen: '#F3E4CF', sheenAt: 0.34 },
  'us-open': { toward: '#FFFFFF', t: 0.45, glow: 0.4, sheen: '#E9A93F', sheenAt: 0.22 },
  night: { toward: '#E9F7E4', t: 0.5, glow: 0.65, sheen: '#ECE4D3', sheenAt: 0.3 },
  ao: { toward: '#D8F0FF', t: 0.5, glow: 0.62, sheen: '#EAF4FA', sheenAt: 0.3 },
  // London: fresh grass low, the club's purple catching the top corner.
  wimbledon: { toward: '#E4F4D8', t: 0.42, glow: 0.62, sheen: '#B49AD6', sheenAt: 0.32 },
  // Clean: a plain white light, no beige, to match its white page.
  clean: { toward: '#FFFFFF', t: 0.42, glow: 0.58, sheen: '#FFFFFF', sheenAt: 0.26 },
};

export function BrandWash({ radius = 999 }: { radius?: number }) {
  const { theme } = useTheme();
  // The court's name is in the ids: iOS keeps a gradient by id and would not
  // repaint one whose colours changed under the same name.
  const id = `${useId().replace(/[^a-zA-Z0-9]/g, '')}${theme.replace(/-/g, '')}`;
  const look = LOOKS[theme] ?? LOOKS.default;
  const light = mix(colors.brand, look.toward, look.t);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={`l${id}`} cx="4" cy="110" rx="120" ry="140" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={light} stopOpacity={look.glow} />
            <Stop offset="0.62" stopColor={light} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`b${id}`} cx="96" cy="-10" rx="110" ry="150" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={look.sheen} stopOpacity={look.sheenAt} />
            <Stop offset="0.6" stopColor={look.sheen} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#l${id})`} />
        <Rect x="0" y="0" width="100" height="100" fill={`url(#b${id})`} />
      </Svg>
    </View>
  );
}
