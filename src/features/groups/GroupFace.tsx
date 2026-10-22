import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

import type { GroupLook } from '@/data/types';
import { groupInitials } from '@/features/groups/GroupTile';
import { lookTint } from '@/features/groups/look';
import { colors, font, inkOn, withAlpha } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';

/*
 * Design preview (Oct 22, Groups sheet looks D and E): a group's face as a
 * chat app draws one. Its court photo, square with a soft corner; without a
 * photo, its initials on the group's full colour (not a pale wash), like a
 * contact with no picture. Its emoji is left out here on purpose: a photo
 * or plain letters read as a real club. A photo that fails to load falls
 * back to the letters. GroupTile stays as it is everywhere else.
 */
export function GroupFace({ name, look, size, ring }: { name: string; look?: GroupLook | null; size: number; ring?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const [broken, setBroken] = useState<string | null>(null);
  const box = { width: size, height: size, borderRadius: 10 } as const;
  const edge = ring ? { borderWidth: 2, borderColor: ring } : null;
  const uri = look?.photoUrl && look.photoUrl !== broken ? look.photoUrl : null;
  if (uri) {
    return (
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.face, box, edge]}>
        <ExpoImage source={{ uri }} contentFit="cover" recyclingKey={uri} transition={120} onError={() => setBroken(uri)} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.inner, { borderRadius: 10, borderColor: withAlpha(colors.text, 0.08) }]} />
      </View>
    );
  }
  const fill = lookTint(look);
  const letters = groupInitials(name);
  const fontSize = Math.round(size * (letters.length > 2 ? 0.3 : 0.36));
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.face, box, edge, { backgroundColor: fill }]}>
      <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[styles.letters, { fontSize, letterSpacing: fontSize * -0.02, color: inkOn(fill) }]}>{letters}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  face: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surfaceAlt, borderCurve: 'continuous' },
  inner: { borderWidth: StyleSheet.hairlineWidth },
  letters: { ...font('600') },
});
