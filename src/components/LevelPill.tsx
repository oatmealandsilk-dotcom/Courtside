import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { levelBadge } from '@/lib/badges';
import { useTheme } from '@/theme/ThemeProvider';
import type { PlayerProfile } from '@/data/types';
import { radius, spacing, typography } from '@/theme';

export function LevelPill({ profile, small = false, onMedia = false }: { profile: PlayerProfile; small?: boolean; onMedia?: boolean }) {
  // Without this the pill keeps the colours of whichever theme it first drew in.
  useTheme();
  const badge = levelBadge(profile);
  return (
    <View
      style={[
        styles.pill,
        small && styles.small,
        // On a page it is an outline in the band's colour; over a picture or a
        // clip an outline vanishes, so there it is a solid pill with readable ink.
        onMedia ? { backgroundColor: badge.tint, borderColor: badge.tint, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } } : { borderColor: badge.tint },
      ]}
    >
      <Text style={[small ? styles.textSmall : styles.text, { color: onMedia ? badge.ink : badge.tint }]}>{badge.label}</Text>
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
