import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { PickedMedia } from '@/components/MediaPicker';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * The composer's carousel (Oct 15): every chosen photo small, in the order
 * it will swipe, the first marked Cover. ✕ on one takes it out (taking the
 * cover out makes the next one the cover); + adds more, up to `max`. Shown
 * only with two photos or more, so a one-photo post looks as it always did.
 */
export function CarouselStrip({ photos, max, onRemove, onAdd }: {
  photos: PickedMedia[];
  max: number;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const full = photos.length >= max;
  return (
    <View style={styles.wrap}>
      <Text style={styles.count}>{`${photos.length} photos · swipes like a carousel`}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        {photos.map((photo, i) => (
          <View key={`${photo.uri}-${i}`} style={styles.tile}>
            <Image accessibilityIgnoresInvertColors source={{ uri: photo.thumbnailUrl ?? photo.uri }} resizeMode="cover" style={StyleSheet.absoluteFill} accessibilityLabel={i === 0 ? 'Photo 1, the cover' : `Photo ${i + 1}`} />
            {i === 0 ? <View pointerEvents="none" style={styles.coverTag}><Text style={styles.coverText}>Cover</Text></View> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} hitSlop={8} onPress={() => onRemove(i)} style={styles.remove}>
              <Ionicons name="close" size={13} color={colors.onMedia} />
            </Pressable>
          </View>
        ))}
        {full ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel="Add more photos" onPress={onAdd} style={({ pressed }) => [styles.tile, styles.add, pressed && { opacity: 0.6 }]}>
            <Ionicons name="add" size={22} color={colors.textMuted} />
          </Pressable>
        )}
      </ScrollView>
      {full ? <Text style={styles.note}>{`${max} photos is the most a post can hold.`}</Text> : null}
    </View>
  );
}

const TILE_W = 56;

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.md },
  count: { ...typography.small, color: colors.textMuted },
  row: { gap: spacing.sm, paddingRight: spacing.sm },
  // The post's own 4:5 shape, small.
  tile: { width: TILE_W, height: Math.round(TILE_W * 5 / 4), borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  add: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: 'transparent' },
  remove: { position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay },
  coverTag: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 2, alignItems: 'center', backgroundColor: colors.overlay },
  coverText: { ...typography.small, fontSize: 10, lineHeight: 13, color: colors.onMedia },
  note: { ...typography.small, color: colors.textFaint },
});
