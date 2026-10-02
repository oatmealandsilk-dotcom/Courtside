import React, { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Mask, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/**
 * A soft patch of the page colour behind the map's city name: densest under
 * the words and fading to nothing on every side, so it reads as a haze, never
 * as a box. Drawn as a gradient (not a filled view with a shadow): on iPhone
 * a shadow leaves the filled rectangle's own edge showing (Oct 2, William).
 * It reaches past its parent on every side, so the fade has room.
 */
export function CityHaze({ strength = 0.78 }: { strength?: number }) {
  const { theme } = useTheme();
  // The theme is in every id: iOS keeps a gradient by its id and would not
  // repaint one whose colour changed under the same name (see Wash).
  const id = `${useId().replace(/[^a-zA-Z0-9]/g, '')}${theme.replace(/-/g, '')}`;
  return (
    <Svg pointerEvents="none" style={styles.haze} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <Defs>
        {/* Across: in from both sides, full through the middle. */}
        <LinearGradient id={`x${id}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={colors.bg} stopOpacity={0} />
          <Stop offset="0.24" stopColor={colors.bg} stopOpacity={strength} />
          <Stop offset="0.76" stopColor={colors.bg} stopOpacity={strength} />
          <Stop offset="1" stopColor={colors.bg} stopOpacity={0} />
        </LinearGradient>
        {/* Down: the same from top and bottom, as a mask over the first. */}
        <LinearGradient id={`y${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
        <Mask id={`m${id}`} x="0" y="0" width="100" height="100" maskUnits="userSpaceOnUse">
          <Rect x="0" y="0" width="100" height="100" fill={`url(#y${id})`} />
        </Mask>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#x${id})`} mask={`url(#m${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  // Wider than tall on purpose: the words are a wide block, and the fade needs room past them.
  haze: { position: 'absolute', left: -56, right: -56, top: -30, bottom: -30 },
});
