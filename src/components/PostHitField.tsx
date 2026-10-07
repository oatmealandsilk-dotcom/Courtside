import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { HitGlyph } from '@/components/HitGlyph';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, radius, spacing, typography } from '@/theme';

/**
 * The way to post a hit (Oct 7): a field you could start filling in, at the
 * top of an Open hits list, in place of the small "Post a hit" and "Play
 * here" links beside the title. The shape of Coaching's "Your question" box:
 * a pill on the lift, the hit glyph at its start, the round green arrow at its
 * end. It opens the hit form; Community's and a court page's lists both head
 * with it. `note`, when there are no hits to show, says once what happens next.
 */
export function PostHitField({ label, accessibilityLabel, onPress, note }: { label: string; accessibilityLabel: string; onPress: () => void; note?: string | null }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}>
        <HitGlyph size={22} color={colors.brand} />
        <Text style={styles.text} numberOfLines={1}>{label}</Text>
        <View style={styles.go}><Ionicons name="arrow-forward" size={16} color={colors.brandInk} /></View>
      </Pressable>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingLeft: spacing.lg, paddingRight: 6, paddingVertical: 6, minHeight: 52,
    ...lift, borderRadius: radius.pill, backgroundColor: colors.surface,
  },
  fieldPressed: { transform: [{ scale: 0.99 }] },
  text: { ...typography.body, fontSize: 16, color: colors.textMuted, flex: 1 },
  // The small lift, in the arrow's own colour (DESIGN.md: round brand buttons).
  go: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: colors.brand, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  // Under the field, the way Coaching's note sits under its box.
  note: { ...typography.small, color: colors.textMuted, lineHeight: 18, paddingLeft: 2 },
});
