import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);

/**
 * Opens and closes its contents with an eased height and fade, instead of
 * snapping into place. The contents stay mounted, hidden at zero height, so
 * their real height is known before the first open.
 *
 * It runs on the animation thread (Reanimated), so a busy moment in the app
 * (setup saving, the keyboard coming up) never makes it stutter.
 */
export function Collapse({ open, children, unclip = false }: {
  open: boolean;
  children: React.ReactNode;
  /** Once fully open, stop clipping, so a card's soft shadow inside shows whole (Oct 22). */
  unclip?: boolean;
}) {
  const height = useSharedValue(0);
  const progress = useSharedValue(open ? 1 : 0);
  const [settledOpen, setSettledOpen] = useState(open);
  useEffect(() => {
    if (!open) setSettledOpen(false);
    progress.value = withTiming(open ? 1 : 0, { duration: open ? 260 : 200, easing: CURVE }, (finished) => {
      if (finished && open) runOnJS(setSettledOpen)(true);
    });
  }, [open, progress]);
  const style = useAnimatedStyle(() => ({
    height: height.value ? progress.value * height.value : 0,
    opacity: progress.value,
  }));
  return (
    <Animated.View
      style={[{ overflow: unclip && settledOpen ? 'visible' : 'hidden' }, style]}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }} onLayout={(e) => { height.value = e.nativeEvent.layout.height; }}>
        {children}
      </View>
    </Animated.View>
  );
}
