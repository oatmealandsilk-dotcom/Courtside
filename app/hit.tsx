import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

const COUNTDOWN = 5;

/**
 * A hit: one photo, taken right after a session, no retakes.
 *
 * The camera opens, a five-second count runs, the shutter fires on its own.
 * There is no capture button and no second try — what the camera saw at zero
 * is the hit. The only choice afterwards is whether to post it.
 */
export default function Hit() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { actions } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [failed, setFailed] = useState('');
  const flash = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  // The count starts the moment the camera is live, not on a tap.
  useEffect(() => {
    if (!ready || shot || count !== null) return;
    setCount(COUNTDOWN);
  }, [ready, shot, count]);

  useEffect(() => {
    if (count === null || shot) return;
    if (count === 0) {
      void capture();
      return;
    }
    haptics.tap();
    pulse.setValue(1.25);
    Animated.spring(pulse, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
    const timer = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, shot]);

  const capture = async () => {
    try {
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start();
      haptics.reward();
      const photo = await camera.current?.takePictureAsync({ quality: 0.85, skipProcessing: Platform.OS === 'android' });
      if (!photo?.uri) throw new Error('The camera did not return a photo.');
      setShot(photo.uri);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not take the photo.');
    }
  };

  // The photo is the hit; the caption and the posting happen in the same
  // composer a clip uses, so the two flows feel like one.
  useEffect(() => {
    if (!shot) return;
    router.replace({ pathname: '/compose', params: { mode: 'hit', shot } });
  }, [shot]);

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.centre, { paddingTop: insets.top }]}>
        <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
        <Text style={styles.title}>Camera needed</Text>
        <Text style={styles.note}>A hit is one live photo after a session. CourtSide needs the camera to take it.</Text>
        {permission.canAskAgain ? <Button label="Allow camera" onPress={() => requestPermission()} /> : <Button label="Open Settings" onPress={() => Linking.openSettings()} />}
        <Text style={styles.note}>You can change this any time in Settings → Permissions.</Text>
        <Button label="Not now" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  if (shot) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      {Platform.OS === 'web' ? <style>{'#hit-camera video { object-fit: contain !important; background: #000; }'}</style> : null}
      <CameraView
        ref={camera}
        nativeID="hit-camera"
        style={StyleSheet.absoluteFill}
        facing="front"
        mirror
        onCameraReady={() => setReady(true)}
        onMountError={(e) => setFailed(e.message)}
      />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'white', opacity: flash }]} />
      <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="close" size={24} color="white" />
        </Pressable>
        <View style={styles.tag}><Ionicons name="tennisball" size={12} color="white" /><Text style={styles.tagText}>ONE TAKE</Text></View>
      </View>
      <View style={styles.centre} pointerEvents="none">
        {failed ? (
          <Text style={[styles.note, { color: 'white' }]}>{failed}</Text>
        ) : count === null ? (
          <Text style={styles.getReady}>Getting the camera ready…</Text>
        ) : count > 0 ? (
          <Animated.Text style={[styles.count, { transform: [{ scale: pulse }] }]}>{count}</Animated.Text>
        ) : null}
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.xl }]} pointerEvents="none">
        <Text style={styles.hint}>{count === null ? '' : 'No retakes. Whatever the camera sees at zero is the hit.'}</Text>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    // On a computer the shell keeps its sidebar; the camera should own the window.
    ...(Platform.OS === 'web' ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 } as unknown as object) : null),
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  title: { ...typography.title, color: colors.text },
  note: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  topBar: { position: 'absolute', left: spacing.lg, right: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.45)' },
  tagText: { color: 'white', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  count: { fontSize: 140, fontWeight: '800', color: 'white', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 18 },
  getReady: { ...typography.body, color: 'white' },
  hint: { ...typography.small, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, gap: spacing.md },
  scrimTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 120, backgroundColor: 'rgba(0,0,0,0.35)' },
  scrimBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 200, backgroundColor: 'rgba(0,0,0,0.45)' },
  caption: { color: 'white', fontSize: 16, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.4)' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  discard: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  discardText: { ...typography.bodyStrong, color: 'white' },
  post: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: colors.brand },
  postText: { ...typography.bodyStrong, color: colors.brandInk },
});
