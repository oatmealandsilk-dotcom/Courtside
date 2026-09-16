import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const SNAP = { duration: 320, easing: Easing.out(Easing.cubic) };

/**
 * Pinch to look closer, let go and it snaps straight back — one quick move,
 * no bounce. The picture grows around your fingers and follows them while
 * they are down; one finger drags it around too. Every touch in here belongs
 * to the viewer, so a flick can never reach the feed underneath and pull the
 * page out from under the full-screen view.
 */
export function ZoomableMedia({ children }: { children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const driftX = useSharedValue(0);
  const driftY = useSharedValue(0);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
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
      scale.value = withTiming(1, SNAP);
      driftX.value = withTiming(0, SNAP);
      driftY.value = withTiming(0, SNAP);
    }), [scale, focalX, focalY, driftX, driftY]);

  // One finger: slides the picture, then it settles back. Claimed even when
  // nothing is zoomed, so the feed behind never sees the drag.
  const pan = useMemo(() => Gesture.Pan()
    .minDistance(4)
    .onUpdate((e) => {
      'worklet';
      panX.value = e.translationX;
      panY.value = e.translationY;
    })
    .onEnd(() => {
      'worklet';
      panX.value = withTiming(0, SNAP);
      panY.value = withTiming(0, SNAP);
    }), [panX, panY]);

  const gesture = useMemo(() => Gesture.Simultaneous(pinch, pan), [pinch, pan]);

  const style = useAnimatedStyle(() => {
    const dx = (focalX.value - width.value / 2) * (1 - scale.value) + driftX.value + panX.value;
    const dy = (focalY.value - height.value / 2) * (1 - scale.value) + driftY.value + panY.value;
    return { transform: [{ translateX: dx }, { translateY: dy }, { scale: scale.value }] };
  });

  return (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} onLayout={(e) => { width.value = e.nativeEvent.layout.width; height.value = e.nativeEvent.layout.height; }}>
        <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}
