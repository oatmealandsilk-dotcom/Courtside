import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { Removed } from '@/data/types';
import { removedLine } from '@/features/moderation/reasons';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * "Removed: Violence or weapons", on something an admin took down
 * (migration 108). Only its author and the admins ever have it, so this is
 * what they see where it sits: a red pill over a post's or Instant's page,
 * or a quiet line under a comment or reply (`quiet`). Never says who.
 */
export function RemovedNote({ removed, quiet = false, style }: { removed: Removed; quiet?: boolean; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(styleDefinitions);
  const words = removedLine(removed);
  if (quiet) {
    return (
      <View style={[styles.line, style]} accessibilityRole="text" accessibilityLabel={words}>
        <Ionicons name="eye-off-outline" size={13} color={colors.danger} />
        <Text style={styles.lineText}>{words}</Text>
      </View>
    );
  }
  return (
    <View pointerEvents="none" style={[styles.pill, { backgroundColor: colors.danger }, style]} accessibilityRole="text" accessibilityLabel={`${words}. Only its author and CourtSide’s admins can see it.`}>
      <Ionicons name="eye-off-outline" size={15} color={colors.onDanger} />
      <Text style={[styles.pillText, { color: colors.onDanger }]} numberOfLines={2}>{words}</Text>
    </View>
  );
}

/**
 * The same, over a profile grid tile: the picture dimmed, with the mark and
 * "Removed" in the middle. It lets taps through to the tile.
 */
export function TileRemoved() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tile]} accessibilityRole="image" accessibilityLabel="Removed">
      <Ionicons name="eye-off" size={20} color={colors.onMedia} />
      <Text style={[styles.tileText, { color: colors.onMedia }]}>Removed</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, maxWidth: '86%', paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill },
  pillText: { ...typography.smallStrong, flexShrink: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2 },
  lineText: { ...typography.caption, color: colors.danger, letterSpacing: 0 },
  tile: { alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.overlay },
  tileText: { ...typography.smallStrong },
});
