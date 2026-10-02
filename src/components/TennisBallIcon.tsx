import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * A tennis ball drawn as itself: a round ball with its curved seam, in two
 * colours, rather than the generic outline icon. `fill` is the ball, `seam`
 * the line across it (the page colour reads best on a brand-coloured ball).
 */
export function TennisBallIcon({ size = 16, fill, seam }: { size?: number; fill: string; seam: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={12} cy={12} r={11} fill={fill} />
      {/* The seam: two arcs that bow toward each other, the way a real ball's felt joins. */}
      <Path d="M4.2 4.6c3.6 2.2 4.9 5.2 4.9 7.4s-1.3 5.2-4.9 7.4" stroke={seam} strokeWidth={1.9} strokeLinecap="round" fill="none" />
      <Path d="M19.8 4.6c-3.6 2.2-4.9 5.2-4.9 7.4s1.3 5.2 4.9 7.4" stroke={seam} strokeWidth={1.9} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
