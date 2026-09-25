import React, { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Svg, { G, Line, Rect } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

const ARect = Animated.createAnimatedComponent(Rect);
const ALine = Animated.createAnimatedComponent(Line);

// Stroke lengths in the mark's own 100-unit box: the court's outline, the net, the post.
const COURT = 2 * (42.5 + 64.5);
const NET = 35;
const POST = 68;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * The CourtSide mark as strokes, drawing itself in — court, then net, then
 * post — the moment it appears. The one authored moment on a success card.
 * Anyone who has asked for less motion gets it drawn already.
 */
export function MarkDraw({ size = 34, color, play = true }: { size?: number; color?: string; play?: boolean }) {
  useTheme();
  const ink = color ?? colors.brand;
  const court = useSharedValue(COURT);
  const net = useSharedValue(NET);
  const post = useSharedValue(POST);

  useEffect(() => {
    let live = true;
    const settle = () => { court.value = 0; net.value = 0; post.value = 0; };
    if (!play) { settle(); return; }
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!live) return;
      if (reduced) { settle(); return; }
      court.value = withTiming(0, { duration: 640, easing: EASE });
      net.value = withDelay(360, withTiming(0, { duration: 420, easing: EASE }));
      post.value = withDelay(540, withTiming(0, { duration: 420, easing: EASE }));
    }).catch(settle);
    return () => { live = false; };
  }, [play, court, net, post]);

  const courtProps = useAnimatedProps(() => ({ strokeDashoffset: court.value }));
  const netProps = useAnimatedProps(() => ({ strokeDashoffset: net.value }));
  const postProps = useAnimatedProps(() => ({ strokeDashoffset: post.value }));

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="CourtSide logo" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <G transform="translate(41 50) skewX(-14) translate(-41 -50)" fill="none" stroke={ink} strokeLinecap="round">
          <ARect x="19.75" y="17.75" width="42.5" height="64.5" strokeWidth="7.5" strokeDasharray={`${COURT} ${COURT}`} animatedProps={courtProps} />
          <ALine x1="23.5" y1="50.45" x2="58.5" y2="50.45" strokeWidth="5.5" strokeDasharray={`${NET} ${NET}`} animatedProps={netProps} />
        </G>
        <G transform="translate(80.75 50) skewX(-14) translate(-80.75 -50)" fill="none" stroke={ink} strokeLinecap="round">
          <ALine x1="80.75" y1="16" x2="80.75" y2="84" strokeWidth="7.5" strokeDasharray={`${POST} ${POST}`} animatedProps={postProps} />
        </G>
      </Svg>
    </View>
  );
}
