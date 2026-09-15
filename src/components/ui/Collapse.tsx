import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

/**
 * Opens and closes its contents with an eased height and fade, instead of
 * snapping into place. The contents stay mounted, hidden at zero height, so
 * their real height is known before the first open.
 */
export function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [height, setHeight] = useState(0);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 260 : 200,
      easing: Easing.bezier(0.22, 0.61, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }, [open, progress]);
  const animatedHeight = height ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) : 0;
  return (
    <Animated.View
      style={{ height: animatedHeight, opacity: progress, overflow: 'hidden' }}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
        {children}
      </View>
    </Animated.View>
  );
}
