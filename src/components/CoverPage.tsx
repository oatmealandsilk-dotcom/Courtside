import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { COVER_CELLS, CoverScrubber } from '@/components/CoverScrubber';
import { VideoSurface, type VideoSurfaceHandle } from '@/components/VideoSurface';
import { cropLayer } from '@/lib/crop';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useResponsive } from '@/lib/useResponsive';
import type { MediaCrop } from '@/data/types';
import { colors, spacing, typography } from '@/theme';

/**
 * Choosing a clip's cover, on its own calm page the way Instagram does it:
 * the chosen frame as big as it fits, the strip of frames under it, and a
 * quiet link to use a photo instead. Done in the top bar keeps the choice;
 * ✕ (or Android's back, or Escape) puts back the cover it opened with.
 *
 * The frame is cut as a finger lifts off the strip (`onSettle`), so the
 * cover is ready by the time Done is tapped. The page owns only where the
 * window is; the cover itself lives with whoever opened it.
 */
export function CoverPage({ visible, uri, from, to, start, photo, ratio, fit, crop, onSettle, onUpload, onDone, onCancel }: {
  visible: boolean;
  uri: string;
  /** The kept part of the clip, in seconds; `to` left out runs to the clip's end. */
  from: number;
  to?: number;
  /** Where the window starts: the cover's own moment. */
  start: number;
  /** The cover is an uploaded photo: shown instead of a frame, until the strip is touched. */
  photo?: string;
  /** Width over height of the picture. */
  ratio: number;
  fit: 'cover' | 'contain';
  crop?: MediaCrop;
  /** A frame was chosen (a finger lifted, a step taken): cut it and make it the cover. */
  onSettle: (seconds: number) => void;
  /** Use a photo instead. On the web this must open the file box straight from the tap. */
  onUpload: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const reduce = useReducedMotion();
  const still = useRef<VideoSurfaceHandle>(null);
  const [length, setLength] = useState(0);
  const end = to !== undefined && to > from ? to : length;
  const clamp = (seconds: number) => Math.max(from, end > from ? Math.min(end, seconds) : seconds);
  const [at, setAt] = useState(start);
  const atRef = useRef(start);
  // Touching the strip while a photo is the cover switches back to frames at once.
  const [showPhoto, setShowPhoto] = useState(!!photo);
  // Every opening starts on the cover as it is now.
  useEffect(() => {
    if (!visible) return;
    atRef.current = start;
    setAt(start);
    setShowPhoto(!!photo);
    still.current?.seek(start);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  // A photo chosen while the page is up shows straight away.
  useEffect(() => { if (photo) setShowPhoto(true); }, [photo]);

  const scrub = (seconds: number) => {
    const next = clamp(seconds);
    atRef.current = next;
    setAt(next);
    setShowPhoto(false);
    still.current?.seek(next);
  };
  const settle = (seconds: number) => { scrub(seconds); onSettle(clamp(seconds)); };
  const step = (direction: 1 | -1) => {
    if (end <= from) return;
    settle(atRef.current + (direction * (end - from)) / COVER_CELLS);
  };
  // Once the clip has loaded, the picture holds on the window's moment.
  const onDuration = useCallback((seconds: number) => {
    setLength(seconds);
    still.current?.seek(atRef.current);
  }, []);

  // On a computer: ← and → step a frame, Escape cancels. Taken before the
  // page underneath sees them (Escape there would close the whole composer).
  const keys = useRef({ step, onCancel });
  keys.current = { step, onCancel };
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); keys.current.onCancel(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopImmediatePropagation();
        keys.current.step(e.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [visible]);

  // The picture as big as fits between the bar and the strip, in its own shape.
  const [room, setRoom] = useState({ w: 0, h: 0 });
  const picW = room.w > 0 && room.h > 0 ? Math.min(room.w, room.h * ratio) : 0;
  const picH = picW ? picW / ratio : 0;

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType={reduce ? 'fade' : 'slide'} onRequestClose={onCancel}>
      <View style={styles.page}>
        <View style={styles.column}>
          <View style={[styles.bar, { paddingTop: isPhone ? insets.top + spacing.xl : Platform.OS !== 'web' ? Math.max(insets.top + spacing.xl, spacing.sm + spacing.xxl) : spacing.sm + spacing.xxl }]}>
            <View style={styles.barLeft}>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancel} hitSlop={10} style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}>
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
              <Text accessibilityRole="header" style={styles.title}>Cover</Text>
            </View>
            <Button label="Done" onPress={onDone} />
          </View>
          <View style={styles.stage} onLayout={(e) => setRoom({ w: e.nativeEvent.layout.width - spacing.lg * 2, h: e.nativeEvent.layout.height - spacing.sm * 2 })}>
            {picW ? (
              <View style={[styles.picture, { width: picW, height: picH }]}>
                <View style={cropLayer(crop)}>
                  <VideoSurface ref={still} uri={uri} muted paused fit={fit} from={from} onDuration={onDuration} />
                </View>
                {showPhoto && photo ? <Image accessibilityIgnoresInvertColors source={{ uri: photo }} resizeMode="cover" style={StyleSheet.absoluteFill} /> : null}
              </View>
            ) : null}
          </View>
          <View style={[styles.bottom, { paddingBottom: spacing.md + insets.bottom }]}>
            {end > from
              ? <CoverScrubber uri={uri} from={from} to={end} at={at} onScrub={scrub} onSettle={settle} onStep={step} hideWindow={showPhoto && !!photo} />
              : <View style={styles.stripWaiting} />}
            <Pressable accessibilityRole="button" accessibilityLabel={photo ? 'Choose another photo' : 'Use a photo instead'} onPress={onUpload} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
              <Ionicons name="image-outline" size={16} color={colors.textMuted} />
              <Text style={styles.linkText}>{photo ? 'Choose another photo' : 'Use a photo instead'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  // On a computer the page keeps the composer's own column.
  column: { flex: 1, width: '100%', maxWidth: 700, alignSelf: 'center' },
  // The same sizes as every page's header, so it lines up with the form under it.
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  barLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  close: { paddingVertical: spacing.xs },
  title: { ...typography.title, color: colors.text },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  picture: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  bottom: { paddingTop: 20, paddingHorizontal: spacing.lg },
  // The strip's own empty bar while the clip's length is read.
  stripWaiting: { height: 56, marginVertical: 4, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, marginTop: spacing.xs, alignSelf: 'center', paddingHorizontal: spacing.md },
  linkText: { ...typography.smallStrong, color: colors.textMuted },
});
