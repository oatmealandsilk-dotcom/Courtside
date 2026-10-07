import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { HitCard } from '@/components/HitCard';
import { PostHitField } from '@/components/PostHitField';
import { hitListOrder } from '@/features/hits/order';
import { hitTipCard, useJustPosted } from '@/features/hits/hitTips';
import { useTourOpen } from '@/features/tour/tourStore';
import { useIsFocused } from '@/lib/useIsFocused';
import { useCourtHits } from '@/features/places/useCourtHits';
import { playHere } from '@/features/players/courtLink';
import { notKnownAdult } from '@/features/players/age';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * A court's open hits: who wants a game here and when, soonest first, the
 * same cards as Find Players. "Play here?" heads them, the same field as
 * Community's "Looking for a hit?" (Oct 7, in place of a small "Play here"
 * link beside the title), and posts a hit at this court; with none open, a
 * muted line says so and a note under the field says what happens next. A
 * members-only or private court is never suggested for a hit: no Play here,
 * and nothing at all with none open.
 * The soonest three show; any more are a tap away ("More open hits (2)"),
 * the way Find Players does it, so one you were invited to is never cut off.
 * In Find Players' order too (Oct 7): yours and the ones you are in first,
 * full ones last.
 */
export function CourtHits({ place, closed = false }: { place: { id?: string; name: string; lat: number; lng: number }; closed?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, currentUserId, followingIds } = useApp();
  const found = useCourtHits(place);
  const all = useMemo(() => hitListOrder(found, (h) => h, currentUserId), [found, currentUserId]);
  const [moreOpen, setMoreOpen] = useState(false);
  const more = Math.max(0, all.length - HITS_SHOWN);
  const hits = moreOpen ? all : all.slice(0, HITS_SHOWN);
  const forFriends = !!currentUser && notKnownAdult(currentUser);
  // The hit tips, as on Find Players: one card here carries one, once it is in view (see HitCard's tip).
  const justPosted = useJustPosted();
  const focused = useIsFocused();
  const tourOpen = useTourOpen();
  const hitTip = hitTipCard(hits, currentUserId, justPosted, { teen: forFriends, followingIds });
  if (closed && !hits.length) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>Open hits</Text>
        {hits.length ? null : <Text style={styles.sub}>None here yet.</Text>}
      </View>
      {closed ? null : (
        <PostHitField
          label="Play here?"
          accessibilityLabel={`Play here. Post a hit at ${place.name}`}
          onPress={() => playHere(place)}
          // A teen's hit reaches only the people who follow them (hits/visible), so it says so.
          note={hits.length ? null : `Pick a time. ${forFriends ? 'Friends who follow you' : 'Players nearby'} can tap I’m in, and a chat opens to sort out the rest.`}
        />
      )}
      {hits.map((h) => <HitCard key={h.id} hit={h} {...(hitTip?.hitId === h.id ? { tip: hitTip.tip, tipReady: focused && !tourOpen } : {})} />)}
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
  // A section's opening: its title, and one muted line under it when there is nothing to show.
  head: { gap: 3 },
  title: { ...typography.heading, color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
  pressed: { opacity: 0.6 },
  // The same "More open hits" row as Find Players.
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  moreText: { ...typography.smallStrong, color: colors.textMuted },
});
