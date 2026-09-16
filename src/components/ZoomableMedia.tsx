import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

/**
 * Pinch to look closer, let go and it springs back — Instagram's full-screen
 * zoom. The picture grows around your fingers and follows them while they
 * are down, so you can slide around a zoomed-in picture; only when the
 * fingers lift does it settle back. Whatever is inside (a playing clip) is
 * untouched; only its size and place change.
 */
export function ZoomableMedia({ children }: { children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  // How far the fingers have travelled since the pinch began: the picture
  // rides along with them.
  const driftX = useSharedValue(0);
  const driftY = useSharedValue(0);
  const width = useSharedValue(1);
  const height = useSharedValue(1);

  const pinch = useMemo(() => Gesture.Pinch()
    .onStart((e) => {
      'worklet';
      focalX.value = e.focalX;
      focalY.value = e.focalY;
      driftX.value = 0;
      driftY.value = 0;
    })
    .onUpdate((e) => {
      'worklet';
      scale.value = Math.max(1, Math.min(4, e.scale));
      driftX.value = e.focalX - focalX.value;
      driftY.value = e.focalY - focalY.value;
    })
    .onEnd(() => {
      'worklet';
      const settle = { damping: 16, stiffness: 180 };
      scale.value = withSpring(1, settle);
      driftX.value = withSpring(0, settle);
      driftY.value = withSpring(0, settle);
    }), [scale, focalX, focalY, driftX, driftY]);

  const style = useAnimatedStyle(() => {
    const dx = (focalX.value - width.value / 2) * (1 - scale.value) + driftX.value;
    const dy = (focalY.value - height.value / 2) * (1 - scale.value) + driftY.value;
    return { transform: [{ translateX: dx }, { translateY: dy }, { scale: scale.value }] };
  });

  return (
    <GestureDetector gesture={pinch}>
      <View style={StyleSheet.absoluteFill} onLayout={(e) => { width.value = e.nativeEvent.layout.width; height.value = e.nativeEvent.layout.height; }}>
        <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}
