import React from 'react';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

/**
 * A hit, drawn the way the app draws courts: the court from above, the net
 * across the middle, and two players, one on each side. It stands for
 * "someone to play with" where a ball alone said only "tennis".
 *
 * With `rim` (the colour behind it) it is drawn for badge size, the way the
 * map's hit flag draws it: no service lines, bolder strokes, and each player
 * cut out of the court's line by a rim of that colour, so they still show.
 */
export function HitGlyph({ size = 22, color, accent, rim }: {
  size?: number;
  color: string;
  /** The players; the court's colour if not given. */
  accent?: string;
  /** The fill behind a badge-size mark. */
  rim?: string;
}) {
  const dot = accent ?? color;
  if (rim) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={5.2} y={2.2} width={13.6} height={19.6} rx={1.8} stroke={color} strokeWidth={2.2} />
        <Line x1={3} y1={12} x2={21} y2={12} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        <Circle cx={9.4} cy={5.2} r={2.6} fill={dot} stroke={rim} strokeWidth={1.4} />
        <Circle cx={14.6} cy={18.8} r={2.6} fill={dot} stroke={rim} strokeWidth={1.4} />
      </Svg>
    );
  }
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
