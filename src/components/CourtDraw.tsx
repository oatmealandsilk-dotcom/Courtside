import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';
import { reduceMotionEnabled } from '@/lib/useReducedMotion';

const ARect = Animated.createAnimatedComponent(Rect);
const ALine = Animated.createAnimatedComponent(Line);
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

// The drawing's own box: a singles court lying across, 96 x 44 (about a real court's 2.17 : 1 with its posts).
const VW = 96;
const VH = 48;
const X0 = 4;
const Y0 = 6;
const CW = 88;
const CH = 36;
const OUTLINE = 2 * (CW + CH);
const SERVICE = CH;
const CENTRE = 48;
const NET = CH + 8;

/** How far along each stroke is at a point (0 to 1) of the draw-in: the outline first, then the service lines, centre line and net. */
const at = (t: number, from: number, span: number) => Math.min(1, Math.max(0, (t - from) / span));

/*
 * An empty page's picture (design preview, Oct 22, ?sig=1 on the web only):
 * a court seen from above, lying across, drawn in the theme's faint ink, with
 * its net, the two net posts and the centre marks, the net in the court's own
 * colour. It draws itself in once, as a line being traced, about 0.9 s; never
 * a fade. Anyone who asked for less motion gets it drawn already. No circle
 * or tile behind it. `frame` (0 to 1) holds it at one moment of the draw-in,
 * for the design board's stills.
 */
export function CourtDraw({ width = 96, play = true, frame }: { width?: number; play?: boolean; frame?: number }) {
  useTheme();
  const height = (width * VH) / VW;
  const still = frame != null;
  const t = frame ?? 1;
  const outline = useSharedValue(still ? OUTLINE * (1 - at(t, 0, 0.6)) : OUTLINE);
  const service = useSharedValue(still ? SERVICE * (1 - at(t, 0.33, 0.4)) : SERVICE);
  const centre = useSharedValue(still ? CENTRE * (1 - at(t, 0.45, 0.35)) : CENTRE);
  const net = useSharedValue(still ? NET * (1 - at(t, 0.6, 0.4)) : NET);
  useEffect(() => {
    if (still) return;
    let live = true;
    const settle = () => { outline.value = 0; service.value = 0; centre.value = 0; net.value = 0; };
    if (!play) { settle(); return; }
    reduceMotionEnabled().then((reduced) => {
      if (!live) return;
      if (reduced) { settle(); return; }
      outline.value = withTiming(0, { duration: 560, easing: EASE });
      service.value = withDelay(300, withTiming(0, { duration: 360, easing: EASE }));
      centre.value = withDelay(420, withTiming(0, { duration: 320, easing: EASE }));
      net.value = withDelay(560, withTiming(0, { duration: 340, easing: EASE }));
    }).catch(settle);
    return () => { live = false; };
  }, [still, play, outline, service, centre, net]);
  const o = useAnimatedProps(() => ({ strokeDashoffset: outline.value }));
  const s = useAnimatedProps(() => ({ strokeDashoffset: service.value }));
  const c = useAnimatedProps(() => ({ strokeDashoffset: centre.value }));
  const n = useAnimatedProps(() => ({ strokeDashoffset: net.value }));
  const ink = colors.textFaint;
  const svcL = X0 + 22;
  const svcR = X0 + CW - 22;
  const mid = X0 + CW / 2;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${VW} ${VH}`} fill="none">
        <ARect x={X0} y={Y0} width={CW} height={CH} rx={0.5} stroke={ink} strokeWidth={1.4} strokeDasharray={`${OUTLINE} ${OUTLINE}`} animatedProps={o} />
        <ALine x1={svcL} y1={Y0} x2={svcL} y2={Y0 + CH} stroke={ink} strokeWidth={1.2} strokeDasharray={`${SERVICE} ${SERVICE}`} animatedProps={s} />
        <ALine x1={svcR} y1={Y0} x2={svcR} y2={Y0 + CH} stroke={ink} strokeWidth={1.2} strokeDasharray={`${SERVICE} ${SERVICE}`} animatedProps={s} />
        <ALine x1={svcL} y1={Y0 + CH / 2} x2={svcR} y2={Y0 + CH / 2} stroke={ink} strokeWidth={1.2} strokeDasharray={`${CENTRE} ${CENTRE}`} animatedProps={c} />
        {/* The centre marks on each baseline. */}
        <Line x1={X0} y1={Y0 + CH / 2} x2={X0 + 2.5} y2={Y0 + CH / 2} stroke={still && t < 0.6 ? 'transparent' : ink} strokeWidth={1.2} />
        <Line x1={X0 + CW - 2.5} y1={Y0 + CH / 2} x2={X0 + CW} y2={Y0 + CH / 2} stroke={still && t < 0.6 ? 'transparent' : ink} strokeWidth={1.2} />
        <ALine x1={mid} y1={Y0 - 4} x2={mid} y2={Y0 + CH + 4} stroke={colors.brand} strokeWidth={1.8} strokeLinecap="round" strokeDasharray={`${NET} ${NET}`} animatedProps={n} />
        {/* The net posts, once the net is in (a still before then leaves them out). */}
        {still && t < 0.95 ? null : <Circle cx={mid} cy={Y0 - 4} r={1.6} fill={colors.brand} />}
        {still && t < 0.95 ? null : <Circle cx={mid} cy={Y0 + CH + 4} r={1.6} fill={colors.brand} />}
      </Svg>
    </View>
  );
}

/**
 * The AI coach's mark (design preview, ?sig=1): a coach's whistle, a 1.5
 * line in the given ink, no tile behind. Its own shape, so it never reads as
 * the clipboard the Coaching tab, Practice and Drills already use.
 */
export function CoachGlyph({ size = 20, color }: { size?: number; color?: string }) {
  useTheme();
  const ink = color ?? colors.textMuted;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      {/* The barrel and mouthpiece, as one outline. */}
      <Path d="M7.5 8.5 H17.25 a0.75 0.75 0 0 1 0.75 0.75 V11 a0.75 0.75 0 0 1 -0.75 0.75 H12.6" stroke={ink} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={7.5} cy={12.5} r={4.75} stroke={ink} strokeWidth={1.5} />
      <Circle cx={7.5} cy={12.5} r={1.4} fill={ink} />
      {/* The lanyard ring. */}
      <Circle cx={4} cy={5.5} r={1.6} stroke={ink} strokeWidth={1.2} />
      <Line x1={5.1} y1={6.6} x2={6.1} y2={8} stroke={ink} strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  );
}
