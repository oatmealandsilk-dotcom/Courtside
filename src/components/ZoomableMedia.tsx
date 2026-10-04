import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const SNAP = { duration: 320, easing: Easing.out(Easing.cubic) };
const TRAVEL = { duration: 280, easing: Easing.out(Easing.cubic) };

/** Where the picture lives on the page, in window points, so full screen can grow out of it and shrink back into it. */
export interface HomeRect { x: number; y: number; width: number; height: number; radius?: number }
export interface ZoomableMediaHandle { close: () => void }

export interface ZoomableMediaProps {
  children: React.ReactNode;
  onDismiss?: () => void;
  home?: HomeRect;
  /** Whether it grows out of `home` on opening (on by default). Off, it opens already full screen and only goes back into `home` on closing. */
  grow?: boolean;
  /**
   * Which swipe puts it away: sideways (the feed's viewer), or down, as in
   * Photos and iMessage, when it sits in a row of pictures that a sideways
   * swipe moves between. Down leaves sideways swipes to the row.
   */
  dismissOn?: 'sideways' | 'down';
}

/**
 * The full-screen viewer. Pinch to look closer and it snaps straight back;
 * one finger slides the picture, and a sideways swipe pushes the whole
 * window aside — the page behind shows through as it goes. Given the
 * picture's home on the page, it grows out of that spot on opening and, on
 * closing, travels back into it with its rounded corners, rather than fading.
 */
export const ZoomableMedia = forwardRef<ZoomableMediaHandle, ZoomableMediaProps>(function ZoomableMedia({ children, onDismiss, home, grow = true, dismissOn = 'sideways' }, ref) {
  const down = dismissOn === 'down';
  // Read once: a page that opened full screen never grows again when its row re-draws.
  const [growIn] = useState(!!home && grow);
  const scale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const driftX = useSharedValue(0);
  const driftY = useSharedValue(0);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const backdrop = useSharedValue(growIn ? 0 : 1);
  const leaving = useSharedValue(false);
  // 1 = sitting in its home on the page, 0 = filling the screen.
  const settle = useSharedValue(growIn ? 1 : 0);
  // 1 while the window is being pushed aside: the corners round the moment it starts moving.
  const pushing = useSharedValue(0);
  const width = useSharedValue(1);
  const height = useSharedValue(1);

  useEffect(() => {
    if (!growIn) return;
    settle.value = withTiming(0, TRAVEL);
    backdrop.value = withTiming(1, TRAVEL);
  }, [growIn, settle, backdrop]);

  const goHome = () => {
    'worklet';
    leaving.value = true;
    scale.value = withTiming(1, TRAVEL);
    driftX.value = withTiming(0, TRAVEL);
    driftY.value = withTiming(0, TRAVEL);
    panX.value = withTiming(0, TRAVEL);
    panY.value = withTiming(0, TRAVEL);
    backdrop.value = withTiming(0, TRAVEL);
    settle.value = withTiming(1, TRAVEL, (finished) => { if (finished && onDismiss) runOnJS(onDismiss)(); });
  };
  const slideOff = (dir: number, dy: number) => {
    'worklet';
    leaving.value = true;
    panX.value = withTiming(dir * width.value * 1.1, { duration: 240, easing: Easing.out(Easing.cubic) });
    panY.value = withTiming(dy * 1.3, { duration: 240, easing: Easing.out(Easing.cubic) });
    backdrop.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) }, (finished) => { if (finished && onDismiss) runOnJS(onDismiss)(); });
  };
  // Down and out of sight, for a picture with no home on the page to go back to.
  const dropAway = (dy: number) => {
    'worklet';
    leaving.value = true;
    panY.value = withTiming(Math.sign(dy || 1) * height.value * 1.05, { duration: 240, easing: Easing.out(Easing.cubic) });
    backdrop.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) }, (finished) => { if (finished && onDismiss) runOnJS(onDismiss)(); });
  };
  useImperativeHandle(ref, () => ({
    close: () => { if (home) goHome(); else if (down) dropAway(1); else slideOff(1, 0); },
  }), [home, down]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const raw = e.scale;
      scale.value = raw < 1 ? 1 - (1 - raw) * 0.4 : Math.min(4, 1 + (raw - 1) * 0.9);
      driftX.value = e.focalX - focalX.value;
      driftY.value = e.focalY - focalY.value;
    })
    .onEnd(() => {
      'worklet';
      scale.value = withTiming(1, SNAP);
      driftX.value = withTiming(0, SNAP);
      driftY.value = withTiming(0, SNAP);
    }), [scale, focalX, focalY, driftX, driftY]);

  const pan = useMemo(() => {
    const base = Gesture.Pan().minDistance(6).maxPointers(1);
    // Swiping down to close: the pan only starts on an up-or-down move and
    // gives way at once to a sideways one, which belongs to the row of pictures.
    const g = down ? base.activeOffsetY([-10, 10]).failOffsetX([-14, 14]) : base;
    return g
    .onUpdate((e) => {
      'worklet';
      if (e.numberOfPointers !== 1 || leaving.value) return;
      if (down && onDismiss && scale.value <= 1.02) {
        // The picture follows the finger down, and the page behind shows through the further it goes.
        panX.value = e.translationX * 0.25;
        panY.value = e.translationY;
        backdrop.value = 1 - Math.min(1, Math.abs(e.translationY) / (height.value * 0.6)) * 0.9;
        if (pushing.value === 0) pushing.value = withTiming(1, { duration: 140 });
        return;
      }
      const sideways = !down && Math.abs(e.translationX) > Math.abs(e.translationY) * 0.7;
      // Dragged up or down hard, it goes too (Oct 4, owner: "dragging out of this hard should take me out").
      if (onDismiss && scale.value <= 1.02 && !down && !sideways) {
        panX.value = e.translationX * 0.25;
        panY.value = e.translationY;
        backdrop.value = 1 - Math.min(1, Math.abs(e.translationY) / (height.value * 0.6)) * 0.9;
        if (pushing.value === 0) pushing.value = withTiming(1, { duration: 140 });
        return;
      }
      if (onDismiss && scale.value <= 1.02 && sideways) {
        // A window being pushed aside: it follows the finger, and the page
        // behind shows through more the further it goes.
        panX.value = e.translationX;
        panY.value = e.translationY * 0.5;
        backdrop.value = 1 - Math.min(1, Math.abs(e.translationX) / (width.value * 0.7)) * 0.9;
        if (pushing.value === 0) pushing.value = withTiming(1, { duration: 140 });
        return;
      }
      const give = scale.value > 1.02 ? 1 : 0.35;
      panX.value = e.translationX * give;
      panY.value = e.translationY * give;
    })
    .onEnd((e) => {
      'worklet';
      if (leaving.value) return;
      if (down) {
        if (onDismiss && scale.value <= 1.02 && (Math.abs(e.translationY) > 100 || Math.abs(e.velocityY) > 900)) {
          // Swiped away: back into its place on the page if it has one, else down off the screen.
          if (home) goHome(); else dropAway(e.translationY);
          return;
        }
        panX.value = withTiming(0, SNAP);
        panY.value = withTiming(0, SNAP);
        backdrop.value = withTiming(1, SNAP);
        pushing.value = withTiming(0, SNAP);
        return;
      }
      if (onDismiss && scale.value <= 1.02 && Math.abs(e.translationY) > Math.abs(e.translationX) && (Math.abs(e.translationY) > 110 || Math.abs(e.velocityY) > 900)) {
        if (home) goHome(); else dropAway(e.translationY);
        return;
      }
      const away = Math.abs(e.translationX) > 90 || Math.abs(e.velocityX) > 900;
      if (onDismiss && scale.value <= 1.02 && away && Math.abs(e.translationX) > Math.abs(e.translationY) * 0.7) {
        // Swiped away: back into its place on the page if it has one, else off the edge.
        if (home) goHome(); else slideOff(e.translationX >= 0 ? 1 : -1, e.translationY);
        return;
      }
      panX.value = withTiming(0, SNAP);
      panY.value = withTiming(0, SNAP);
      backdrop.value = withTiming(1, SNAP);
      pushing.value = withTiming(0, SNAP);
    })
    .onFinalize(() => {
      'worklet';
      if (leaving.value) return;
      backdrop.value = withTiming(1, SNAP);
      pushing.value = withTiming(0, SNAP);
      panX.value = withTiming(0, SNAP);
      panY.value = withTiming(0, SNAP);
      scale.value = withTiming(1, SNAP);
      driftX.value = withTiming(0, SNAP);
      driftY.value = withTiming(0, SNAP);
    });
  }, [panX, panY, scale, driftX, driftY, onDismiss, backdrop, leaving, width, height, home, pushing, down]); // eslint-disable-line react-hooks/exhaustive-deps

  const gesture = useMemo(() => Gesture.Simultaneous(pinch, pan), [pinch, pan]);

  const style = useAnimatedStyle(() => {
    const soften = (v: number, room: number) => (Math.abs(v) <= room ? v : Math.sign(v) * (room + (Math.abs(v) - room) * 0.3));
    const roomX = Math.max(0, (width.value * (scale.value - 1)) / 2);
    const roomY = Math.max(0, (height.value * (scale.value - 1)) / 2);
    const dx = soften((focalX.value - width.value / 2) * (1 - scale.value) + driftX.value + panX.value, roomX + 40);
    const dy = soften((focalY.value - height.value / 2) * (1 - scale.value) + driftY.value + panY.value, roomY + 40);
    const s = settle.value;
    const radius = home?.radius ?? 14;
    const rounding = Math.max(s, pushing.value);
    // Fully open, the box is pinned to the edges rather than given numbers,
    // so when the phone turns the system's own rotation carries it in one
    // move instead of waiting for a new measurement.
    const box = home && s > 0.001
      ? { left: home.x * s, top: home.y * s, right: undefined, bottom: undefined, width: width.value - (width.value - home.width) * s, height: height.value - (height.value - home.height) * s, borderRadius: radius * rounding }
      : { left: 0, top: 0, right: 0, bottom: 0, width: undefined, height: undefined, borderRadius: radius * rounding };
    return { ...box, overflow: 'hidden' as const, transform: [{ translateX: dx }, { translateY: dy }, { scale: scale.value }], opacity: home ? 1 : 0.35 + 0.65 * backdrop.value };
  });
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} onLayout={(e) => { width.value = e.nativeEvent.layout.width; height.value = e.nativeEvent.layout.height; }}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdropStyle]} />
        <Animated.View style={[{ position: 'absolute' }, style]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
});
