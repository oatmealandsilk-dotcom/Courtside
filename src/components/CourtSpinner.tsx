import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { colors } from '@/theme';
import { SIG } from '@/features/signature/look';
import Svg, { Line, Rect } from 'react-native-svg';

const ARect = Animated.createAnimatedComponent(Rect);
const PERIM = 2 * (14 + 22);

/** The court outline from above, faint, with one bright stretch of line running round it. */
function CourtTrace({ size, ink }: { size: number; ink?: string }) {
  const run = useSharedValue(0);
  useEffect(() => {
    run.value = withRepeat(withTiming(-PERIM, { duration: 1100, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(run);
  }, [run]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: run.value }));
  const faint = colors.border;
  const lead = ink ?? colors.textFaint;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={[styles.box, { width: size, height: size }]}>
      <Svg width={size * 0.64} height={size} viewBox="0 0 16 25" fill="none">
        <Rect x={1} y={1.5} width={14} height={22} rx={1} stroke={faint} strokeWidth={1.5} />
        <Line x1={1} y1={12.5} x2={15} y2={12.5} stroke={faint} strokeWidth={1.2} />
        <ARect x={1} y={1.5} width={14} height={22} rx={1} stroke={lead} strokeWidth={1.8} strokeLinecap="round" strokeDasharray={`14 ${PERIM - 14}`} animatedProps={props} />
      </Svg>
    </View>
  );
}

/**
 * CourtSide's loading sign: a bright arc with a softer tail sweeping round a
 * faint ring, in the theme colour. Sits over a clip while it fetches its first frame.
 */
export function CourtSpinner({ size = 40, ink }: { size?: number; ink?: string }) {
  useTheme();
  // Two arcs on one faint ring, turning at different speeds: a bright lead
  // and a softer tail that keeps catching up with it. It reads as motion with
  // pull rather than a ring going round.
  const lead = useSharedValue(0);
  const tail = useSharedValue(0);
  useEffect(() => {
    // Each turn starts slow and gathers pace, the way a real spinner does, not one flat speed.
    lead.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.bezier(0.55, 0.05, 0.45, 0.95) }), -1, false);
    tail.value = withRepeat(withTiming(360, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => { cancelAnimation(lead); cancelAnimation(tail); };
  }, [lead, tail]);
  const leadStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${lead.value}deg` }] }));
  const tailStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${tail.value + 120}deg` }] }));
  const colour = ink ?? colors.brand;
  // Design preview (?sig=1, web only): a court outline with a line tracing round it, in place of the arc.
  if (SIG) return <CourtTrace size={size} ink={ink} />;
  const stroke = Math.max(2.5, Math.round(size * 0.075));
  const ring = { borderRadius: size / 2, borderWidth: stroke, borderColor: 'transparent' } as const;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={[styles.box, { width: size, height: size }]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, borderWidth: stroke, borderColor: colour, opacity: 0.14 }]} />
      <Animated.View style={[StyleSheet.absoluteFill, tailStyle, ring, { borderTopColor: colour, borderRightColor: colour, opacity: 0.38 }]} />
      <Animated.View style={[StyleSheet.absoluteFill, leadStyle, ring, { borderTopColor: colour, borderRightColor: colour }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
