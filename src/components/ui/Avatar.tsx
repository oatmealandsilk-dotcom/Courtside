import { useThemedStyles } from '@/theme/ThemeProvider';
import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useUsers } from '@/store/AppContext';
import { initials } from '@/lib/format';
import { colors, inkOn, radius, font } from '@/theme';
import { TextScale } from '@/theme/textScale';

/**
 * A default picture takes one of the theme's own accents, chosen by the
 * person's seed so it never changes between visits — but it does change
 * with the court, so Roland Garros avatars are clay and Wimbledon's are grass.
 */
export function tintFor(seed: string): string {
  const palette = [colors.brand, colors.court, colors.hard, colors.clay, colors.grass, colors.borderStrong];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  return palette[hash % palette.length];
}

/**
 * The Send to sheet's face colour: one of the court's six quiet tones
 * (avatarTint1-6), by the same seed, so a grid of initials reads as different
 * people without any loud accent. Only that sheet and the faces on the first
 * "Let friends see you're up to hit?" card use it (Avatar `quiet`).
 */
export function quietTintFor(seed: string): string {
  const palette = quietTints();
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  return palette[hash % palette.length];
}

/** The six quiet tones a face with no photo picks from (quietTintFor), in order: for a row of faces that must each differ from the next. */
export function quietTints(): string[] {
  return [colors.avatarTint1, colors.avatarTint2, colors.avatarTint3, colors.avatarTint4, colors.avatarTint5, colors.avatarTint6];
}

interface Props {
  uri?: string;
  name: string;
  seed: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Marks a coach with a small badge on the picture's corner. */
  ring?: boolean;
  /** No initials: just the tint (the face behind another in a group's picture, where letters would be cut off). */
  plain?: boolean;
  /**
   * A face with no photo takes a quiet tone (quietTintFor) with its initials
   * in the page's ink at a regular weight, the way Instagram's are. Opt-in:
   * only the Send to sheet asks for it; every other face keeps its accent.
   */
  quiet?: boolean;
}

/**
 * Coaches get a badge at the bottom-right rather than a coloured ring: a ring
 * fights with whatever is in the photo, and a green one on top of a green
 * avatar was invisible. The badge is the same green in every theme.
 */
const COACH_GREEN = '#4C9A5A';

export const Avatar = React.memo(function Avatar({ uri, name, seed, size = 40, style, ring = false, plain = false, quiet = false }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  // Only the people list, not the whole app: a like or a message elsewhere does not redraw every face on screen.
  const users = useUsers();
  const photo = uri ?? users.find(user => user.avatarSeed === seed || user.id === seed)?.avatarUrl;
  const tint = quiet ? quietTintFor(seed) : tintFor(seed);
  // The fill the initials actually sit on: a caller's own background (the profile's brand disc,
  // the player card's deeper shade) wins over the seed's tint, so the ink is chosen against that.
  const drawn = StyleSheet.flatten(style)?.backgroundColor;
  const fill = typeof drawn === 'string' ? drawn : tint;
  // A quiet face keeps its quiet ink on another of the quiet tones (a row of faces, each its own tone).
  const quietInk = quiet && (typeof drawn !== 'string' || quietTints().includes(drawn));
  const badge = Math.max(14, Math.round(size * 0.36));
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radius.pill,
          backgroundColor: tint,
        },
        style,
      ]}
    >
      {/* White initials where white reads on the fill, else black: white alone fell to 1.5:1 on New York's yellow. */}
      {plain ? null : <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.label, quietInk ? { fontSize: size * 0.36, color: colors.text, ...font('500') } : { fontSize: size * 0.38, color: inkOn(fill) }]}>{initials(name)}</Text>}
      {photo && <ExpoImage source={{uri:photo}} accessibilityLabel={`${name} profile photo`} contentFit="cover" recyclingKey={photo} style={{position:"absolute",width:size,height:size,borderRadius:size/2}}/>}
      {ring ? (
        <View
          accessibilityLabel="Coach"
          style={[styles.badge, { width: badge, height: badge, borderRadius: badge / 2, right: -badge * 0.12, bottom: -badge * 0.12 }]}
        >
          <Ionicons name="shield-checkmark" size={badge * 0.62} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
});

const styleDefinitions = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', backgroundColor: COACH_GREEN, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  label: { color: '#FFFFFF', ...font('700') },
});
