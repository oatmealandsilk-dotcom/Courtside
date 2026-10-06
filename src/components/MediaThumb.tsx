import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { MediaCrop } from '@/data/types';
import { cropLayer } from '@/lib/crop';
import { colors, font, radius } from '@/theme';

/** How tall a thumbnail must be for Edit cover to sit along its foot; a shorter (landscape) one has it underneath. */
const COVER_ON_PICTURE = 72;
/** The Edit cover strip along a tall thumbnail's foot. */
const STRIP = 22;

/**
 * The photo or clip being posted, small, beside the caption (Instagram's
 * share screen): its cover at the post's own shape, a play mark on a clip,
 * and Edit cover along its foot. It does what the full-width preview it
 * replaced did: a tap opens the larger preview, and Edit cover opens the
 * same Cover page. Drawn the same in the app and in a browser; MediaPicker
 * (both of them) keeps the larger preview and the Cover page.
 */
export function MediaThumb({ kind, poster, width, height, crop, onOpen, onEditCover }: {
  kind: 'photo' | 'video';
  /** The photo itself, or the clip's cover. */
  poster?: string;
  width: number;
  height: number;
  /** A clip's crop from the edit step: the cover is framed the way the clip plays. */
  crop?: MediaCrop;
  onOpen: () => void;
  /** Left out when the cover can't be changed (a photo). */
  onEditCover?: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const tall = height >= COVER_ON_PICTURE;
  const video = kind === 'video';
  return (
    <View style={[styles.wrap, { width }]}>
      <View style={[styles.box, { width, height }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={video ? 'Open a larger preview of your clip' : 'Open a larger preview of your photo'}
          onPress={onOpen}
          style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.pressed]}
        >
          {poster ? (
            <View style={video ? cropLayer(crop) : StyleSheet.absoluteFill}>
              <Image accessibilityIgnoresInvertColors source={{ uri: poster }} resizeMode="cover" style={styles.fill} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name={video ? 'videocam' : 'image-outline'} size={22} color={colors.textMuted} />
            </View>
          )}
          {/* The play mark: it is a clip. Centred on the picture above Edit cover. */}
          {video ? (
            <View pointerEvents="none" style={[styles.markWrap, { paddingBottom: onEditCover && tall ? STRIP : 0 }]}>
              <View style={[styles.mark, { backgroundColor: colors.overlay }]}>
                <Ionicons name="play" size={13} color={colors.onMedia} style={styles.markIcon} />
              </View>
            </View>
          ) : null}
        </Pressable>
        {onEditCover && tall ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit cover"
            onPress={onEditCover}
            style={({ pressed }) => [styles.strip, { backgroundColor: colors.overlay }, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={[styles.stripText, { color: colors.onMedia }]}>Edit cover</Text>
          </Pressable>
        ) : null}
      </View>
      {onEditCover && !tall ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Edit cover" hitSlop={8} onPress={onEditCover} style={({ pressed }) => [styles.under, pressed && styles.pressed]}>
          <Text numberOfLines={1} style={styles.underText}>Edit cover</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: 6, alignItems: 'center' },
  box: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  fill: { width: '100%', height: '100%' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.75 },
  markWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  // The triangle's weight sits left of its box: nudged right so it looks centred.
  markIcon: { marginLeft: 2 },
  strip: { position: 'absolute', left: 0, right: 0, bottom: 0, height: STRIP, alignItems: 'center', justifyContent: 'center' },
  stripText: { ...font('600'), fontSize: 11, letterSpacing: 0.1 },
  under: { paddingVertical: 2 },
  underText: { ...font('600'), fontSize: 12, color: colors.textMuted },
});
