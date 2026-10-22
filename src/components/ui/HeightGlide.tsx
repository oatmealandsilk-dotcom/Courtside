import React, { useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/lib/useReducedMotion';

const CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);

/**
 * A box whose height glides to fit what is inside it (Oct 22 sweep): a sheet
 * that swaps its rows for a "Thanks" note, a card that grows a row once its
 * numbers load, a form that adds or drops a section. It takes its first height
 * at once, so nothing moves on the first frame; every change after that
 * eases there over `duration` instead of jumping. The contents keep their own
 * size and are clipped while the box catches up.
 */
export function HeightGlide({ children, style, duration = 240 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; duration?: number }) {
  const reduce = useReducedMotion();
  const height = useSharedValue(-1);
  const known = useRef(false);
  const glide = useAnimatedStyle(() => (height.value < 0 ? {} : { height: height.value }));
  return (
    <Animated.View style={[{ overflow: 'hidden' }, style, glide]}>
      <View
        onLayout={(e) => {
          const next = e.nativeEvent.layout.height;
          if (!known.current || reduce) {
            known.current = true;
            height.value = next;
            return;
          }
          height.value = withTiming(next, { duration, easing: CURVE });
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
