import React, { useId } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { BrandMark } from '@/components/BrandMark';

/*
 * The CourtSide mark with a soft halo round it, for a mark laid over
 * someone's photo or clip (the session's Overlay and the clip overlay), so it
 * stands off a busy court: a dark shadow under a light mark (as the white
 * numbers have), a light glow round a dark one (the brand's deep green).
 *
 * The halo has to be in the saved picture, not only on screen:
 * - iPhone draws a view's shadow from its own shapes when it has no
 *   background, and its snapshot keeps it;
 * - Android cannot shadow a shape, and its snapshot skips the blur effects
 *   that could; a browser shadows a view round its box, not its shapes, and
 *   its picture-maker (html2canvas) leaves box shadows and blur filters out.
 *   There the halo is drawn: a soft oval of the same colour behind the mark,
 *   fading out, about as wide as iPhone's. (Copies of the mark nudged round
 *   it were tried, Oct 9: on its thin lines they showed as ghost outlines.)
 *
 * `u` is one unit of a 360-wide story, as the overlays draw.
 */

export type Halo = 'dark' | 'light';

const LOOK: Record<Halo, { rgb: string; opacity: number; radius: number; drop: number }> = {
  // A shadow, a touch below, as the numbers' is.
  dark: { rgb: '0,0,0', opacity: 0.55, radius: 3.5, drop: 0.8 },
  // A glow, all round.
  light: { rgb: '255,255,255', opacity: 0.8, radius: 3.5, drop: 0 },
};

/** How far the drawn halo reaches past the mark's own lines, in `u`. */
const SPREAD = 7;

export function ShadedMark({ size, u, color, halo, weight = 1, sideWeight = weight }: { size: number; u: number; color: string; halo: Halo; weight?: number; sideWeight?: number }) {
  const look = LOOK[halo];
  // One gradient per mark: a page can show this mark twice (the preview and the copy photographed).
  const id = `halo${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (Platform.OS === 'ios') {
    return (
      <View style={{ shadowColor: `rgb(${look.rgb})`, shadowOpacity: look.opacity, shadowRadius: look.radius * u, shadowOffset: { width: 0, height: look.drop * u } }}>
        <BrandMark size={size} color={color} weight={weight} sideWeight={sideWeight} />
      </View>
    );
  }
  // The mark's lines fill about 0.8 × 0.72 of its square, about its middle.
  const pad = SPREAD * u;
  const w = size + pad * 2;
  const rx = size * 0.4 + pad;
  const ry = size * 0.36 + pad;
  // As strong at its heart as a blurred line of the mark is (its lines are thin), fading to nothing.
  const peak = look.opacity * 0.5;
  return (
    <View style={{ width: size, height: size }}>
      <View aria-hidden pointerEvents="none" style={{ position: 'absolute', left: -pad, top: -pad + look.drop * u }}>
        <Svg width={w} height={w}>
          <Defs>
            <RadialGradient id={id} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={`rgb(${look.rgb})`} stopOpacity={peak} />
              <Stop offset="0.45" stopColor={`rgb(${look.rgb})`} stopOpacity={peak * 0.8} />
              <Stop offset="0.75" stopColor={`rgb(${look.rgb})`} stopOpacity={peak * 0.35} />
              <Stop offset="1" stopColor={`rgb(${look.rgb})`} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={w / 2} cy={w / 2} rx={rx} ry={ry} fill={`url(#${id})`} />
        </Svg>
      </View>
      <BrandMark size={size} color={color} weight={weight} sideWeight={sideWeight} />
    </View>
  );
}
