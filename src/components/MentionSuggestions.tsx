import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import type { MentionCandidate } from '@/features/mentions/useMentionCandidates';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * The list that drops under a text box while an @handle is being typed.
 * Tapping a row hands the handle back; the box does the inserting.
 */
export function MentionSuggestions({ candidates, onPick }: { candidates: MentionCandidate[]; onPick: (handle: string) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!candidates.length) return null;
  return (
    <ScrollView style={styles.list} keyboardShouldPersistTaps="always" nestedScrollEnabled>
      {candidates.map(({ user, reason }, i) => (
        <Pressable
          key={user.id}
          accessibilityRole="button"
          accessibilityLabel={`Mention ${user.name}`}
          onPress={() => onPick(user.handle)}
          style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && { backgroundColor: colors.surfaceAlt }]}
        >
          <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={32} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
            <Text style={styles.handle} numberOfLines={1}>@{user.handle}</Text>
          </View>
          {reason ? <Text style={styles.reason}>{reason}</Text> : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styleDefinitions = StyleSheet.create({
  list: { maxHeight: 232, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  name: { ...typography.smallStrong, color: colors.text },
  handle: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  reason: { ...typography.caption, color: colors.brand, letterSpacing: 0 },
});
