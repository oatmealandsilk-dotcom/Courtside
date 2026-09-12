import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

export interface CoverFrame { time: number; dataUrl: string }

/**
 * Pulls evenly spaced frames out of a video by seeking and painting each one
 * onto a canvas. The frame at t=0 comes back first and becomes the default
 * cover. Anything the browser cannot decode yields an empty list, and the
 * caller falls back to the placeholder art rather than blocking the post.
 */
async function grabFrames(url: string, count = 6): Promise<CoverFrame[]> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  const ready = await new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => {
      video.onloadeddata = null;
      video.onerror = null;
      resolve(ok);
    };
    video.onloadeddata = () => done(true);
    video.onerror = () => done(false);
    setTimeout(() => done(false), 6000);
  });
  if (!ready || !Number.isFinite(video.duration) || video.duration <= 0) return [];

  const canvas = document.createElement('canvas');
  const ratio = video.videoWidth ? video.videoHeight / video.videoWidth : 16 / 9;
  canvas.width = 240;
  canvas.height = Math.round(240 * ratio) || 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const { duration } = video;
  const frames: CoverFrame[] = [];
  for (let i = 0; i < count; i += 1) {
    const time = Math.min((duration * i) / count, Math.max(0, duration - 0.05));
    const seeked = await new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        video.onseeked = null;
        video.onerror = null;
        resolve(ok);
      };
      video.onseeked = () => done(true);
      video.onerror = () => done(false);
      try {
        video.currentTime = time;
      } catch {
        done(false);
      }
      setTimeout(() => done(false), 3000);
    });
    if (!seeked) continue;
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ time, dataUrl: canvas.toDataURL('image/jpeg', 0.72) });
    } catch {
      // A frame the canvas refuses to export just gets skipped.
    }
  }
  return frames;
}

/**
 * Web media picker: opens the real file dialog, previews the selection
 * inline, and hands back a blob URL the feed can actually play.
 */
export function MediaPicker({ value, onChange, compact, selection = 'all', label }: MediaPickerProps) {
  const styles = useThemedStyles(styleDefinitions);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const createdUrl = useRef<string | null>(null);
  const coverUrl = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [frames, setFrames] = useState<CoverFrame[]>([]);

  // Release the blob URL when the picker unmounts or the choice changes.
  const revoke = useCallback(() => {
    if (createdUrl.current) {
      URL.revokeObjectURL(createdUrl.current);
      createdUrl.current = null;
    }
    if (coverUrl.current) {
      URL.revokeObjectURL(coverUrl.current);
      coverUrl.current = null;
    }
  }, []);
  // Selected object URLs remain usable by posts after the composer closes.

  const onFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (selection === 'video' && !file.type.startsWith('video/')) return;
      if (selection === 'photo' && !file.type.startsWith('image/')) return;
      if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) return;
      setBusy(true);
      revoke();

      const url = URL.createObjectURL(file);
      createdUrl.current = url;
      const isVideo = file.type.startsWith('video');

      let label = file.name.replace(/\.[^.]+$/, '');
      let cover: string | undefined;
      let shots: CoverFrame[] = [];

      if (isVideo) {
        const seconds = await probeDuration(url);
        if (seconds) label = `${label} · ${clock(seconds)}`;
        // Offer a choice of frames, defaulting to the first one.
        shots = await grabFrames(url);
        cover = shots[0]?.dataUrl;
      } else {
        // A photo is its own cover.
        cover = url;
      }

      setFrames(shots);
      const picked: PickedMedia = {
        uri: url,
        label,
        kind: isVideo ? 'video' : 'photo',
        thumbnailUrl: cover,
      };
      setBusy(false);
      onChange(picked);
    },
    [onChange, revoke, selection],
  );

  const onCoverFile = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file || !file.type.startsWith('image/') || !value) return;
      if (coverUrl.current) URL.revokeObjectURL(coverUrl.current);
      const url = URL.createObjectURL(file);
      coverUrl.current = url;
      onChange({ ...value, thumbnailUrl: url });
    },
    [onChange, value],
  );

  const hiddenCoverInput = (
    <input
      ref={coverInputRef}
      type="file"
      accept="image/*"
      style={{ display: 'none' }}
      onChange={(event) => {
        onCoverFile(event.target.value ? (event.target as HTMLInputElement).files : null);
        event.target.value = '';
      }}
    />
  );

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept={selection === 'video' ? 'video/*' : selection === 'photo' ? 'image/*' : 'image/*,video/*'}
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
{/* Portrait stage, the shape a reel actually posts in, so what you see
            here is what people will see in the feed. */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {value.kind === 'video' && value.uri ? (
            <video
              src={value.uri}
              controls
              playsInline
              style={{
                width: '100%', maxWidth: 320, aspectRatio: '9 / 16', maxHeight: 460,
                borderRadius: 14, background: '#000', objectFit: 'contain',
              }}
            />
          ) : value.uri ? (
            <img
              src={value.uri}
              alt={value.label}
              style={{
                width: '100%', maxWidth: 320, maxHeight: 460,
                objectFit: 'contain', borderRadius: 14, background: '#000',
              }}
            />
          ) : null}
        </div>

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
              setFrames([]);
              onChange(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Remove media"
            style={styles.textButton}
          >
            <Text style={[styles.textButtonLabel, { color: colors.danger }]}>Remove</Text>
          </Pressable>
        </View>

        {value.kind === 'video' ? (
          <View style={styles.coverBlock}>
            {hiddenCoverInput}
            <Text style={styles.coverTitle}>Cover</Text>
            <Text style={styles.coverHint}>
              {frames.length
                ? 'Pick the frame people see before it plays.'
                : 'We could not read frames from this file, so it will use the placeholder art.'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coverRow}>
              {frames.map((frame) => {
                const active = value.thumbnailUrl === frame.dataUrl;
                return (
                  <Pressable
                    key={frame.time}
                    onPress={() => onChange({ ...value, thumbnailUrl: frame.dataUrl })}
                    accessibilityRole="button"
                    accessibilityLabel={`Use the frame at ${clock(frame.time)} as the cover`}
                    style={[styles.coverTile, active && styles.coverTileActive]}
                  >
                    <img
                      src={frame.dataUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => coverInputRef.current?.click()}
                accessibilityRole="button"
                accessibilityLabel="Upload your own cover image"
                style={[styles.coverTile, styles.coverUpload]}
              >
                <Ionicons name="image-outline" size={18} color={colors.textMuted} />
                <Text style={styles.coverUploadLabel}>Upload</Text>
              </Pressable>
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => inputRef.current?.click()}
      accessibilityRole="button"
      accessibilityLabel={label ?? 'Choose a photo or video'}
      style={compact ? styles.choice : styles.dropzone}
    >
      {hiddenInput}
      <View style={styles.dropIcon}>
        <Ionicons name={selection === 'video' ? 'videocam-outline' : 'images-outline'} size={30} color={colors.textMuted} />
      </View>
      <Text style={styles.dropTitle}>{busy ? 'Reading file…' : label ?? (compact ? 'Photo or video' : 'Select a photo or video')}</Text>
      <Text style={styles.dropHint}>{selection === 'video' ? 'Share a video from your device.' : 'Choose from your photos and videos.'}</Text>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  choice: { padding: 20, borderRadius: 18, backgroundColor: colors.surface, gap: 6 },
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
  coverBlock: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  coverTitle: { ...typography.smallStrong, color: colors.text },
  coverHint: { ...typography.small, color: colors.textFaint },
  coverRow: { gap: spacing.sm, paddingTop: spacing.sm, paddingRight: spacing.sm },
  coverTile: {
    width: 54,
    height: 74,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
  },
  coverTileActive: { borderColor: colors.brand },
  coverUpload: { alignItems: 'center', justifyContent: 'center', gap: 3, borderColor: colors.border },
  coverUploadLabel: { ...typography.caption, color: colors.textMuted },
  textButton: { paddingVertical: 2 },
  textButtonLabel: { ...typography.smallStrong, color: colors.info },
});
