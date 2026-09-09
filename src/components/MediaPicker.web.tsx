import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '@/theme';
import type { MediaPickerProps, PickedMedia } from './MediaPicker';

export type { PickedMedia, MediaPickerProps } from './MediaPicker';

/** Reads a video's duration so the caption can show "0:24" like Instagram. */
function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const done = (value: number | null) => {
      video.onloadedmetadata = null;
      video.onerror = null;
      resolve(value);
    };
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
    // Never hang the picker on a file the browser cannot decode.
    setTimeout(() => done(null), 4000);
  });
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Web media picker: opens the real file dialog, previews the selection
 * inline, and hands back a blob URL the feed can actually play.
 */
export function MediaPicker({ value, onChange }: MediaPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const createdUrl = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Release the blob URL when the picker unmounts or the choice changes.
  const revoke = useCallback(() => {
    if (createdUrl.current) {
      URL.revokeObjectURL(createdUrl.current);
      createdUrl.current = null;
    }
  }, []);
  useEffect(() => revoke, [revoke]);

  const onFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      setBusy(true);
      revoke();

      const url = URL.createObjectURL(file);
      createdUrl.current = url;
      const isVideo = file.type.startsWith('video');

      let label = file.name.replace(/\.[^.]+$/, '');
      if (isVideo) {
        const seconds = await probeDuration(url);
        if (seconds) label = `${label} · ${clock(seconds)}`;
      }

      const picked: PickedMedia = { uri: url, label, kind: isVideo ? 'video' : 'photo' };
      setBusy(false);
      onChange(picked);
    },
    [onChange, revoke],
  );

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*,video/*"
      style={{ display: 'none' }}
      onChange={(event) => {
        void onFiles(event.target.value ? (event.target as HTMLInputElement).files : null);
        event.target.value = '';
      }}
    />
  );

  if (value) {
    return (
      <View style={styles.preview}>
        {hiddenInput}
        {value.kind === 'video' && value.uri ? (
          <video
            src={value.uri}
            controls
            playsInline
            style={{ width: '100%', maxHeight: 320, borderRadius: 12, background: '#000' }}
          />
        ) : value.uri ? (
          <img
            src={value.uri}
            alt={value.label}
            style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 12 }}
          />
        ) : null}

        <View style={styles.previewFooter}>
          <Ionicons
            name={value.kind === 'video' ? 'videocam' : 'image'}
            size={16}
            color={colors.textMuted}
          />
          <Text style={styles.previewLabel} numberOfLines={1}>
            {value.label}
          </Text>
          <Pressable
            onPress={() => inputRef.current?.click()}
            accessibilityRole="button"
            style={styles.textButton}
          >
            <Text style={styles.textButtonLabel}>Replace</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              revoke();
              onChange(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Remove media"
            style={styles.textButton}
          >
            <Text style={[styles.textButtonLabel, { color: colors.danger }]}>Remove</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => inputRef.current?.click()}
      accessibilityRole="button"
      accessibilityLabel="Choose a photo or video"
      style={styles.dropzone}
    >
      {hiddenInput}
      <View style={styles.dropIcon}>
        <Ionicons name="images-outline" size={30} color={colors.textMuted} />
      </View>
      <Text style={styles.dropTitle}>{busy ? 'Reading file…' : 'Select a photo or video'}</Text>
      <Text style={styles.dropHint}>Tap to open your library. Videos play inline in the feed.</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dropzone: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  dropIcon: { marginBottom: spacing.xs },
  dropTitle: { ...typography.bodyStrong, color: colors.text },
  dropHint: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
  preview: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  previewFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  previewLabel: { ...typography.small, color: colors.textMuted, flex: 1 },
  textButton: { paddingVertical: 2 },
  textButtonLabel: { ...typography.smallStrong, color: colors.info },
});
