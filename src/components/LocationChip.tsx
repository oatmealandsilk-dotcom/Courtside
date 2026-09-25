import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography } from '@/theme';

/**
 * Where a post was, kept small: a link at the right end of the caption's
 * label ("Add location"), which becomes the place once one is picked, with
 * an × to take it off. Tapping it opens the Add location page.
 */
export function LocationLink({ value, onPress, onClear }: { value: string; onPress: () => void; onClear: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!value) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Add location" hitSlop={8} onPress={onPress} style={styles.link}>
        <Ionicons name="location-outline" size={14} color={colors.brand} />
        <Text style={styles.linkText}>Add location</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.link}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Location: ${value}. Tap to change it`} hitSlop={8} onPress={onPress} style={styles.set}>
        <Ionicons name="location" size={14} color={colors.brand} />
        <Text style={styles.setText} numberOfLines={1}>{value}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Remove location" hitSlop={10} onPress={onClear}>
        <Ionicons name="close-circle" size={16} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  linkText: { ...typography.small, color: colors.brand },
  set: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  setText: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  // One small panel: the search line, then the places under it.
});
