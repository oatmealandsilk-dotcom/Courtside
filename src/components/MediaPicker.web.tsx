import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '@/theme';
import type { MediaPickerProps, PickedMedia } from './MediaPicker';
import { ClipPlayback } from './ClipPlayback';
import { ClipVideo } from './ClipVideo';
import { ZoomableMedia } from './ZoomableMedia';
import { cropCss } from '@/lib/crop';
import { framesAt } from '@/features/compose/frames';
import { CoverScrubber } from './CoverScrubber';
import { VideoSurface, type VideoSurfaceHandle } from './VideoSurface';

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
    video.onloadedmetadata = () => {
      if (video.videoWidth && video.videoHeight) lastProbedShape = video.videoWidth > video.videoHeight ? 'landscape' : 'portrait';
      done(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => done(null);
    video.src = url;
    // Never hang the picker on a file the browser cannot decode.
    setTimeout(() => done(null), 4000);
  });
}
/** Shape of the video probeDuration last read: taller or wider than it is high. Reset before every read. */
let lastProbedShape: 'portrait' | 'landscape' | null = null;

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface CoverFrame { time: number; dataUrl: string }

/** Shape of the last video grabFrames read, so the picker can default the stage. */
let lastShape: 'portrait' | 'landscape' = 'portrait';

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

  lastShape = video.videoWidth > video.videoHeight ? 'landscape' : 'portrait';
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

/** "beach-rally-final-v2 · 0:24" is a filename. "Video · 0:24" is information. */
function describe(media: PickedMedia): string {
  const duration = media.label.match(/\d+:\d{2}$/)?.[0];
  if (media.kind === 'video') return duration ? `Video · ${duration}` : 'Video';
  return 'Photo';
}

/**
 * Opens the browser's file dialog straight away. Must be called from a click,
 * which is why the + menu calls it directly rather than after a hop.
 */
export function pickFromDevice(selection: 'video' | 'photo' | 'all'): Promise<PickedMedia | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = selection === 'video' ? 'video/*' : selection === 'photo' ? 'image/*' : 'image/*,video/*';
    input.style.display = 'none';
    let settled = false;
    const finish = (value: PickedMedia | null) => { if (!settled) { settled = true; resolve(value); input.remove(); } };
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video');
      let label = file.name.replace(/\.[^.]+$/, '');
      let cover: string | undefined;
      let shape: 'portrait' | 'landscape' = 'portrait';
      if (isVideo) {
        lastProbedShape = null;
        const seconds = await probeDuration(url);
        if (seconds) label = `${label} · ${clock(seconds)}`;
        const shots = await grabFrames(url);
        cover = shots[0]?.dataUrl;
        // The file's own shape, read as its details loaded; the frame grab is a second opinion.
        shape = lastProbedShape ?? (shots.length ? lastShape : 'portrait');
      } else {
        cover = url;
        shape = await new Promise((r) => { const img = new Image(); img.onload = () => r(img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait'); img.onerror = () => r('portrait'); img.src = url; });
      }
      finish({ uri: url, label, kind: isVideo ? 'video' : 'photo', thumbnailUrl: cover, orientation: shape });
    };
    // Cancelling the dialog fires no change event; a focus return is the cue.
    window.addEventListener('focus', () => setTimeout(() => { if (!input.files?.length) finish(null); }, 800), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export function MediaPicker({ value, onChange, compact, selection = 'all', label, bare = false, orientation = 'portrait', trim, noCover = false }: MediaPickerProps) {
  const styles = useThemedStyles(styleDefinitions);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const createdUrl = useRef<string | null>(null);
  const coverUrl = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [frames, setFrames] = useState<CoverFrame[]>([]);
  // The cover chooser under the preview, opened by its Edit cover button: a
  // strip to drag along. While it is open the preview holds still on the
  // moment under the bar.
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverAt, setCoverAt] = useState<number | null>(null);
  const [clipLength, setClipLength] = useState(0);
  const still = useRef<VideoSurfaceHandle>(null);
  const [expanded, setExpanded] = useState(false);

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

      let shape: 'portrait' | 'landscape' = 'portrait';
      if (isVideo) {
        const seconds = await probeDuration(url);
        if (seconds) label = `${label} · ${clock(seconds)}`;
        // Offer a choice of frames, defaulting to the first one.
        shots = await grabFrames(url);
        cover = shots[0]?.dataUrl;
        shape = lastShape;
      } else {
        // A photo is its own cover.
        cover = url;
        shape = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait');
          img.onerror = () => resolve('portrait');
          img.src = url;
        });
      }

      setFrames(shots);
      const picked: PickedMedia = {
        uri: url,
        label,
        kind: isVideo ? 'video' : 'photo',
        thumbnailUrl: cover,
        orientation: shape,
      };
      setBusy(false);
      onChange(picked);
    },
    [onChange, revoke, selection],
  );

  // The kept part of the clip, for the cover strip. Without a trim end, the
  // clip's own length is read once.
  const keepFrom = Math.max(0, trim?.trimStart ?? 0);
  useEffect(() => {
    if (!value || value.kind !== 'video' || !value.uri || noCover) return;
    let cancelled = false;
    probeDuration(value.uri).then((seconds) => { if (!cancelled && seconds) setClipLength(seconds); });
    return () => { cancelled = true; };
  }, [value?.uri, value?.kind, noCover]); // eslint-disable-line react-hooks/exhaustive-deps
  const keepTo = trim?.trimEnd && trim.trimEnd > keepFrom ? trim.trimEnd : clipLength;
  const scrubCover = (seconds: number) => { setCoverAt(seconds); still.current?.seek(seconds); };
  const settleCover = (seconds: number) => {
    if (!value?.uri) return;
    const picked = value;
    framesAt(picked.uri!, [seconds], 720).then((got) => { if (got[0]) onChange({ ...picked, thumbnailUrl: got[0].uri }); });
  };

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
      <View style={bare ? styles.bare : styles.preview}>
        {hiddenInput}
        {bare ? (
          // The media is the whole box: the cover frame edge to edge with a
          // play badge, the way it will sit in the feed. Tap to watch it.
          <div
            // The box keeps the post's own shape even when the screen is short:
            // it gets narrower instead of cutting off the top and bottom, so the
            // whole picture shows, exactly as it will in the feed.
            style={{ position: 'relative', width: orientation === 'landscape' ? 'min(100%, calc(62vh * 16 / 9))' : 'min(100%, calc(62vh * 9 / 16))', aspectRatio: orientation === 'landscape' ? '16 / 9' : '9 / 16', margin: '0 auto', borderRadius: 16, overflow: 'hidden', background: '#000', cursor: 'zoom-in' }}
            onClick={() => { if (!coverOpen) setExpanded(true); }}
            role="button"
            tabIndex={0}
            aria-label="Open a larger preview"
            onKeyDown={(event) => { if (!coverOpen && (event.key === 'Enter' || event.key === ' ')) setExpanded(true); }}
          >
            {value.kind === 'video' && value.uri && coverOpen ? (
              // Choosing a cover: the picture holds on the moment under the bar.
              <div style={cropCss(trim?.crop)}><VideoSurface ref={still} uri={value.uri} muted paused fit={orientation === 'landscape' ? 'contain' : 'cover'} from={keepFrom} onDuration={() => still.current?.seek(coverAt ?? keepFrom)} /></div>
            ) : value.kind === 'video' && value.uri ? (
              // Plays the way it will in the feed: looped, muted, edge to edge.
              <div style={cropCss(trim?.crop)}><ClipVideo uri={value.uri} poster={value.thumbnailUrl} active muted fit={orientation === 'landscape' ? 'contain' : 'cover'} trimStart={trim?.trimStart} trimEnd={trim?.trimEnd} /></div>
            ) : value.uri ? (
              <img src={value.uri} alt={describe(value)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : null}

            {value.kind === 'video' && !noCover ? (
              <button
                type="button"
                aria-label={coverOpen ? 'Done choosing a cover' : 'Edit cover'}
                aria-expanded={coverOpen}
                onClick={(event) => { event.stopPropagation(); setCoverOpen((o) => !o); }}
                onKeyDown={(event) => event.stopPropagation()}
                // Frosted glass over the video, like the editor's Sound button;
                // CourtSide blue while the cover strip is open. The words are an
                // app Text, so they wear the app's font, not the browser's serif.
                style={{
                  position: 'absolute', right: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px 8px 11px', borderRadius: 999, cursor: 'pointer', margin: 0,
                  border: coverOpen ? '1px solid transparent' : '1px solid rgba(255,255,255,0.28)',
                  background: coverOpen ? colors.brand : 'rgba(10,14,20,0.52)',
                  backdropFilter: 'blur(12px) saturate(140%)', WebkitBackdropFilter: 'blur(12px) saturate(140%)',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.28)', transition: 'background 160ms ease, border-color 160ms ease',
                }}
              >
                <Ionicons name={coverOpen ? 'checkmark' : 'image-outline'} size={15} color={coverOpen ? colors.brandInk : 'white'} />
                <Text style={[styles.coverPillText, coverOpen && { color: colors.brandInk }]}>{coverOpen ? 'Done' : 'Edit cover'}</Text>
              </button>
            ) : null}
          </div>
        ) : (
          // Portrait stage, the shape a clip actually posts in, so what you see
          // here is what people will see in the feed.
          <div
            style={{ display: 'flex', justifyContent: 'center', cursor: 'zoom-in' }}
            onClick={() => setExpanded(true)}
            role="button"
            tabIndex={0}
            aria-label="Open a larger preview"
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setExpanded(true); }}
          >
            {value.kind === 'video' && value.uri ? (
              <video
                src={value.uri}
                autoPlay
                loop
                muted
                playsInline
                style={{
                  width: '100%', maxWidth: 320, aspectRatio: '9 / 16', maxHeight: 460,
                  borderRadius: 14, background: '#000', objectFit: 'contain',
                }}
              />
            ) : value.uri ? (
              <img
                src={value.uri}
                alt={describe(value)}
                style={{
                  width: '100%', maxWidth: 320, maxHeight: 460,
                  objectFit: 'contain', borderRadius: 14, background: '#000',
                }}
              />
            ) : null}
          </div>
        )}

        {bare ? null : <View style={styles.previewFooter}>
          <Ionicons
            name={value.kind === 'video' ? 'videocam' : 'image'}
            size={16}
            color={colors.textMuted}
          />
          <Text style={styles.previewLabel} numberOfLines={1}>
            {describe(value)}
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
        </View>}

        {expanded ? (
          // Tap-through to a full-size look, with the cover strip still to hand
          // so the cover can be changed while actually seeing the footage.
          <div
            role="dialog"
            aria-label="Media preview"
            onClick={() => setExpanded(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(6,12,10,0.92)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
              cursor: 'zoom-out',
            }}
          >
            {value.kind === 'video' && value.uri ? (
              // The same player the feed uses: a tap pauses, a pinch zooms and
              // springs back; no browser controls.
              <div onClick={(event) => event.stopPropagation()} style={{ position: 'relative', width: orientation === 'landscape' ? '100%' : 'min(100%, 56vh)', aspectRatio: orientation === 'landscape' ? '16 / 9' : '9 / 16', maxHeight: '100%', borderRadius: 12, overflow: 'hidden', background: '#000', cursor: 'default' }}>
                <ZoomableMedia onDismiss={() => setExpanded(false)}>
                  <ClipPlayback uri={value.uri} poster={value.thumbnailUrl} active fit={orientation === 'landscape' ? 'contain' : 'cover'} trimStart={trim?.trimStart} trimEnd={trim?.trimEnd} crop={trim?.crop} silent={trim?.muted} />
                </ZoomableMedia>
              </div>
            ) : value.uri ? (
              <img
                src={value.uri}
                alt={describe(value)}
                onClick={(event) => event.stopPropagation()}
                style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, cursor: 'default' }}
              />
            ) : null}
          </div>
        ) : null}

        {value.kind === 'video' && !noCover && bare && coverOpen && value.uri ? (
          <View style={[styles.coverBlock, { borderTopWidth: 0, paddingTop: 0 }]}>
            {hiddenCoverInput}
            <View style={styles.coverHead}>
              <Text style={styles.coverTitle}>Cover</Text>
              <Pressable onPress={() => coverInputRef.current?.click()} accessibilityRole="button" accessibilityLabel="Upload your own cover image" hitSlop={8} style={styles.coverUploadButton}>
                <Ionicons name="image-outline" size={15} color={colors.brand} />
                <Text style={styles.coverUploadButtonText}>Upload</Text>
              </Pressable>
            </View>
            <Text style={styles.coverHint}>Drag along the strip to choose the frame people see before it plays.</Text>
            <CoverScrubber uri={value.uri} from={keepFrom} to={keepTo} at={coverAt ?? keepFrom} onScrub={scrubCover} onSettle={settleCover} />
          </View>
        ) : null}

        {value.kind === 'video' && !noCover && !bare ? (
          <View style={styles.coverBlock}>
            {hiddenCoverInput}
            <Text style={styles.coverTitle}>Cover</Text>
            <Text style={styles.coverHint}>
              {frames.length ? 'Pick the frame people see before it plays, or upload your own.' : 'Upload a picture to use as the cover.'}
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
  bare: { gap: spacing.md },
  previewFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  previewLabel: { ...typography.small, color: colors.textMuted, flex: 1 },
  coverBlock: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  coverTitle: { ...typography.smallStrong, color: colors.text },
  coverPillText: { ...typography.caption, fontWeight: '600', color: 'white', letterSpacing: 0.1 },
  coverHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  coverUploadButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: colors.brand },
  coverUploadButtonText: { ...typography.smallStrong, color: colors.brand },
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
