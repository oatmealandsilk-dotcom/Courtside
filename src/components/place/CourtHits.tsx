import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { HitCard } from '@/components/HitCard';
import { HitGlyph } from '@/components/HitGlyph';
import { useCourtHits } from '@/features/places/useCourtHits';
import { playHere } from '@/features/players/courtLink';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, spacing, typography } from '@/theme';

/**
 * A court's open hits: who wants a game here and when, soonest first, the
 * same cards as Find Players. "Play here" posts a hit at this court; with
 * none open, the whole prompt does.
 */
export function CourtHits({ place }: { place: { id?: string; name: string; lat: number; lng: number } }) {
  const styles = useThemedStyles(styleDefinitions);
  const hits = useCourtHits(place).slice(0, 3);
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>Open hits</Text>
        {hits.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Post a hit at ${place.name}`} hitSlop={8} onPress={() => playHere(place)} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.headLink}>Play here</Text>
          </Pressable>
        ) : null}
      </View>
      {hits.length ? hits.map((h) => <HitCard key={h.id} hit={h} />) : (
        <Pressable accessibilityRole="button" accessibilityLabel={`Play here. Post a hit at ${place.name}`} onPress={() => playHere(place)} style={({ pressed }) => [styles.prompt, pressed && { opacity: 0.92 }]}>
          <View style={styles.promptTile}><HitGlyph size={24} color={colors.brand} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.promptTitle}>Play here</Text>
            <Text style={styles.promptBody}>Pick a time. Players nearby can join.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  // The same head as the court's "Played here" grid.
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  title: { ...typography.heading, color: colors.text },
  headLink: { ...typography.smallStrong, color: colors.brand },
  pressed: { opacity: 0.6 },
  // The same prompt as Find Players' empty Open hits.
  prompt: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  promptTile: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  promptTitle: { ...typography.bodyStrong, color: colors.text },
  promptBody: { ...typography.small, color: colors.textMuted },
});
