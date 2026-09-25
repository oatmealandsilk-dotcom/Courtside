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
        { borderColor: badge.tint },
      ]}
    >
      <Text style={[small ? styles.textSmall : styles.text, { color: badge.tint }]}>{badge.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // The level is written in its band's colour on a hairline, the way the
  // waitlist's tags are set: colour as a label, not a fill.
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: 7, paddingVertical: 2 },
  text: { ...typography.caption, letterSpacing: 0.5 },
  textSmall: { ...typography.caption, fontSize: 10, letterSpacing: 0.5 },
});
