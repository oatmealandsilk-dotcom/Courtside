import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const SNAP = { duration: 300, easing: Easing.out(Easing.cubic) };

/**
 * A pinch over its children: the picture grows around the fingers and slides
 * with them while they are down, then snaps straight back (one quick move, no
 * bounce) when they lift — and the pinch says which way it went. Spreading
 * is "out", closing is "in"; a pinch that barely moves is ignored. One-finger
 * taps and swipes pass straight through.
 */
export function PinchZone({ children, onPinchOut, onPinchIn }: {
  children: React.ReactNode;
  onPinchOut: () => void;
  onPinchIn: () => void;
}) {
  const scale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
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
      scale.value = Math.max(0.8, Math.min(4, e.scale));
      driftX.value = e.focalX - focalX.value;
      driftY.value = e.focalY - focalY.value;
    })
    .onEnd((e) => {
      'worklet';
      if (e.scale > 1.18) runOnJS(onPinchOut)();
      else if (e.scale < 0.85) runOnJS(onPinchIn)();
    })
    // Finalize runs whether the pinch ended or was cancelled (the page's
    // scroll can take the touches mid-pinch): the picture always snaps back.
    .onFinalize(() => {
      'worklet';
      scale.value = withTiming(1, SNAP);
      driftX.value = withTiming(0, SNAP);
      driftY.value = withTiming(0, SNAP);
    }), [onPinchOut, onPinchIn, scale, focalX, focalY, driftX, driftY]);
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
