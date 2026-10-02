import React from 'react';
import Svg, { Line, Rect } from 'react-native-svg';

/**
 * A tennis court from above: the outline, the net across the middle, the
 * service boxes. Its own small file, so a hit's card (drawn inside the map's
 * sheets) can use it without the map's chrome and the card importing each other.
 */
export function CourtGlyph({ size = 15, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size * 1.25} viewBox="0 0 16 20" fill="none">
      <Rect x={2} y={1.5} width={12} height={17} rx={1.2} stroke={color} strokeWidth={1.5} />
      <Line x1={2} y1={10} x2={14} y2={10} stroke={color} strokeWidth={1.5} />
      <Line x1={2} y1={6} x2={14} y2={6} stroke={color} strokeWidth={1} />
      <Line x1={2} y1={14} x2={14} y2={14} stroke={color} strokeWidth={1} />
      <Line x1={8} y1={6} x2={8} y2={14} stroke={color} strokeWidth={1} />
    </Svg>
  );
}
