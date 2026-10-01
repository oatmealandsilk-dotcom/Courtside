import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/theme';

/**
 * "New to CourtSide", on a player's first post: a quiet cue for everyone
 * else to say hello. Frosted over a picture, outlined on the page.
 *
 * `short` says just "New", for the name line over a clip, where the full
 * words would push the name off its line or the tag onto a row of its own.
 * It grows with large accessibility text no more (1.2×) than the words
 * around it. A screen reader still hears "New to CourtSide".
 */
export function NewHereTag({ onMedia = false, short = false }: { onMedia?: boolean; short?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.tag, short && styles.tagShort, onMedia && styles.frost]} accessible accessibilityLabel="New to CourtSide">
      <View style={styles.dot} />
      <Text style={[styles.text, onMedia && styles.textOnMedia]} maxFontSizeMultiplier={short ? 1.2 : undefined}>{short ? 'New' : 'New to CourtSide'}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand },
  tagShort: { gap: 4, paddingHorizontal: 7, paddingVertical: 2 },
  frost: { backgroundColor: 'rgba(12,14,12,0.48)', borderColor: 'rgba(255,255,255,0.22)' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  text: { ...typography.caption, letterSpacing: 0.2, color: colors.brand },
  textOnMedia: { color: '#FFFFFF' },
});
