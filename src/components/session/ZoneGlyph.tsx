import React from 'react';
import Svg, { Rect } from 'react-native-svg';

/**
 * A tennis session's mark: four small rounded bars, like a heart-rate zone
 * chart at a glance. It stands for a session wherever one shows (the toast,
 * the pill over a clip, "Add session stats"), in place of a cartoon ball.
 */
export function ZoneGlyph({ size = 16, color }: { size?: number; color: string }) {
  const bars = [
    { x: 1.5, h: 5, o: 0.55 },
    { x: 5.5, h: 8, o: 0.7 },
    { x: 9.5, h: 12, o: 1 },
    { x: 13.5 - 0.5, h: 7, o: 0.8 },
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      {bars.map((b, i) => (
        <Rect key={i} x={b.x} y={14 - b.h} width={2.6} height={b.h} rx={1.3} fill={color} opacity={b.o} />
      ))}
    </Svg>
  );
}
