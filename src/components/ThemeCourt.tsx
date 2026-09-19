import React from 'react';
import { View } from 'react-native';

import { themes, type ThemeName } from '@/theme/ThemeProvider';

type Palette = (typeof themes)[ThemeName];

/**
 * Each theme's court, drawn from its own palette: the playing surface, and
 * what surrounds it (Melbourne's two blues, Paris's clay, Wimbledon's grass,
 * a US Open court under the night sky, CourtSide's club green).
 */
const COURT: Record<ThemeName, { surface: keyof Palette; surround: keyof Palette }> = {
  default: { surface: 'court', surround: 'brand' },
  night: { surface: 'court', surround: 'bg' },
  ao: { surface: 'hard', surround: 'court' },
  'roland-garros': { surface: 'clay', surround: 'court' },
  wimbledon: { surface: 'grass', surround: 'brand' },
  'us-open': { surface: 'hard', surround: 'bg' },
};

/** Court lines are white on every surface, the way real ones are. */
const LINE = 'rgba(255,255,255,0.92)';

/**
 * A theme's badge: a tennis court seen from above, in that theme's colours,
 * with its lines and the net. Used small for the Theme row in Settings and
 * larger for each theme on the Theme page.
 */
export function ThemeCourt({ name, size }: { name: ThemeName; size: number }) {
  const p = themes[name];
  const surface = p[COURT[name].surface];
  const surround = p[COURT[name].surround];
  const lw = Math.max(1, Math.round(size / 26));
  const courtW = Math.round(size * 0.5);
  const courtH = Math.round(size * 0.78);
  const netH = Math.max(1.5, lw * 1.5);
  const netOver = Math.round(size * 0.07);
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.26), backgroundColor: surround, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <View style={{ width: courtW, height: courtH, backgroundColor: surface, borderWidth: lw, borderColor: LINE }}>
        {/* Singles sidelines */}
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: '14%', width: lw, backgroundColor: LINE }} />
        <View style={{ position: 'absolute', top: 0, bottom: 0, right: '14%', width: lw, backgroundColor: LINE }} />
        {/* Service lines */}
        <View style={{ position: 'absolute', left: '14%', right: '14%', top: '24%', height: lw, backgroundColor: LINE }} />
        <View style={{ position: 'absolute', left: '14%', right: '14%', bottom: '24%', height: lw, backgroundColor: LINE }} />
        {/* Centre service line */}
        <View style={{ position: 'absolute', top: '24%', bottom: '24%', left: '50%', marginLeft: -lw / 2, width: lw, backgroundColor: LINE }} />
      </View>
      {/* The net, a touch wider than the court */}
      <View style={{ position: 'absolute', top: '50%', marginTop: -netH / 2, width: courtW + netOver * 2, height: netH, borderRadius: netH, backgroundColor: LINE }} />
    </View>
  );
}
