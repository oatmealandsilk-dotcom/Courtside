import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/lib/useReducedMotion';

import { useRestLength } from './restMotion';

const CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);

/**
 * A box whose height glides to fit what is inside it (Oct 22 sweep): a sheet
 * that swaps its rows for a "Thanks" note, a card that grows a row once its
 * numbers load, a form that adds or drops a section. It takes its first height
 * at once, so nothing moves on the first frame; every change after that
 * eases there over `duration` instead of jumping. The contents keep their own
 * size and are clipped while the box catches up.
 *
 * Its resting height is a plain style held by React (useRestLength), so an
 * iPhone that drops a settled animation value can never snap it back to an
 * older height on a later re-render (Oct 23).
 */
export function HeightGlide({ children, style, duration = 240 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; duration?: number }) {
  const reduce = useReducedMotion();
  const box = useRestLength('height');
  return (
    <Animated.View style={[{ overflow: 'hidden' }, style, box.style]}>
      <View
        onLayout={(e) => {
          const next = e.nativeEvent.layout.height;
          if (box.target.current == null || reduce) { box.jump(next); return; }
          if (next === box.target.current) return;
          box.glide(next, (to, done) => withTiming(to, { duration, easing: CURVE }, done));
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
