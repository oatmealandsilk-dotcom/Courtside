import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { levelBadge } from '@/lib/badges';
import { useTheme } from '@/theme/ThemeProvider';
import type { PlayerProfile } from '@/data/types';
import { colors, font, pageIsDark, radius } from '@/theme';

/**
 * Each rating system keeps one colour wherever it shows: UTR blue, NTRP
 * green, ITF clay. Fixed on purpose rather than theme slots: the court themes
 * repaint their blue and green slots (London's is purple, New York's yellow),
 * and the badge must still say which system it is at a glance. Over a picture
 * the colour is a light tint on a dark frosted chip, so it holds up on a blue
 * court or green grass alike.
 */
const SYSTEM_INK: Record<string, { light: string; dark: string; media: string }> = {
  // A clear, saturated blue (not steel): UTR's own colour should read at a glance.
  UTR: { light: '#2370C2', dark: '#7DBEF5', media: '#6EC1FF' },
  NTRP: { light: '#3D7A4B', dark: '#88C697', media: '#A3DFAE' },
  ITF: { light: '#A0643F', dark: '#D9A07E', media: '#F2BC96' },
};

/**
 * A player's level, as a soft tag: a faint fill of the band's colour with the
 * system ("UTR") set small and the number set bold, so the number is what
 * reads. Over a clip it is the frosted dark chip every reels feed uses.
 */
export function LevelPill({ profile, small = false, onMedia = false, style }: { profile: PlayerProfile; small?: boolean; onMedia?: boolean; style?: StyleProp<ViewStyle> }) {
  // Without this the pill keeps the colours of whichever theme it first drew in.
  useTheme();
  const badge = levelBadge(profile);
  const space = badge.label.indexOf(' ');
  const system = space > 0 ? badge.label.slice(0, space) : '';
  const value = space > 0 ? badge.label.slice(space + 1) : badge.label;
  const system_ = SYSTEM_INK[system] ?? SYSTEM_INK.NTRP;
  const tone = onMedia ? system_.media : pageIsDark() ? system_.dark : system_.light;
  // Over a picture the number is white and the system wears its colour; on a page both do.
  const ink = onMedia ? '#FFFFFF' : tone;
  return (
    <View
      accessible
      accessibilityLabel={badge.label}
      style={[styles.pill, small && styles.small, onMedia ? [styles.frost, { borderColor: edge(tone) }] : { backgroundColor: tintFill(tone) }, style]}
    >
      {system ? <Text style={[styles.system, small && styles.systemSmall, { color: onMedia ? tone : ink }, onMedia && styles.systemOnMedia]}>{system}</Text> : null}
      <Text style={[styles.value, small && styles.valueSmall, { color: ink }]}>{value}</Text>
    </View>
  );
}

/** Over a picture, the chip's rim wears the system's colour faintly, so the colour reads before the letters do. */
function edge(tint: string): string {
  return /^#[0-9a-f]{6}$/i.test(tint) ? `${tint}80` : 'rgba(255, 255, 255, 0.26)';
}

/** The system's colour at a whisper, for the tag's fill. */
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
  // Dark enough to hold its colours on any frame, a blue court or green grass included.
  frost: { backgroundColor: 'rgba(10, 12, 10, 0.55)', borderWidth: 1 },
  system: { ...font('600'), fontSize: 10.5, letterSpacing: 0.3, opacity: 0.8 },
  systemSmall: { fontSize: 10 },
  systemOnMedia: { opacity: 1 },
  value: { ...font('700'), fontSize: 12.5, fontVariant: ['tabular-nums'] },
  valueSmall: { fontSize: 12 },
});
