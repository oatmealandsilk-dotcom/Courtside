import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withDecay, withSpring, withTiming } from 'react-native-reanimated';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { measureForEdit } from '@/features/compose/photoEdit';
import * as haptics from '@/lib/haptics';
import { spacing, typography } from '@/theme';

/** How far past the edge a drag or a pinch may stretch before it resists, as a share of the overshoot. */
const RUBBER = 0.32;
const MAX_ZOOM = 5;
const SPRING = { damping: 26, stiffness: 260, mass: 0.9 };

/**
 * "Move and Scale" for the profile picture, the way the iPhone does it: the
 * photo sits under a round window on black. Drag to move it and it glides on
 * after a flick; pinch to zoom around your fingers; double-tap to zoom in or
 * back out. Past an edge, or past the zoom limits, it stretches a little and
 * springs back, so the circle never shows anything but photo. Choose cuts
 * exactly what the circle shows.
 */
export function CircleCrop({ uri, onDone, onCancel }: { uri: string; onDone: (croppedUri: string) => void; onCancel: () => void }) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const D = Math.min(screenW, screenH) - 32;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The true pixel size, after the phone's own rotation of the photo, so the cut lands where the circle was.
  useEffect(() => { measureForEdit(uri).then(setSize).catch(() => setError('Could not read that photo.')); }, [uri]);

  // At zoom 1 the photo just covers the circle; zoom only ever adds to that.
  const base = useMemo(() => (size ? D / Math.min(size.width, size.height) : 1), [size, D]);
  const photoW = useSharedValue(D);
  const photoH = useSharedValue(D);
  useEffect(() => { if (size) { photoW.value = size.width * base; photoH.value = size.height * base; } }, [size, base, photoW, photoH]);

  // Zoom and the photo centre's offset from the circle's centre, in points.
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const start = useSharedValue({ s: 1, x: 0, y: 0, fx: 0, fy: 0 });
  // Where the circle's centre is inside the stage, for turning finger positions into offsets.
  const centreX = useSharedValue(screenW / 2);
  const centreY = useSharedValue(screenH / 2);
  const shown = useSharedValue(0);
  useEffect(() => { if (size) shown.value = withTiming(1, { duration: 220 }); }, [size, shown]);

  /** How far the photo may sit off centre before the circle would show its edge. */
  const room = (extent: number) => {
    'worklet';
    return Math.max(0, (extent - D) / 2);
  };
  /** Past the limit, movement is only a fraction of the finger's: the stretch. */
  const rubber = (value: number, limit: number) => {
    'worklet';
    if (value > limit) return limit + (value - limit) * RUBBER;
    if (value < -limit) return -limit + (value + limit) * RUBBER;
    return value;
  };
  const rubberScale = (s: number) => {
    'worklet';
    if (s < 1) return 1 - (1 - s) * RUBBER;
    if (s > MAX_ZOOM) return MAX_ZOOM + (s - MAX_ZOOM) * RUBBER;
    return s;
  };
  /** Back inside the limits, springing, with the offset kept in step with the zoom. */
  const settle = () => {
    'worklet';
    const now = scale.value;
    const s = Math.max(1, Math.min(MAX_ZOOM, now));
    // A zoom that springs back in or out takes the offset with it, about the circle's centre.
    const k = s / now;
    const rx = room(photoW.value * s);
    const ry = room(photoH.value * s);
    const x = Math.max(-rx, Math.min(rx, tx.value * k));
    const y = Math.max(-ry, Math.min(ry, ty.value * k));
    scale.value = withSpring(s, SPRING);
    tx.value = withSpring(x, SPRING);
    ty.value = withSpring(y, SPRING);
  };

  // One finger moves the photo, stretching past the edges and gliding on after a flick.
  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => { 'worklet'; start.value = { s: scale.value, x: tx.value, y: ty.value, fx: 0, fy: 0 }; })
    .onUpdate((e) => {
      'worklet';
      tx.value = rubber(start.value.x + e.translationX, room(photoW.value * scale.value));
      ty.value = rubber(start.value.y + e.translationY, room(photoH.value * scale.value));
    })
    .onEnd((e) => {
      'worklet';
      const rx = room(photoW.value * scale.value);
      const ry = room(photoH.value * scale.value);
      // Already past an edge: straight back. Inside: glide on and stop at the edge with a small give.
      if (Math.abs(tx.value) > rx) tx.value = withSpring(Math.sign(tx.value) * rx, SPRING);
      else tx.value = withDecay({ velocity: e.velocityX, clamp: [-rx, rx], rubberBandEffect: true, rubberBandFactor: 0.6 });
      if (Math.abs(ty.value) > ry) ty.value = withSpring(Math.sign(ty.value) * ry, SPRING);
      else ty.value = withDecay({ velocity: e.velocityY, clamp: [-ry, ry], rubberBandEffect: true, rubberBandFactor: 0.6 });
    });

  // Two fingers zoom around the point between them, and move the photo as they move.
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      'worklet';
      start.value = { s: scale.value, x: tx.value, y: ty.value, fx: e.focalX - centreX.value, fy: e.focalY - centreY.value };
    })
    .onUpdate((e) => {
      'worklet';
      const s = rubberScale(start.value.s * e.scale);
      const fx = e.focalX - centreX.value;
      const fy = e.focalY - centreY.value;
      // The spot under the fingers when the pinch began stays under them.
      const k = s / start.value.s;
      tx.value = fx - (start.value.fx - start.value.x) * k;
      ty.value = fy - (start.value.fy - start.value.y) * k;
      scale.value = s;
    })
    .onEnd(() => { 'worklet'; settle(); });

  // Two taps: in to 2.5× around the tap, or back out to the whole photo.
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      'worklet';
      const zoomingIn = scale.value < 1.5;
      const s = zoomingIn ? 2.5 : 1;
      const fx = e.x - centreX.value;
      const fy = e.y - centreY.value;
      const k = s / scale.value;
      const rx = room(photoW.value * s);
      const ry = room(photoH.value * s);
      const x = zoomingIn ? fx - (fx - tx.value) * k : 0;
      const y = zoomingIn ? fy - (fy - ty.value) * k : 0;
      scale.value = withSpring(s, SPRING);
      tx.value = withSpring(Math.max(-rx, Math.min(rx, x)), SPRING);
      ty.value = withSpring(Math.max(-ry, Math.min(ry, y)), SPRING);
    });

  const gesture = Gesture.Simultaneous(pan, pinch, doubleTap);
  const photoStyle = useAnimatedStyle(() => ({
    width: photoW.value,
    height: photoH.value,
    opacity: shown.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const choose = async () => {
    if (!size) return;
    setBusy(true);
    haptics.tap();
    try {
      // Whatever the fingers left mid-spring, the cut uses the settled, in-bounds position.
      const s = Math.max(1, Math.min(MAX_ZOOM, scale.value));
      const px = base * s; // screen points per image pixel
      const shownW = size.width * px;
      const shownH = size.height * px;
      const x = Math.max(-(shownW - D) / 2, Math.min((shownW - D) / 2, tx.value));
      const y = Math.max(-(shownH - D) / 2, Math.min((shownH - D) / 2, ty.value));
      const originX = Math.max(0, Math.round((shownW / 2 - x - D / 2) / px));
      const originY = Math.max(0, Math.round((shownH / 2 - y - D / 2) / px));
      const side = Math.max(1, Math.min(Math.round(D / px), size.width - originX, size.height - originY));
      const context = ImageManipulator.manipulate(uri);
      context.crop({ originX, originY, width: side, height: side });
      if (side > 640) context.resize({ width: 640, height: 640 });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.88 });
      onDone(saved.uri);
    } catch {
      setError('Could not crop that photo.');
      setBusy(false);
    }
  };

  // The dark surround: a ring whose hole is exactly the circle, as wide as it needs to be to cover the screen.
  const ring = Math.max(screenW, screenH) * 1.5;
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.root}>
        <GestureDetector gesture={gesture}>
          <View
            style={styles.stage}
            onLayout={(e) => { centreX.value = e.nativeEvent.layout.width / 2; centreY.value = e.nativeEvent.layout.height / 2; }}
          >
            {size ? (
              <Animated.View style={[styles.photo, photoStyle]}>
                <Image accessibilityIgnoresInvertColors source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              </Animated.View>
            ) : null}
            <View pointerEvents="none" style={[styles.surround, { width: D + ring * 2, height: D + ring * 2, borderRadius: D / 2 + ring, borderWidth: ring }]} />
            <View pointerEvents="none" style={[styles.edge, { width: D, height: D, borderRadius: D / 2 }]} />
          </View>
        </GestureDetector>
        {/* The iPhone's layout: the title across the top, Cancel and Choose along the bottom. */}
        <View pointerEvents="none" style={[styles.titleBar, { paddingTop: insets.top + spacing.md }]}>
          <Text style={styles.title}>Move and Scale</Text>
        </View>
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={12} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.button}>Cancel</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => { void choose(); }} disabled={busy || !size} hitSlop={12} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={[styles.button, styles.choose, (busy || !size) && { opacity: 0.45 }]}>{busy ? 'Saving…' : 'Choose'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Photo editing is always shown on black, the way the phone's own editor does it, whatever the theme.
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  stage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photo: { position: 'absolute' },
  surround: { position: 'absolute', borderColor: 'rgba(0,0,0,0.6)' },
  edge: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(255,255,255,0.55)' },
  titleBar: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  title: { ...typography.bodyStrong, color: 'white', fontSize: 17 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  button: { ...typography.body, color: 'white', fontSize: 17 },
  choose: { fontWeight: '600' },
  pressed: { opacity: 0.5 },
  error: { ...typography.small, color: 'rgba(255,255,255,0.75)', flex: 1, textAlign: 'center' },
});
