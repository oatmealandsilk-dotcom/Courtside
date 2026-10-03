import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

import type { GroupLook } from '@/data/types';
import { tileColors } from '@/features/groups/look';
import { colors, font } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * A group's face: a soft tile in the group's colour with its emoji or its
 * initials, the way a chat group without a photo shows its letters, or its
 * photo (migration 73). With no look at all it is the soft green tile with
 * initials it always was. "Wakefield crew" is WC; a short name like "RRC"
 * keeps all its letters; one longer word keeps its first. The same tile on
 * the Feed's empty group, Find groups, the Groups list, a group's page, an
 * invite in a chat and the Start a group preview.
 */

export function groupInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '·';
  if (words.length === 1) {
    const w = words[0];
    return (w.length <= 3 ? w : w.charAt(0)).toUpperCase();
  }
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

export function GroupTile({ name, size = 48, look }: { name: string; size?: number; look?: GroupLook | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const corner = Math.round(size * 0.3);
  const box = { width: size, height: size, borderRadius: corner };
  if (look?.photoUrl) {
    return (
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.tile, styles.photoTile, box]}>
        <ExpoImage source={{ uri: look.photoUrl }} contentFit="cover" recyclingKey={look.photoUrl} transition={120} style={StyleSheet.absoluteFill} />
      </View>
    );
  }
  const { ground, ink } = tileColors(look);
  if (look?.emoji) {
    return (
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.tile, box, { backgroundColor: ground }]}>
        <Text style={{ fontSize: Math.round(size * 0.5), lineHeight: Math.round(size * 0.62), textAlign: 'center' }} numberOfLines={1}>{look.emoji}</Text>
      </View>
    );
  }
  const letters = groupInitials(name);
  // Three letters need a touch less size to sit inside the tile with room around them.
  const fontSize = Math.round(size * (letters.length > 2 ? 0.3 : 0.36));
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.tile, box, { backgroundColor: ground }]}>
      <Text style={[styles.letters, { fontSize, letterSpacing: fontSize * -0.02, color: ink }]} numberOfLines={1}>{letters}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  tile: { backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  photoTile: { backgroundColor: colors.surfaceAlt },
  letters: { ...font('700'), color: colors.brand },
});
