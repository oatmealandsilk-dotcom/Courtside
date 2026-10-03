import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { TaggedCourt } from '@/data/types';
import { openCourt } from '@/features/players/courtLink';
import { colors, font, typography } from '@/theme';

/**
 * Where a post was, on its own small line under the author's name, the way
 * Instagram sets a post's location under the username: a pin and the whole
 * place, one line, shortening only at its very end. A tagged court opens its
 * page (its posts and the map); a place typed in words is just said.
 * Nothing at all when the post has no place.
 */
export function PlaceLine({ court, location, style }: { court?: TaggedCourt; location?: string; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(styleDefinitions);
  const place = court?.name ?? location?.trim() ?? '';
  if (!place) return null;
  return (
    <Pressable
      accessibilityRole={court ? 'link' : 'text'}
      accessibilityLabel={court ? `${place}, see posts from here` : place}
      disabled={!court}
      hitSlop={{ top: 4, bottom: 6, left: 6, right: 10 }}
      onPress={(e) => { e?.stopPropagation?.(); if (court) openCourt(court); }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
    >
      <Ionicons name="location-sharp" size={12} color={court ? colors.brand : colors.textFaint} />
      <Text style={[styles.text, court && styles.court]} numberOfLines={1}>{place}</Text>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', maxWidth: '100%' },
  text: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  // A court is a place to go: the page's own ink, a step bolder, beside the brand's pin.
  court: { ...font('500'), color: colors.text },
  pressed: { opacity: 0.6 },
});
