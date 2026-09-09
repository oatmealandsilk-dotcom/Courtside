import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

interface Props {
  label: string;
  value: string;
  hint?: string;
  tint?: string;
}

export function StatTile({ label, value, hint, tint }: Props) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Text style={[styles.value, tint ? { color: tint } : null]}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 96,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  label: { ...typography.caption, color: colors.textFaint },
  value: { ...typography.title, color: colors.text },
  hint: { ...typography.small, color: colors.textMuted },
});
