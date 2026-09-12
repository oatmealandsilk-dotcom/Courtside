import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { levelBadge } from '@/lib/badges';
import { useTheme } from '@/theme/ThemeProvider';
import type { PlayerProfile } from '@/data/types';
import { radius, spacing, typography } from '@/theme';

export function LevelPill({ profile, small = false }: { profile: PlayerProfile; small?: boolean }) {
  // Without this the pill keeps the colours of whichever theme it first drew in.
  useTheme();
  const badge = levelBadge(profile);
  return (
    <View
      style={[
        styles.pill,
        small && styles.small,
        { backgroundColor: badge.tint },
      ]}
    >
      <Text style={[small ? styles.textSmall : styles.text, { color: badge.ink }]}>{badge.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: spacing.sm, paddingVertical: 2 },
  text: { ...typography.smallStrong },
  textSmall: { ...typography.caption },
});
