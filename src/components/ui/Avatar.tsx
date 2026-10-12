import { useThemedStyles } from '@/theme/ThemeProvider';
import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useUsers } from '@/store/AppContext';
import { initials } from '@/lib/format';
import { avatarFillFor, colors, inkOn, radius, font } from '@/theme';

/**
 * A default picture's colour, by the person's account id (Oct 12, owner:
 * "4 is good"): one of five deeper shades, never green or beige, and the
 * same one on every screen. Before, it was one of the court's accents
 * picked by whatever the screen happened to know the person by (their seed
 * on one screen, their id on the next), so Dev was blue in the feed and
 * green on his profile, and some faces were a beige that read as a
 * missing photo.
 */
export function tintFor(personId: string): string {
  return avatarFillFor(personId);
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
}

/**
 * Coaches get a badge at the bottom-right rather than a coloured ring: a ring
 * fights with whatever is in the photo, and a green one on top of a green
 * avatar was invisible. The badge is the same green in every theme.
 */
const COACH_GREEN = '#4C9A5A';

export const Avatar = React.memo(function Avatar({ uri, name, seed, size = 40, style, ring = false, plain = false }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  // Only the people list, not the whole app: a like or a message elsewhere does not redraw every face on screen.
  const users = useUsers();
  // Screens hand over either the person's seed or their id: both find the same person, and the
  // colour is always picked by their id, so it cannot differ between two screens.
  const person = users.find(user => user.avatarSeed === seed || user.id === seed);
  const photo = uri ?? person?.avatarUrl;
  const tint = tintFor(person?.id ?? seed);
  // The fill the initials actually sit on: a caller's own background (the player card's deeper
  // shade on a coloured card) wins over the person's shade, so the ink is chosen against that.
  const drawn = StyleSheet.flatten(style)?.backgroundColor;
  const fill = typeof drawn === 'string' ? drawn : tint;
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
      {plain ? null : <Text style={[styles.label, { fontSize: size * 0.38, color: inkOn(fill) }]}>{initials(name)}</Text>}
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
