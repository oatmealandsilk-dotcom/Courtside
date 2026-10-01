import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { levelBadge } from '@/lib/badges';
import { useTheme } from '@/theme/ThemeProvider';
import type { PlayerProfile } from '@/data/types';
import { colors, font, radius } from '@/theme';

/**
 * A player's level, as a soft tag: a faint fill of the band's colour with the
 * system ("UTR") set small and the number set bold, so the number is what
 * reads. Over a clip it is the frosted dark chip every reels feed uses.
 */
export function LevelPill({ profile, small = false, onMedia = false }: { profile: PlayerProfile; small?: boolean; onMedia?: boolean }) {
  // Without this the pill keeps the colours of whichever theme it first drew in.
  useTheme();
  const badge = levelBadge(profile);
  const space = badge.label.indexOf(' ');
  const system = space > 0 ? badge.label.slice(0, space) : '';
  const value = space > 0 ? badge.label.slice(space + 1) : badge.label;
  // The lowest band's colour is the page's tan: fine as a fill, too pale for words.
  const ink = onMedia ? '#FFFFFF' : badge.tint === colors.borderStrong ? colors.textMuted : badge.tint;
  return (
    <View
      accessible
      accessibilityLabel={badge.label}
      style={[styles.pill, small && styles.small, onMedia ? styles.frost : { backgroundColor: tintFill(badge.tint) }]}
    >
      {system ? <Text style={[styles.system, small && styles.systemSmall, { color: ink }, onMedia && styles.systemOnMedia]}>{system}</Text> : null}
      <Text style={[styles.value, small && styles.valueSmall, { color: ink }]}>{value}</Text>
    </View>
  );
}

/** The band's colour at a whisper, for the tag's fill. */
function tintFill(tint: string): string {
  return /^#[0-9a-f]{6}$/i.test(tint) ? `${tint}26` : colors.surfaceAlt;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 21,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  small: { height: 19, paddingHorizontal: 7 },
  frost: { backgroundColor: 'rgba(12, 14, 12, 0.42)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255, 255, 255, 0.22)' },
  system: { ...font('600'), fontSize: 10.5, letterSpacing: 0.3, opacity: 0.8 },
  systemSmall: { fontSize: 10 },
  systemOnMedia: { opacity: 0.75 },
  value: { ...font('700'), fontSize: 12.5, fontVariant: ['tabular-nums'] },
  valueSmall: { fontSize: 12 },
});
