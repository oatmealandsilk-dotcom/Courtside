import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);
/** With `unclip`, the room kept round the contents for a card's soft shadow (the `lift`: 2px down, 10px soft). */
const SHADOW_ROOM = 12;

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
  /**
   * Leave room round the contents for a card's soft shadow (Oct 22). The fold
   * still clips, but the shadow sits inside it the whole time, so it never
   * appears all at once when the open ends or is cut the moment a close starts.
   * The room is taken back with negative margins, so the page's spacing is unchanged.
   */
  unclip?: boolean;
}) {
  // -1 until measured: open from the start, it is simply its own height on the first frame (no pop in once measured).
  const height = useSharedValue(-1);
  const progress = useSharedValue(open ? 1 : 0);
  const room = unclip ? SHADOW_ROOM : 0;
  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: open ? 260 : 200, easing: CURVE });
  }, [open, progress]);
  const style = useAnimatedStyle(() => {
    // The room above and below is given back in step with the fold, so a shut fold takes no space at all.
    const give = -room * Math.min(1, progress.value);
    if (height.value < 0) return progress.value >= 1 ? { opacity: 1, marginTop: -room, marginBottom: -room } : { height: 0, opacity: progress.value, marginTop: 0, marginBottom: 0 };
    return { height: progress.value * height.value, opacity: progress.value, marginTop: give, marginBottom: give };
  });
  return (
    <Animated.View
      style={[{ overflow: 'hidden', marginHorizontal: -room }, style]}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      {/* In the flow at its own height (the box above clips it), so it is measured even while shut. */}
      <View style={room ? { padding: room } : undefined} onLayout={(e) => { height.value = e.nativeEvent.layout.height; }}>
        {children}
      </View>
    </Animated.View>
  );
}
