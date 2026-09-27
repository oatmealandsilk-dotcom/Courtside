import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ClipVideo } from '@/components/ClipVideo';
import { pickFromDevice } from '@/components/MediaPicker';
import type { Answer } from '@/data/types';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing } from '@/theme';

export type ReplyAttachment = NonNullable<Answer['media']>;

/**
 * Replying with a photo or a video, the way X does it: a small camera in the
 * reply box, a thumbnail of what you picked with an x to take it off, and
 * the picture or clip under the words once it is posted. Showing beats
 * telling in tennis.
 */
export function AttachButton({ onPick, disabled }: { onPick: (media: ReplyAttachment) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickFromDevice('all');
      if (picked?.uri) onPick({ kind: picked.kind, url: picked.uri, thumb: picked.thumbnailUrl ?? (picked.kind === 'photo' ? picked.uri : undefined) });
    } catch { /* cancelled */ } finally { setBusy(false); }
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Add a photo or video" hitSlop={8} disabled={disabled || busy} onPress={pick} style={{ opacity: disabled ? 0.4 : 1 }}>
      {busy ? <ActivityIndicator size="small" color={colors.brand} /> : <Ionicons name="image-outline" size={22} color={colors.brand} />}
    </Pressable>
  );
}

export function AttachedPreview({ media, onRemove }: { media: ReplyAttachment; onRemove: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.preview}>
      {media.thumb ? <ExpoImage source={{ uri: media.thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, styles.blank]} />}
      {media.kind === 'video' ? <View style={styles.playBadge}><Ionicons name="play" size={12} color="#FFFFFF" /></View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Remove the photo or video" hitSlop={8} onPress={onRemove} style={styles.remove}>
        <Ionicons name="close" size={14} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

/** The picture or clip in a posted reply. A clip waits for a tap before it plays, with sound. */
export function ReplyMediaView({ media }: { media: ReplyAttachment }) {
  const styles = useThemedStyles(styleDefinitions);
  const [playing, setPlaying] = useState(false);
  if (media.kind === 'photo') {
    return <ExpoImage accessibilityLabel="Photo in this reply" source={{ uri: media.url }} style={styles.media} contentFit="cover" cachePolicy="memory-disk" />;
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause the video' : 'Play the video'} onPress={() => setPlaying((p) => !p)} style={styles.media}>
      {playing ? <ClipVideo uri={media.url} poster={media.thumb} active muted={false} fit="cover" /> : (
        <>
          {media.thumb ? <ExpoImage source={{ uri: media.thumb }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : <View style={[StyleSheet.absoluteFill, styles.blank]} />}
          <View style={styles.bigPlay}><Ionicons name="play" size={26} color="#FFFFFF" /></View>
        </>
      )}
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  preview: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.bgElevated },
  blank: { backgroundColor: colors.surfaceAlt },
  playBadge: { position: 'absolute', left: 6, bottom: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  media: { width: '100%', maxWidth: 420, aspectRatio: 4 / 3, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgElevated, marginTop: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  bigPlay: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 },
});
