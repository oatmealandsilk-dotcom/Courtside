import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, surfaceColorFor, typography } from '@/theme';

/**
 * Stand-in for uploaded photo/video. The mock build ships no binary assets, so
 * media renders as a deterministic tinted court card instead of a broken image.
 */
export function MediaPlaceholder({ label, seed, portrait = false }: { label: string; seed: string; portrait?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const tint = surfaceColorFor(seed);
  const isVideo = /·\s*\d+:\d+/.test(label);

  return (
    <View style={[styles.wrap, portrait && { aspectRatio: 9 / 12, maxHeight: 600, backgroundColor: colors.surfaceAlt }, { backgroundColor: `${tint}22`, borderColor: `${tint}55` }]}>
      <View style={styles.court}>
        <View style={[styles.line, styles.baseline]} />
        <View style={[styles.line, styles.service]} />
        <View style={[styles.line, styles.centre]} />
      </View>
      <View style={styles.overlay}>
        <Ionicons
          name={isVideo ? 'play-circle' : 'image-outline'}
          size={isVideo ? 34 : 24}
          color={colors.text}
        />
        <Text style={styles.label}>{label}</Text>
        {portrait && <Text style={styles.label}>Demo reel preview</Text>}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: {
    aspectRatio: 1.65,
    width: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  court: { ...StyleSheet.absoluteFillObject, opacity: 0.35 },
  line: { position: 'absolute', backgroundColor: colors.text },
  baseline: { left: '12%', right: '12%', top: '22%', height: 1 },
  service: { left: '12%', right: '12%', bottom: '22%', height: 1 },
  centre: { top: '22%', bottom: '22%', left: '50%', width: 1 },
  overlay: { alignItems: 'center', gap: spacing.xs },
  label: { ...typography.caption, color: colors.textMuted },
});
