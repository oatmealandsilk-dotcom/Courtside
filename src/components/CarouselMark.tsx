import React from 'react';
import { StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { Post } from '@/data/types';
import { isCarousel } from '@/features/compose/carousel';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/**
 * The small stacked-photos mark in a grid tile's top right corner, on a post
 * with several photos (Instagram's sign for a carousel, Oct 15). Never on a
 * clip, whose corner has the play mark, so the two never meet.
 */
export function CarouselMark({ post, size = 14, inset = 6 }: {
  post: Pick<Post, 'imageUrls' | 'videoUrl' | 'kind'>;
  size?: number;
  /** How far in from the corner: less on a small thumbnail (the archive list's). */
  inset?: number;
}) {
  const styles = useThemedStyles(styleDefinitions);
  if (!isCarousel(post)) return null;
  return <Ionicons name="copy" size={size} color={colors.onMedia} style={[styles.mark, { top: inset, right: inset }]} />;
}

const styleDefinitions = StyleSheet.create({
  // The same place and shadow as the play mark on a clip's tile.
  mark: { position: 'absolute', textShadowColor: colors.overlay, textShadowRadius: 3 },
});
