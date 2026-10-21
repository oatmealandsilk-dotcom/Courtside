import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

/**
 * "I'm 13 or older", on the sign-up form when no birthday is typed (Oct 17:
 * Apple asks that the birthday be optional, guideline 5.1.1(v)). A yes, not
 * personal information: the same round check as the terms, starting empty.
 * With a birthday typed it is not shown, as the date already says it.
 */
export function OldEnoughCheck({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel="I'm 13 or older"
      onPress={() => onChange(!checked)}
      hitSlop={6}
      style={styles.row}
    >
      <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={checked ? colors.brand : colors.textFaint} />
      <View style={styles.words}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.label}>I'm 13 or older</Text>
        <Text style={styles.rule}>Without a birthday your account gets the under-18 protections. Add it anytime in Settings.</Text>
      </View>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.xs },
  words: { flex: 1, gap: 3 },
  label: { ...typography.small, color: colors.text, lineHeight: 19 },
  rule: { ...typography.small, fontSize: 12, lineHeight: 17, color: colors.textFaint },
});
