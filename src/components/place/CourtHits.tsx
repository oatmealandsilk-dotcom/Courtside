import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { HitCard } from '@/components/HitCard';
import { hitListOrder } from '@/features/hits/order';
import { hitTipCard, useJustPosted } from '@/features/hits/hitTips';
import { useTourOpen } from '@/features/tour/tourStore';
import { useIsFocused } from '@/lib/useIsFocused';
import { useCourtHits } from '@/features/places/useCourtHits';
import { notKnownAdult } from '@/features/players/age';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * A court's open hits, on its page under the section's own head (Open hits,
 * with New hit; see the court page's HitsSection): who wants a game here
 * and when, soonest first, the same cards as Find Players, each with I'm
 * in. Nothing at all with none open (the head says so).
 * The soonest three show; any more are a tap away ("More open hits (2)"),
 * the way Find Players does it, so one you were invited to is never cut off.
 * In Find Players' order too (Oct 7): yours and the ones you are in first,
 * full ones last.
 */
export function CourtHits({ place }: { place: { id?: string; name: string; lat: number; lng: number } }) {
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
  if (!hits.length) return null;
  return (
    <View style={styles.wrap}>
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
  pressed: { opacity: 0.6 },
  // The same "More open hits" row as Find Players.
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  moreText: { ...typography.smallStrong, color: colors.textMuted },
});
