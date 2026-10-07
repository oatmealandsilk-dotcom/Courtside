import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { HitCard } from '@/components/HitCard';
import { HitGlyph } from '@/components/HitGlyph';
import { hitListOrder } from '@/features/hits/order';
import { useCourtHits } from '@/features/places/useCourtHits';
import { playHere } from '@/features/players/courtLink';
import { notKnownAdult } from '@/features/players/age';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, spacing, typography } from '@/theme';

/**
 * A court's open hits: who wants a game here and when, soonest first, the
 * same cards as Find Players. "Play here" posts a hit at this court; with
 * none open, the whole prompt does. A members-only or private court is
 * never suggested for a hit: no Play here, and nothing at all with none open.
 * The soonest three show; any more are a tap away ("More open hits (2)"),
 * the way Find Players does it, so one you were invited to is never cut off.
 * In Find Players' order too (Oct 7): yours and the ones you are in first,
 * full ones last.
 */
export function CourtHits({ place, closed = false }: { place: { id?: string; name: string; lat: number; lng: number }; closed?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, currentUserId } = useApp();
  const found = useCourtHits(place);
  const all = useMemo(() => hitListOrder(found, (h) => h, currentUserId), [found, currentUserId]);
  const [moreOpen, setMoreOpen] = useState(false);
  const more = Math.max(0, all.length - HITS_SHOWN);
  const hits = moreOpen ? all : all.slice(0, HITS_SHOWN);
  const forFriends = !!currentUser && notKnownAdult(currentUser);
  if (closed && !hits.length) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>Open hits</Text>
        {hits.length && !closed ? (
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
            {/* A teen's hit reaches only the people who follow them (hits/visible), so it says so. */}
            <Text style={styles.promptBody}>{forFriends ? 'Pick a time. Friends who follow you can join.' : 'Pick a time. Players nearby can join.'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      )}
      {more ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreOpen }} onPress={() => setMoreOpen((o) => !o)} hitSlop={6} style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
          <Text style={styles.moreText}>{moreOpen ? 'Fewer open hits' : `More open hits (${more})`}</Text>
          <Ionicons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** How many of a court's open hits show before "More open hits". */
const HITS_SHOWN = 3;

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  // The same head as the court's "Played here" grid.
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  title: { ...typography.heading, color: colors.text },
  headLink: { ...typography.smallStrong, color: colors.brand },
  pressed: { opacity: 0.6 },
  // The same "More open hits" row as Find Players.
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  moreText: { ...typography.smallStrong, color: colors.textMuted },
  // A court with no open hits: one card that posts the first.
  prompt: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  promptTile: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  promptTitle: { ...typography.bodyStrong, color: colors.text },
  promptBody: { ...typography.small, color: colors.textMuted },
});
