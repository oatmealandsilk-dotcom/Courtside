import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, withTiming } from 'react-native-reanimated';

import { useRestLength } from './restMotion';

const CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);

/**
 * Its contents always show; when they change height (a form swapped in for a
 * row, a clip picker in place of "Add a clip"), the box eases to the new
 * height instead of jumping, and everything below glides with it. The first
 * height is taken as it is, so a page opens already in place.
 *
 * Runs on the animation thread (Reanimated), on a phone and in a browser.
 * Only the height moves, never opacity, so it is safe around glass.
 *
 * Its resting height is a plain style held by React (useRestLength): the
 * animation only clamps it while it moves, so an iPhone that drops a settled
 * animation value can never fold the box shut on a later re-render (Oct 23).
 */
export function GlideHeight({ children, style, contentStyle, duration = 240 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; /** On the inner box that holds the contents (a gap between them, say). */ contentStyle?: StyleProp<ViewStyle>; duration?: number }) {
  const box = useRestLength('height');
  // Until the first measure the contents size the box as usual (no empty first frame);
  // after it they float inside it, so the box can ease while they change.
  const measured = box.rest != null;
  return (
    <Animated.View style={[{ overflow: 'hidden' }, style, box.style]}>
      <View
        style={[contentStyle, measured ? { position: 'absolute', left: 0, right: 0, top: 0 } : null]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (box.target.current == null) { box.jump(h); return; }
          if (h === box.target.current) return;
          box.glide(h, (to, done) => withTiming(to, { duration, easing: CURVE }, done));
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
