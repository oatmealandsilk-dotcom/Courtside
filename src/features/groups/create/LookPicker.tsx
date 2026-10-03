import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image as ExpoImage } from 'expo-image';

import type { GroupLook } from '@/data/types';
import { groupInitials } from '@/features/groups/GroupTile';
import { GROUP_EMOJI, colorChoices, tileColors } from '@/features/groups/look';
import { useGroupPhotoPick } from '@/features/groups/create/useGroupPhotoPick';
import * as haptics from '@/lib/haptics';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * A group's face, chosen the way a WhatsApp group or a Strava club gets one:
 * a colour (round swatches in the theme's own shades), then on it the
 * group's initials ("Aa") or an emoji from a short grid, or a photo instead
 * of both. The tile in the preview above changes as you tap. With a photo,
 * the colours and emoji step aside for the photo, with Change and Remove.
 */

export function LookPicker({ name, look, onChange }: { name: string; look: GroupLook; onChange: (look: GroupLook) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const photo = useGroupPhotoPick((uri) => { haptics.tap(); onChange({ ...look, photoUrl: uri }); });
  const choices = colorChoices();
  const color = look.color ?? 'accent';
  const { ground, ink } = tileColors(look);
  const letters = name.trim() ? groupInitials(name) : 'Aa';
  // Six to a row, sized to fill the width it is given.
  const [width, setWidth] = useState(0);
  const cell = width ? Math.floor((width - GAP * (PER_ROW - 1)) / PER_ROW) : CELL;

  if (look.photoUrl) {
    return (
      <View style={styles.wrap}>
        {photo.element}
        <View style={[styles.card, styles.photoRow]}>
          <ExpoImage source={{ uri: look.photoUrl }} contentFit="cover" style={styles.photoThumb} accessibilityIgnoresInvertColors />
          <View style={styles.words}>
            <Text style={styles.photoTitle}>Group photo</Text>
            <Text style={styles.photoLine}>Shown instead of a colour and emoji.</Text>
          </View>
        </View>
        <View style={styles.photoActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Change the group's photo" onPress={photo.open} style={({ pressed }) => [styles.soft, pressed && styles.pressed]}>
            <Ionicons name="image-outline" size={16} color={colors.text} />
            <Text style={styles.softText}>Change photo</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Remove the group's photo" onPress={() => { haptics.untap(); onChange({ ...look, photoUrl: undefined }); }} style={({ pressed }) => [styles.soft, pressed && styles.pressed]}>
            <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.softText, styles.muted]}>Use a colour</Text>
          </Pressable>
        </View>
        {photo.error ? <Text style={styles.error}>{photo.error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {photo.element}
      <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Colour">
        {choices.map((c) => {
          // A colour this theme draws in the same shade as another is chosen under that one.
          const on = c.id === color || c.also.includes(color);
          return (
            <Pressable
              key={c.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={c.label}
              hitSlop={4}
              onPress={() => { if (!on) { haptics.tap(); onChange({ ...look, color: c.id }); } }}
              style={({ pressed }) => [styles.swatchRing, on && styles.swatchRingOn, pressed && styles.pressed]}
            >
              <View style={[styles.swatch, { backgroundColor: c.hex }]}>
                {on ? <Ionicons name="checkmark" size={16} color={colors.bg} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="radiogroup" accessibilityLabel="Initials or an emoji">
        {[null, ...GROUP_EMOJI].map((e) => {
          const on = (look.emoji ?? null) === e;
          return (
            <Pressable
              key={e ?? 'letters'}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={e ?? `Initials, ${letters}`}
              onPress={() => { if (!on) { haptics.tap(); onChange({ ...look, emoji: e ?? undefined }); } }}
              style={({ pressed }) => [styles.cell, { width: cell, height: cell }, on && [styles.cellOn, { backgroundColor: ground, borderColor: ink }], pressed && styles.pressed]}
            >
              {e ? <Text style={[styles.emoji, { fontSize: Math.round(cell * 0.46), lineHeight: Math.round(cell * 0.6) }]}>{e}</Text> : <Text style={[styles.letters, { color: on ? ink : colors.textMuted }]} numberOfLines={1}>{letters}</Text>}
            </Pressable>
          );
        })}
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel="Upload a photo for the group instead" onPress={photo.open} style={({ pressed }) => [styles.card, styles.upload, pressed && styles.pressed]}>
        <View style={styles.uploadIcon}><Ionicons name="image-outline" size={18} color={colors.brand} /></View>
        <Text style={styles.uploadText}>Upload a photo instead</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </Pressable>
      {photo.error ? <Text style={styles.error}>{photo.error}</Text> : null}
    </View>
  );
}

const CELL = 46;
const GAP = 8;
const PER_ROW = 6;

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  pressed: { opacity: 0.7 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'space-between' },
  swatchRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatchRingOn: { borderColor: colors.text },
  swatch: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cell: {
    ...lift, width: CELL, height: CELL, borderRadius: 14, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.surface,
  },
  cellOn: { boxShadow: 'none' },
  emoji: { fontSize: 22, lineHeight: 28, textAlign: 'center' },
  letters: { ...font('700'), fontSize: 14, letterSpacing: -0.2 },
  card: { ...lift, borderRadius: 18, backgroundColor: colors.surface },
  upload: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: 56, paddingHorizontal: spacing.md },
  uploadIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  uploadText: { ...typography.body, ...font('600'), color: colors.text, flex: 1 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  photoThumb: { width: 56, height: 56, borderRadius: 17 },
  words: { flex: 1, minWidth: 0, gap: 2 },
  photoTitle: { ...typography.body, ...font('600'), color: colors.text },
  photoLine: { ...typography.small, color: colors.textMuted },
  photoActions: { flexDirection: 'row', gap: spacing.sm },
  soft: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  softText: { ...typography.smallStrong, color: colors.text },
  muted: { color: colors.textMuted },
  error: { ...typography.small, color: colors.danger },
});
