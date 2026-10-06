import React, { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * The welcome's picture: a hard court seen from straight above, from behind
 * the far baseline, drawn rather than photographed (no court photo ships with
 * the app). It is artwork, like a photo, so its colours are its own and stay
 * the same in every theme and in dark mode: the brand's court green, the
 * cream lines, one optic-yellow ball near the T.
 */
export const COURT_ART = {
  // The surface: a little lighter where the sun falls (top left), deeper at the far corner.
  lit: '#4E8A5A',
  deep: '#2B5535',
  line: '#F6F2E4',
  sun: '#FFF3D2',
  shade: '#0B1E10',
  ball: '#E3EA6A',
  ballDeep: '#B7C335',
} as const;

/** Where the court lands in a box this size: the logo sits in the backcourt, between the far baseline and the service line. */
export function courtGeometry(width: number, height: number, wide: boolean) {
  // Singles width: almost the whole phone (its sidelines just inside the edges); on a desktop's panel, most of it.
  const singles = wide ? Math.min(width * 0.78, height * 0.92) : width - 2 * Math.max(18, width * 0.055);
  const s = singles / 8.23; // points per metre
  const serviceY = height * (wide ? 0.6 : 0.7);
  return {
    s,
    cx: width / 2,
    singlesHalf: singles / 2,
    doublesHalf: (10.97 * s) / 2,
    serviceY,
    baselineY: serviceY - 5.485 * s,
    netY: serviceY + 6.4 * s,
    // A touch bolder than a real 5 cm line, so it reads at phone size.
    line: Math.max(3, s * 0.085),
  };
}

/** A fixed scatter of fine grain, the sand in a hard court's paint. */
function useGrain() {
  return useMemo(() => {
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    return Array.from({ length: 90 }, (_, i) => ({ x: rand() * 72, y: rand() * 72, r: 0.45 + rand() * 0.6, light: i % 2 === 0 }));
  }, []);
}

export function CourtHero({ width, height, wide }: { width: number; height: number; wide: boolean }) {
  const reduce = useReducedMotion();
  const drift = useSharedValue(0);
  // A slow breath, one way over sixteen seconds and back: the picture is alive, never busy. Still for Reduce Motion.
  useEffect(() => {
    if (reduce) return;
    drift.value = withRepeat(withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(drift);
  }, [reduce, drift]);
  const moving = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + drift.value * 0.045 }, { translateY: -drift.value * 6 }],
  }));
  const grain = useGrain();
  const g = courtGeometry(width, height, wide);
  const { s, cx, line } = g;
  const half = line / 2;
  // The ball rests in the right service box, a step from the T; the sun is top right, so its shadow falls down and left.
  const ball = { x: cx + 1.9 * s, y: g.serviceY + 1.2 * s, r: Math.max(6, s * 0.14) };
  const big = Math.max(width, height);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, moving]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="wh-surface" x1="0" y1="0" x2={width} y2={height} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={COURT_ART.lit} />
            <Stop offset="1" stopColor={COURT_ART.deep} />
          </LinearGradient>
          <RadialGradient id="wh-sun" cx={width * 0.9} cy={-height * 0.08} r={big * 0.95} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={COURT_ART.sun} stopOpacity={0.2} />
            <Stop offset="0.45" stopColor={COURT_ART.sun} stopOpacity={0.06} />
            <Stop offset="1" stopColor={COURT_ART.sun} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="wh-shade" cx={0} cy={height} r={big * 0.85} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={COURT_ART.shade} stopOpacity={0.32} />
            <Stop offset="1" stopColor={COURT_ART.shade} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="wh-net" x1="0" y1={g.netY} x2="0" y2={g.netY + 0.7 * s} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={COURT_ART.shade} stopOpacity={0.4} />
            <Stop offset="1" stopColor={COURT_ART.shade} stopOpacity={0} />
          </LinearGradient>
          <RadialGradient id="wh-ball-shadow" cx={ball.x - ball.r * 0.7} cy={ball.y + ball.r * 0.55} r={ball.r * 1.5} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={COURT_ART.shade} stopOpacity={0.5} />
            <Stop offset="1" stopColor={COURT_ART.shade} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="wh-ball" cx={ball.x + ball.r * 0.35} cy={ball.y - ball.r * 0.35} r={ball.r * 1.4} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={COURT_ART.ball} />
            <Stop offset="1" stopColor={COURT_ART.ballDeep} />
          </RadialGradient>
          <ClipPath id="wh-ball-clip"><Circle cx={ball.x} cy={ball.y} r={ball.r} /></ClipPath>
          <Pattern id="wh-grain" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
            {grain.map((d, i) => (
              <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.light ? '#FFFFFF' : '#000000'} opacity={d.light ? 0.07 : 0.09} />
            ))}
          </Pattern>
        </Defs>

        <Rect x="0" y="0" width={width} height={height} fill="url(#wh-surface)" />
        <Rect x="0" y="0" width={width} height={height} fill="url(#wh-grain)" />

        {/* The lines: the far baseline and its centre mark, both sidelines, the service line, the centre service line. */}
        <G fill={COURT_ART.line} opacity={0.94}>
          <Rect x={cx - g.doublesHalf - half} y={g.baselineY - half} width={g.doublesHalf * 2 + line} height={line} />
          <Rect x={cx - half} y={g.baselineY} width={line} height={0.32 * s} />
          {[-g.doublesHalf, -g.singlesHalf, g.singlesHalf, g.doublesHalf].map((x) => (
            <Rect key={x} x={cx + x - half} y={g.baselineY - half} width={line} height={g.netY - g.baselineY + half} />
          ))}
          <Rect x={cx - g.singlesHalf - half} y={g.serviceY - half} width={g.singlesHalf * 2 + line} height={line} />
          <Rect x={cx - half} y={g.serviceY} width={line} height={g.netY - g.serviceY} />
        </G>

        {/* The net, where a tall box reaches it: its shadow, its tape and its two posts. */}
        <Rect x="0" y={g.netY} width={width} height={0.7 * s} fill="url(#wh-net)" />
        <Rect x={cx - g.doublesHalf - 0.914 * s} y={g.netY - line * 0.7} width={(g.doublesHalf + 0.914 * s) * 2} height={line * 1.4} fill={COURT_ART.line} />
        {[-1, 1].map((side) => (
          <Circle key={side} cx={cx + side * (g.doublesHalf + 0.914 * s)} cy={g.netY} r={0.09 * s} fill={COURT_ART.shade} opacity={0.8} />
        ))}

        {/* One ball, a step from the T. */}
        <Ellipse cx={ball.x - ball.r * 0.7} cy={ball.y + ball.r * 0.55} rx={ball.r * 1.5} ry={ball.r * 1.1} fill="url(#wh-ball-shadow)" />
        <Circle cx={ball.x} cy={ball.y} r={ball.r} fill="url(#wh-ball)" />
        <G clipPath="url(#wh-ball-clip)" stroke="#FBFCEB" strokeOpacity={0.85} strokeWidth={ball.r * 0.16} fill="none">
          <Path d={`M ${ball.x - ball.r * 1.05} ${ball.y - ball.r * 0.35} Q ${ball.x - ball.r * 0.15} ${ball.y - ball.r * 0.05} ${ball.x - ball.r * 0.4} ${ball.y + ball.r * 1.05}`} />
          <Path d={`M ${ball.x + ball.r * 0.4} ${ball.y - ball.r * 1.05} Q ${ball.x + ball.r * 0.15} ${ball.y + ball.r * 0.05} ${ball.x + ball.r * 1.05} ${ball.y + ball.r * 0.35}`} />
        </G>

        {/* Light: the afternoon sun from the top right, the far corner falling into shade. */}
        <Rect x="0" y="0" width={width} height={height} fill="url(#wh-sun)" />
        <Rect x="0" y="0" width={width} height={height} fill="url(#wh-shade)" />
      </Svg>
    </Animated.View>
  );
}
