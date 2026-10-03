import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, font } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * A group's face: a soft green tile with its initials, the way a chat group
 * without a photo shows its letters. "Wakefield crew" is WC; a short name
 * like "RRC" keeps all its letters; one longer word keeps its first. The
 * same tile on the Groups list, a group's page and its empty feed.
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

export function GroupTile({ name, size = 48 }: { name: string; size?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const letters = groupInitials(name);
  // Three letters need a touch less size to sit inside the tile with room around them.
  const fontSize = Math.round(size * (letters.length > 2 ? 0.3 : 0.36));
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.tile, { width: size, height: size, borderRadius: Math.round(size * 0.3) }]}
    >
      <Text style={[styles.letters, { fontSize, letterSpacing: fontSize * -0.02 }]} numberOfLines={1}>{letters}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  tile: { backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  letters: { ...font('700'), color: colors.brand },
});
