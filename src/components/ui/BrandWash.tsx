import React, { useId } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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
const LOOKS: Record<string, { toward: string; t: number; glow: number; sheen: string; sheenAt: number; rim?: string }> = {
  default: { toward: '#FFFFFF', t: 0.4, glow: 0.6, sheen: '#ECE4D3', sheenAt: 0.3 },
  'roland-garros': { toward: '#FFC79A', t: 0.55, glow: 0.7, sheen: '#F3E4CF', sheenAt: 0.34 },
  'us-open': { toward: '#FFEFCF', t: 0.5, glow: 0.5, sheen: '#E9A93F', sheenAt: 0.24, rim: 'rgba(122, 84, 10, 0.14)' },
  night: { toward: '#E9F7E4', t: 0.5, glow: 0.65, sheen: '#ECE4D3', sheenAt: 0.3 },
  ao: { toward: '#D8F0FF', t: 0.5, glow: 0.62, sheen: '#EAF4FA', sheenAt: 0.3 },
  // London: fresh grass low, the club's purple catching the top corner.
  wimbledon: { toward: '#E4F4D8', t: 0.42, glow: 0.62, sheen: '#B49AD6', sheenAt: 0.32 },
  // Clean: a plain white light, no beige, to match its white page.
  clean: { toward: '#FFFFFF', t: 0.42, glow: 0.58, sheen: '#FFFFFF', sheenAt: 0.26 },
};

/**
 * An oval glow. Phones draw an SVG radial gradient's rx/ry as an oval; browsers ignore
 * rx/ry and draw a circle, so on the web the same oval is drawn with a gradientTransform.
 */
const ellipse = (cx: number, cy: number, rx: number, ry: number) => (Platform.OS === 'web'
  ? { cx: 0, cy: 0, r: 1, gradientTransform: `translate(${cx} ${cy}) scale(${rx} ${ry})` }
  : { cx, cy, rx, ry });

export function BrandWash({ radius = 999, strength = 1, base }: {
  radius?: number;
  /**
   * How much of the glow and sheen to draw, 0 to 1. A surface with small
   * words across all of it (the player card) takes a whisper of it, so the
   * words read wherever they fall.
   */
  strength?: number;
  /** The fill it is laid on, when that is not the brand colour itself (a deepened brand). */
  base?: string;
}) {
  const { theme } = useTheme();
  // The court's name is in the ids: iOS keeps a gradient by id and would not
  // repaint one whose colours changed under the same name.
  const id = `${useId().replace(/[^a-zA-Z0-9]/g, '')}${theme.replace(/-/g, '')}`;
  const base0 = LOOKS[theme] ?? LOOKS.default;
  const look = strength === 1 ? base0 : { ...base0, glow: base0.glow * strength, sheenAt: base0.sheenAt * strength };
  const light = mix(base ?? colors.brand, look.toward, look.t);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={`l${id}`} {...ellipse(4, 110, 120, 140)} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={light} stopOpacity={look.glow} />
            <Stop offset="0.62" stopColor={light} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`b${id}`} {...ellipse(96, -10, 110, 150)} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={look.sheen} stopOpacity={look.sheenAt} />
            <Stop offset="0.6" stopColor={look.sheen} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#l${id})`} />
        <Rect x="0" y="0" width="100" height="100" fill={`url(#b${id})`} />
      </Svg>
      {/* A hairline of deeper amber just inside the edge, so the softer fill still holds its shape on the night blue. */}
      {look.rim ? <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: look.rim }]} /> : null}
    </View>
  );
}

/**
 * The Classic shirt's fade, for a cream box (the session boxes on the
 * CourtSide court, Oct 5): a faint sage green breathing in from the top
 * right corner and a soft clay peach from the bottom left, as on the shirt's
 * front, both falling away well before the middle so the cream carries the
 * box. Both are the court's own colours lifted toward its surface (the green,
 * and the clay warmed with a little gold), so nothing here is a new colour.
 * `rim`, when given, is a hairline just inside the edge, drawn over the box
 * so the box's own size never changes. Lay it as the first child, as
 * BrandWash.
 */
export function CreamWash({ radius = 999, rim }: { radius?: number; rim?: string | null }) {
  const { theme } = useTheme();
  // The court's name in the ids, as above: iOS would not repaint a gradient kept under the same name.
  const id = `${useId().replace(/[^a-zA-Z0-9]/g, '')}cream${theme.replace(/-/g, '')}`;
  const sage = mix(colors.brand, colors.surface, 0.55);
  const peach = mix(mix(colors.clay, colors.sun, 0.35), colors.surface, 0.5);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={`s${id}`} {...ellipse(106, -6, 96, 84)} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={sage} stopOpacity={0.4} />
            <Stop offset="0.5" stopColor={sage} stopOpacity={0.16} />
            <Stop offset="1" stopColor={sage} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`p${id}`} {...ellipse(-6, 106, 96, 84)} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={peach} stopOpacity={0.44} />
            <Stop offset="0.5" stopColor={peach} stopOpacity={0.17} />
            <Stop offset="1" stopColor={peach} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#s${id})`} />
        <Rect x="0" y="0" width="100" height="100" fill={`url(#p${id})`} />
      </Svg>
      {rim ? <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: rim }]} /> : null}
    </View>
  );
}
