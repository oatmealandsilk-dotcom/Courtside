import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setPendingShot } from '@/features/compose/pendingShot';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography, font } from '@/theme';

const COUNTDOWN = 5;

/**
 * A hit: one photo, taken right after a session, no retakes.
 *
 * The camera opens, a five-second count runs, the shutter fires on its own.
 * There is no capture button and no second try — what the camera saw at zero
 * is the hit. The only choice afterwards is whether to post it.
 */
/** Flips a picture left-to-right in the browser and returns it as a data URL. */
function mirrorPhoto(uri: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(uri); return; }
      ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(uri);
    img.src = uri;
  });
}

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
      // What you saw is what you get: the preview is a mirror, so the saved
      // photo is mirrored the same way. The phone does this itself; the
      // browser hands back the un-mirrored frame, so it is flipped here.
      setShot(Platform.OS === 'web' ? await mirrorPhoto(photo.uri) : photo.uri);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not take the photo.');
    }
  };

  // The photo is the hit; the caption and the posting happen in the same
  // composer a clip uses, so the two flows feel like one.
  const useShot = () => { if (!shot) return; setPendingShot(shot); router.replace({ pathname: '/compose', params: { mode: 'hit', shot: 'pending' } }); };
  // Another go: the count starts again the moment the camera is back.
  const retake = () => { setShot(null); setCount(null); };

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      // Quiet, the way a phone's own camera prompt looks: an outline icon,
      // plain white words, one small white button, and Not now under it.
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={8} style={styles.iconButton}>
            <Ionicons name="close" size={24} color="white" />
          </Pressable>
        </View>
        <View style={styles.gate}>
          <Ionicons name="camera-outline" size={30} color="rgba(255,255,255,0.7)" />
          <Text style={styles.gateTitle}>Allow camera access</Text>
          {/* What a hit is lives on the Hit option in the Create box; here it only says why the camera is asked for. */}
          <Text style={styles.gateBody}>CourtSide uses it to take your hit.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={permission.canAskAgain ? 'Allow camera' : 'Open Settings'}
            onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
            style={({ pressed }) => [styles.gateAllow, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.gateAllowText}>{permission.canAskAgain ? 'Allow camera' : 'Open Settings'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.gateLaterText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (shot) {
    return (
      <View style={styles.root}>
        <Image source={{ uri: shot }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel="Your hit" />
        <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="close" size={24} color="white" />
          </Pressable>
          <View style={styles.tag}><Ionicons name="tennisball" size={12} color="white" /><Text style={styles.tagText}>YOUR HIT</Text></View>
        </View>
        {/* A camera's own review row: retake on the left, the big send in the middle, the way a phone camera does it. */}
        <View style={[styles.reviewRow, { paddingBottom: insets.bottom + spacing.xl }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Retake" onPress={retake} style={styles.reviewSide}>
            <View style={styles.reviewSmall}><Ionicons name="refresh" size={22} color="white" /></View>
            <Text style={styles.reviewLabel}>Retake</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Use this hit" onPress={useShot} style={styles.reviewMain}>
            <View style={styles.reviewBig}><Ionicons name="arrow-forward" size={30} color={colors.brandInk} /></View>
            <Text style={styles.reviewLabel}>Use it</Text>
          </Pressable>
          <View style={styles.reviewSide} />
        </View>
      </View>
    );
  }

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
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, maxWidth: 380, width: '100%', alignSelf: 'center' },
  gateTitle: { fontSize: 17, ...font('600'), color: 'white', textAlign: 'center', marginTop: spacing.md },
  gateBody: { fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.55)', textAlign: 'center', maxWidth: 300, marginTop: 6 },
  gateAllow: { marginTop: spacing.lg, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 9, backgroundColor: 'white' },
  gateAllowText: { fontSize: 14, ...font('600'), color: '#000' },
  gateLaterText: { fontSize: 14, ...font('500'), color: 'rgba(255,255,255,0.55)', marginTop: spacing.md },
  note: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  topBar: { position: 'absolute', left: spacing.lg, right: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  reviewRow: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  reviewSide: { width: 72, alignItems: 'center', gap: 6 },
  reviewMain: { alignItems: 'center', gap: 6 },
  reviewSmall: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  reviewBig: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand, borderWidth: 4, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  reviewLabel: { ...typography.caption, color: 'white', letterSpacing: 0.5 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.45)' },
  tagText: { color: 'white', fontSize: 11, ...font('700'), letterSpacing: 1.2 },
  count: { fontSize: 140, ...font('700'), color: 'white', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 18 },
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
