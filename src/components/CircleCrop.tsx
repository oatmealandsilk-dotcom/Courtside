import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { measure } from '@/features/compose/photoEdit';
import { colors, radius, spacing, typography } from '@/theme';

const SPRING = { damping: 18, stiffness: 220 };

/**
 * A round crop for the profile picture: the photo sits under a circular
 * window, drag to move it, pinch to zoom, and it never lets the window show
 * anything but photo. Done cuts exactly what the circle shows.
 */
export function CircleCrop({ uri, onDone, onCancel }: { uri: string; onDone: (croppedUri: string) => void; onCancel: () => void }) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const D = Math.min(screenW, screenH) - 48;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { measure(uri).then(setSize).catch(() => setError('Could not read that photo.')); }, [uri]);

  // The photo starts covering the circle exactly; zoom only ever adds to that.
  const base = useMemo(() => (size ? D / Math.min(size.width, size.height) : 1), [size, D]);
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dispW = useSharedValue(D);
  const dispH = useSharedValue(D);
  useEffect(() => { if (size) { dispW.value = size.width * base; dispH.value = size.height * base; } }, [size, base, dispW, dispH]);

  /** The farthest the photo may slide before the circle would show its edge. */
  const clamp = (value: number, extent: number) => {
    'worklet';
    const room = Math.max(0, (extent - D) / 2);
    return Math.max(-room, Math.min(room, value));
  };
  const settle = () => {
    'worklet';
    const s = Math.max(1, Math.min(4, scale.value));
    scale.value = withSpring(s, SPRING);
    tx.value = withSpring(clamp(tx.value, dispW.value * s), SPRING);
    ty.value = withSpring(clamp(ty.value, dispH.value * s), SPRING);
  };
  const pan = Gesture.Pan()
    .onStart(() => { 'worklet'; startX.value = tx.value; startY.value = ty.value; })
    .onUpdate((e) => { 'worklet'; tx.value = startX.value + e.translationX; ty.value = startY.value + e.translationY; })
    .onEnd(() => { 'worklet'; settle(); });
  const pinch = Gesture.Pinch()
    .onStart(() => { 'worklet'; startScale.value = scale.value; })
    .onUpdate((e) => { 'worklet'; scale.value = Math.max(0.7, Math.min(5, startScale.value * e.scale)); })
    .onEnd(() => { 'worklet'; settle(); });
  const gesture = Gesture.Simultaneous(pan, pinch);
  const photoStyle = useAnimatedStyle(() => ({
    width: dispW.value, height: dispH.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const done = async () => {
    if (!size) return;
    setBusy(true);
    try {
      const s = Math.max(1, Math.min(4, scale.value));
      const x = clamp(tx.value, size.width * base * s);
      const y = clamp(ty.value, size.height * base * s);
      const px = base * s; // screen points per image pixel
      const shownW = size.width * px;
      const shownH = size.height * px;
      const originX = Math.max(0, Math.round((shownW / 2 - x - D / 2) / px));
      const originY = Math.max(0, Math.round((shownH / 2 - y - D / 2) / px));
      const side = Math.min(Math.round(D / px), size.width - originX, size.height - originY);
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

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.root}>
        <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
          <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={10}><Text style={styles.barText}>Cancel</Text></Pressable>
          <Text style={styles.title}>Move and scale</Text>
          <Pressable accessibilityRole="button" onPress={() => { void done(); }} disabled={busy || !size} hitSlop={10}><Text style={[styles.barText, styles.doneText, (busy || !size) && { opacity: 0.5 }]}>{busy ? 'Saving…' : 'Done'}</Text></Pressable>
        </View>
        <GestureDetector gesture={gesture}>
          <View style={styles.stage}>
            {size ? (
              <Animated.View style={[styles.photo, photoStyle]}>
                <Image accessibilityIgnoresInvertColors source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              </Animated.View>
            ) : null}
            {/* Everything outside the circle dims: a huge rounded border does the mask. */}
            <View pointerEvents="none" style={[styles.mask, { width: D, height: D, borderRadius: D / 2 + 2000 }]} />
            <View pointerEvents="none" style={[styles.ring, { width: D, height: D, borderRadius: D / 2 }]} />
          </View>
        </GestureDetector>
        <Text style={[styles.hint, { paddingBottom: insets.bottom + spacing.lg }]}>{error || 'Drag to move · pinch to zoom'}</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  barText: { ...typography.body, color: 'white' },
  doneText: { ...typography.bodyStrong, color: colors.brand },
  title: { ...typography.bodyStrong, color: 'white' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photo: { position: 'absolute', overflow: 'hidden', borderRadius: radius.sm },
  mask: { position: 'absolute', borderWidth: 2000, borderColor: 'rgba(0,0,0,0.62)', margin: -2000 },
  ring: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' },
  hint: { ...typography.small, color: 'rgba(255,255,255,0.7)', textAlign: 'center', paddingTop: spacing.md },
});
