import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';
import { reduceMotionEnabled } from '@/lib/useReducedMotion';

const ARect = Animated.createAnimatedComponent(Rect);
const ALine = Animated.createAnimatedComponent(Line);
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

// Stroke lengths in the drawing's own 64 x 40 box.
const OUTLINE = 2 * (60 + 36);
const SERVICE = 32;
const CENTRE = 28;
const NET = 40;

/*
 * An empty page's picture (design preview, Oct 22, ?sig=1 on the web only):
 * a court seen from above, lying across, drawn in the theme's faint ink with
 * the net in the brand's green. It draws itself in once, as a line being
 * traced, about 0.9 s; never a fade. Anyone who asked for less motion gets
 * it drawn already. No circle or tile behind it.
 */
export function CourtDraw({ width = 64, play = true }: { width?: number; play?: boolean }) {
  useTheme();
  const height = (width * 40) / 64;
  const outline = useSharedValue(OUTLINE);
  const service = useSharedValue(SERVICE);
  const centre = useSharedValue(CENTRE);
  const net = useSharedValue(NET);
  useEffect(() => {
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
  }, [play, outline, service, centre, net]);
  const o = useAnimatedProps(() => ({ strokeDashoffset: outline.value }));
  const s = useAnimatedProps(() => ({ strokeDashoffset: service.value }));
  const c = useAnimatedProps(() => ({ strokeDashoffset: centre.value }));
  const n = useAnimatedProps(() => ({ strokeDashoffset: net.value }));
  const ink = colors.textFaint;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, height }}>
      <Svg width={width} height={height} viewBox="0 0 64 40" fill="none">
        <ARect x={2} y={2} width={60} height={36} rx={1} stroke={ink} strokeWidth={1.5} strokeDasharray={`${OUTLINE} ${OUTLINE}`} animatedProps={o} />
        <ALine x1={16} y1={4} x2={16} y2={36} stroke={ink} strokeWidth={1.5} strokeDasharray={`${SERVICE} ${SERVICE}`} animatedProps={s} />
        <ALine x1={48} y1={4} x2={48} y2={36} stroke={ink} strokeWidth={1.5} strokeDasharray={`${SERVICE} ${SERVICE}`} animatedProps={s} />
        <ALine x1={18} y1={20} x2={46} y2={20} stroke={ink} strokeWidth={1.5} strokeDasharray={`${CENTRE} ${CENTRE}`} animatedProps={c} />
        <ALine x1={32} y1={0} x2={32} y2={40} stroke={colors.brand} strokeWidth={2} strokeLinecap="round" strokeDasharray={`${NET} ${NET}`} animatedProps={n} />
      </Svg>
    </View>
  );
}

/**
 * The AI coach's mark (design preview, ?sig=1): a small court with a
 * clipboard's clip over its top, a 1.5 line in the given ink, no tile behind.
 */
export function CoachGlyph({ size = 20, color }: { size?: number; color?: string }) {
  useTheme();
  const ink = color ?? colors.textMuted;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x={4} y={3.5} width={12} height={15} rx={1.5} stroke={ink} strokeWidth={1.5} />
      <Rect x={7.5} y={1.75} width={5} height={3.5} rx={1} stroke={ink} strokeWidth={1.5} />
      <Line x1={4} y1={11} x2={16} y2={11} stroke={ink} strokeWidth={1.5} />
      <Line x1={10} y1={7.5} x2={10} y2={14.5} stroke={ink} strokeWidth={1} />
      <Line x1={6.5} y1={7.5} x2={13.5} y2={7.5} stroke={ink} strokeWidth={1} />
      <Line x1={6.5} y1={14.5} x2={13.5} y2={14.5} stroke={ink} strokeWidth={1} />
    </Svg>
  );
}
