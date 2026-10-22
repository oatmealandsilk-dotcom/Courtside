import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);

/**
 * Opens and closes its contents with an eased height and fade, instead of
 * snapping into place. The contents stay mounted, hidden at zero height, so
 * their real height is known before the first open; one open from the start
 * is drawn at its own height on the very first frame.
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
  // -1 until measured: open from the start, it is simply its own height on the first frame (no pop in once measured).
  const height = useSharedValue(-1);
  const progress = useSharedValue(open ? 1 : 0);
  const [settledOpen, setSettledOpen] = useState(open);
  useEffect(() => {
    if (!open) setSettledOpen(false);
    progress.value = withTiming(open ? 1 : 0, { duration: open ? 260 : 200, easing: CURVE }, (finished) => {
      if (finished && open) runOnJS(setSettledOpen)(true);
    });
  }, [open, progress]);
  const style = useAnimatedStyle(() => {
    if (height.value < 0) return progress.value >= 1 ? { opacity: 1 } : { height: 0, opacity: progress.value };
    return { height: progress.value * height.value, opacity: progress.value };
  });
  return (
    <Animated.View
      style={[{ overflow: unclip && settledOpen ? 'visible' : 'hidden' }, style]}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      {/* In the flow at its own height (the box above clips it), so it is measured even while shut. */}
      <View onLayout={(e) => { height.value = e.nativeEvent.layout.height; }}>
        {children}
      </View>
    </Animated.View>
  );
}
