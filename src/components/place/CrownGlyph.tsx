import React from 'react';
import Svg, { Path } from 'react-native-svg';

/**
 * A small crown, for King of the Court: three points over a band, filled or
 * drawn as an outline. Its own file so the court page, a profile or a share
 * picture can use it without the board.
 */
export function CrownGlyph({ size = 16, color, outline = false }: { size?: number; color: string; outline?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 22" fill="none">
      <Path d="M4.2 15 2.5 6.5l5.3 3.9L12 3.5l4.2 6.9 5.3-3.9L19.8 15Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" fill={outline ? 'none' : color} />
      <Path d="M4.5 18.6h15" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
