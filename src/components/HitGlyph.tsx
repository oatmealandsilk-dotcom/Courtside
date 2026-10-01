import React from 'react';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

/**
 * A hit, drawn the way the app draws courts: the court from above, the net
 * across the middle, and two players, one on each side. It stands for
 * "someone to play with" where a ball alone said only "tennis".
 */
export function HitGlyph({ size = 22, color, accent }: { size?: number; color: string; /** The players; the court's colour if not given. */ accent?: string }) {
  const dot = accent ?? color;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={2.5} width={14} height={19} rx={1.6} stroke={color} strokeWidth={1.6} />
      <Line x1={3.5} y1={12} x2={20.5} y2={12} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1={5} y1={7.2} x2={19} y2={7.2} stroke={color} strokeWidth={1} opacity={0.55} />
      <Line x1={5} y1={16.8} x2={19} y2={16.8} stroke={color} strokeWidth={1} opacity={0.55} />
      <Line x1={12} y1={7.2} x2={12} y2={16.8} stroke={color} strokeWidth={1} opacity={0.55} />
      <Circle cx={9.2} cy={4.9} r={1.9} fill={dot} />
      <Circle cx={14.8} cy={19.1} r={1.9} fill={dot} />
    </Svg>
  );
}
