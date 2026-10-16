import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TileCover } from '@/components/TileCover';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Every photo of a carousel post, small and in order, for the screens where
 * someone judges a post (Take down, Reports, Ask for a review). A cover
 * alone could hide what is on photo 2 to 10 (review, Oct 15), so these show
 * them all. Nothing at all for a post with one photo.
 */
export function CarouselPhotoRow({ uris }: { uris?: string[] }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!uris || uris.length < 2) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.count}>{`${uris.length} photos`}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {uris.map((uri, i) => (
          <TileCover key={`${i}:${uri}`} uri={uri} style={styles.tile} accessibilityLabel={`Photo ${i + 1} of ${uris.length}`} accessibilityIgnoresInvertColors />
        ))}
      </ScrollView>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.xs },
  count: { ...typography.small, color: colors.textMuted },
  row: { gap: spacing.xs, paddingRight: spacing.sm },
  // The post's own 4:5 shape, small.
  tile: { width: 44, height: 55, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
});
