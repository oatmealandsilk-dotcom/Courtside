import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandWash } from '@/components/ui';
import { TileCover } from '@/components/TileCover';
import type { Post } from '@/data/types';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius } from '@/theme';

const SIZE = 76;

/**
 * The court's round "story": the newest post with a picture inside the same
 * green ring the stories rail uses, with a play badge; a tap opens the reel.
 * With no picture yet it is a quiet court disc, and not a button.
 */
export function CourtDisc({ cover, label, onPress }: { cover: Post | null; label: string; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const picture = cover ? cover.thumbnailUrl ?? cover.imageUrl : undefined;
  if (!cover || !picture) {
    return (
      <View style={styles.plain} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="tennisball" size={30} color={colors.brand} />
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.ring, pressed && styles.pressed]}>
      <View style={styles.inner}>
        <TileCover accessibilityIgnoresInvertColors uri={picture} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={cover.id} />
      </View>
      <View style={styles.badge}>
        <BrandWash />
        <Ionicons name="play" size={11} color={colors.brandInk} style={styles.badgeGlyph} />
      </View>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  ring: { width: SIZE, height: SIZE, padding: 2.5, borderRadius: radius.pill, borderWidth: 2.5, borderColor: colors.brand, backgroundColor: colors.bg },
  inner: { flex: 1, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  badge: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badgeGlyph: { marginLeft: 1 },
  plain: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
