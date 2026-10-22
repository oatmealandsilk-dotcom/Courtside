import React, { useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);

/**
 * Its contents always show; when they change height (a form swapped in for a
 * row, a clip picker in place of "Add a clip"), the box eases to the new
 * height instead of jumping, and everything below glides with it. The first
 * height is taken as it is, so a page opens already in place.
 *
 * Runs on the animation thread (Reanimated), on a phone and in a browser.
 * Only the height moves, never opacity, so it is safe around glass.
 */
export function GlideHeight({ children, style, duration = 240 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; duration?: number }) {
  const height = useSharedValue(-1);
  // Until the first measure the contents size the box as usual (no empty first frame);
  // after it they float inside it, so the box can ease while they change.
  const [measured, setMeasured] = useState(false);
  const first = useRef(true);
  const box = useAnimatedStyle(() => (height.value < 0 ? {} : { height: height.value }));
  return (
    <Animated.View style={[{ overflow: 'hidden' }, style, box]}>
      <View
        style={measured ? { position: 'absolute', left: 0, right: 0, top: 0 } : null}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (first.current) { first.current = false; height.value = h; setMeasured(true); return; }
          height.value = withTiming(h, { duration, easing: CURVE });
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
