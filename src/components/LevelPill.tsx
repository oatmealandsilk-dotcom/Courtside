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
        // On a page it is an outline in the band's colour. Over a clip it is
        // the chip every reels feed uses — frosted dark, white text, a faint
        // edge — with the band's colour kept as a dot at the front.
        onMedia ? styles.frost : { borderColor: badge.tint },
      ]}
    >
      {onMedia ? <View style={[styles.dot, { backgroundColor: badge.tint }]} /> : null}
      <Text style={[small ? styles.textSmall : styles.text, { color: onMedia ? '#FFFFFF' : badge.tint }]}>{badge.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // The level is written in its band's colour on a hairline, the way the
  // waitlist's tags are set: colour as a label, not a fill.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  frost: { backgroundColor: 'rgba(12, 14, 12, 0.48)', borderColor: 'rgba(255, 255, 255, 0.22)', paddingHorizontal: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  small: { paddingHorizontal: 7, paddingVertical: 2 },
  text: { ...typography.caption, letterSpacing: 0.5 },
  textSmall: { ...typography.caption, fontSize: 10, letterSpacing: 0.5 },
});
