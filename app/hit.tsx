import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
  const [caption, setCaption] = useState('');
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

  const post = () => {
    if (!shot) return;
    actions.addStory({ imageUrl: shot, thumbnailUrl: shot, caption: caption.trim() || undefined, mediaLabel: 'Hit' });
    router.back();
  };

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.centre, { paddingTop: insets.top }]}>
        <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
        <Text style={styles.title}>Camera needed</Text>
        <Text style={styles.note}>A hit is one live photo after a session. CourtSide needs the camera to take it.</Text>
        {permission.canAskAgain ? <Button label="Allow camera" onPress={() => requestPermission()} /> : <Text style={styles.note}>Turn on camera access for CourtSide in your phone's Settings.</Text>}
        <Button label="Not now" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  if (shot) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Image source={{ uri: shot }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.scrimTop} />
        <View style={styles.scrimBottom} />
        <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Discard this hit" onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="close" size={24} color="white" />
          </Pressable>
          <View style={styles.tag}><Ionicons name="tennisball" size={12} color="white" /><Text style={styles.tagText}>ONE TAKE</Text></View>
        </View>
        <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="How did it go? (optional)"
            placeholderTextColor="rgba(255,255,255,0.6)"
            style={styles.caption}
            maxLength={120}
            accessibilityLabel="Caption"
          />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.discard}>
              <Text style={styles.discardText}>Discard</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Post this hit" onPress={post} style={styles.post}>
              <Text style={styles.postText}>Post hit</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.brandInk} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={camera}
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
  root: { flex: 1, backgroundColor: '#000' },
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
