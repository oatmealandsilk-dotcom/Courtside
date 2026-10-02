import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { TileCover } from '@/components/TileCover';
import type { Post } from '@/data/types';
import { compactNumber } from '@/lib/format';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';

/**
 * Challenge entries three across, in their standing: the place in a small
 * pill top left (the leader's in the brand colour), likes bottom left, the
 * way a Reels grid shows views. Sized from the row's measured width.
 */
export function ChallengeEntries({ entries, from = 1 }: { entries: Post[]; from?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const [width, setWidth] = useState(0);
  const tileW = width ? Math.floor((width - spacing.sm * 2) / 3) : 0;
  return (
    <View style={styles.grid} onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w > 0 && w !== width) setWidth(w); }}>
      {tileW ? entries.map((p, i) => {
        const place = from + i;
        return (
          <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`Number ${place}, ${p.likedBy.length} likes: ${p.body}`} onPress={() => router.push(`/post/${p.id}`)} style={({ pressed }) => [styles.tile, { width: tileW, height: Math.round((tileW * 4) / 3) }, pressed && { opacity: 0.85 }]}>
            <View style={[StyleSheet.absoluteFill, styles.blank]}><Text numberOfLines={4} style={styles.blankText}>{p.body}</Text></View>
            {p.thumbnailUrl || p.imageUrl ? <TileCover accessibilityIgnoresInvertColors uri={p.thumbnailUrl || p.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={p.id} transition={120} /> : null}
            <View style={[styles.place, place === 1 && styles.placeFirst]}><Text style={[styles.placeText, place === 1 && styles.placeTextFirst]}>{place}</Text></View>
            <View style={styles.likes}><Ionicons name="heart" size={12} color="#FFFFFF" /><Text style={styles.likesText}>{compactNumber(p.likedBy.length)}</Text></View>
          </Pressable>
        );
      }) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, minHeight: 40 },
  tile: { borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  blank: { padding: spacing.sm, paddingTop: 36 },
  blankText: { ...typography.caption, color: colors.textMuted, letterSpacing: 0 },
  place: { position: 'absolute', top: 7, left: 7, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  placeFirst: { backgroundColor: colors.brand },
  placeText: { fontSize: 12, ...font('700'), color: colors.text, fontVariant: ['tabular-nums'] },
  placeTextFirst: { color: colors.brandInk },
  // A dark pill, so the count reads on any picture and on either theme's blank tile.
  likes: { position: 'absolute', left: 7, bottom: 7, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: 'rgba(10,14,12,0.55)' },
  likesText: { fontSize: 12, ...font('600'), color: 'white', fontVariant: ['tabular-nums'] },
});
