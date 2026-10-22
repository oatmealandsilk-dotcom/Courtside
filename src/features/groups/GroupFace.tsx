import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

import type { GroupLook } from '@/data/types';
import { groupInitials } from '@/features/groups/GroupTile';
import { colors, font, withAlpha } from '@/theme';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';

/*
 * Design preview (Oct 22, Groups sheet looks D and E): a group's face as a
 * chat app draws one. Its court photo, square with a soft corner; without a
 * photo, its initials in the page's quiet grey (surfaceAlt, muted letters),
 * like a contact with no picture, so it is never louder than the photos or
 * mistaken for a button. Its emoji is left out on purpose: a photo or plain
 * letters read as a real club. A photo that fails to load falls back to the
 * letters. GroupTile stays as it is everywhere else.
 *
 * A photo that is mostly one flat colour (sky, a wall) is not detected here:
 * reading pixels on a phone needs a native module. The crop is fixed where
 * the photo is chosen instead.
 */
export function GroupFace({ name, look, size, ring }: { name: string; look?: GroupLook | null; size: number; ring?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { dark } = useTheme();
  const [broken, setBroken] = useState<string | null>(null);
  // 12 on a 48–52 tile: 10 looked pinched at that size.
  const corner = size >= 40 ? 12 : 10;
  const box = { width: size, height: size, borderRadius: corner } as const;
  const edge = ring ? { borderWidth: 2, borderColor: ring } : null;
  const uri = look?.photoUrl && look.photoUrl !== broken ? look.photoUrl : null;
  if (uri) {
    return (
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.face, box, edge]}>
        <ExpoImage source={{ uri }} contentFit="cover" recyclingKey={uri} transition={120} onError={() => setBroken(uri)} style={StyleSheet.absoluteFill} />
        {/* A hairline inside the edge; stronger on a dark page so a bright photo does not glow. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.inner, { borderRadius: corner, borderColor: withAlpha(colors.text, dark ? 0.12 : 0.08) }]} />
      </View>
    );
  }
  const letters = groupInitials(name);
  const fontSize = Math.round(size * (letters.length > 2 ? 0.3 : 0.34));
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.face, box, edge]}>
      <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[styles.letters, { fontSize, letterSpacing: fontSize * -0.02 }]}>{letters}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  face: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surfaceAlt, borderCurve: 'continuous' },
  inner: { borderWidth: StyleSheet.hairlineWidth },
  letters: { ...font('600'), color: colors.textMuted },
});
