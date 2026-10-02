import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { HereTag } from '@/components/place/CourtLife';
import type { FollowedCourt } from '@/data/types';
import { hitShort } from '@/features/hits/format';
import { openCourt } from '@/features/players/courtLink';
import { nowStatus } from '@/features/players/courtSummary';
import { formatMiles, milesBetween } from '@/features/players/geo';
import type { LatLng } from '@/features/players/positions';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, radius, spacing, typography } from '@/theme';

const CARD = 150;

/** What is new at a court you follow, as a card's small badges: new posts, the next hit, how it is right now. */
function whatsNew(c: FollowedCourt): { hit?: string; posts?: string; now?: string } {
  const now = nowStatus(c);
  return {
    ...(c.nextHitAt ? { hit: `Hit ${hitShort(c.nextHitAt).replace(/^(Today|Tomorrow)/, (w) => w.toLowerCase())}` } : {}),
    ...(c.newPosts ? { posts: `${c.newPosts} new ${c.newPosts === 1 ? 'post' : 'posts'}` } : {}),
    ...(now ? { now: now.line } : {}),
  };
}

/**
 * What to call a court you follow: its own name, or, for one OpenStreetMap
 * left unnamed, "Courts 0.8 mi away" (never "Public courts": who may play
 * there may not be known). Without anywhere to measure from, "Tennis courts".
 */
function nameOf(c: FollowedCourt, from: LatLng | null): string {
  if (c.name && c.name !== 'Tennis courts') return c.name;
  return from ? `Courts ${formatMiles(milesBetween(from, c))} away` : 'Tennis courts';
}

/**
 * "Your courts" on Find Players: the courts you follow (the heart on a
 * court's card or page), with what is new at each this week (posts, the
 * next open hit, how it is right now), the busiest first, and "You're here"
 * with Check out where you are checked in. A card opens the court's page.
 * Nothing until you follow one. `from` is where distances are measured from.
 */
export function YourCourts({ from = null }: { from?: LatLng | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const { followedCourts, courtExtras, courtNow, currentUserId, actions } = useApp();
  useEffect(() => { if (currentUserId) void actions.loadFollowedCourts(); }, [currentUserId, actions]);
  if (courtExtras === false || !followedCourts?.length) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>Your courts</Text>
        <Text style={styles.count}>{followedCourts.length === 1 ? '1 court' : `${followedCourts.length} courts`}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.row}>
        {followedCourts.map((c) => {
          const name = nameOf(c, from);
          const news = whatsNew(c);
          // Checked in here: what the court's card last said, else what Your courts was told.
          const here = courtNow[c.courtId] ? courtNow[c.courtId].youHere : !!c.youHere;
          const quiet = !news.hit && !news.posts && !news.now;
          return (
            <Pressable
              key={c.courtId}
              accessibilityRole="link"
              accessibilityLabel={[name, here ? 'you’re checked in here' : null, news.posts, news.hit, news.now, quiet ? 'nothing new this week' : null].filter(Boolean).join(', ')}
              onPress={() => openCourt({ id: c.courtId, name, lat: c.lat, lng: c.lng })}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.tile}><Ionicons name="heart" size={17} color={colors.brand} /></View>
              <Text style={styles.name} numberOfLines={2}>{name}</Text>
              {here ? <HereTag small onCheckOut={() => { void actions.checkOutOfCourt(); }} /> : null}
              {quiet ? <Text style={styles.meta}>Nothing new this week</Text> : (
                <View style={styles.badges}>
                  {news.posts ? <View style={[styles.badge, styles.badgeNew]}><Text style={[styles.badgeText, styles.badgeNewText]} numberOfLines={1}>{news.posts}</Text></View> : null}
                  {news.hit ? <View style={[styles.badge, styles.badgeNew]}><Text style={[styles.badgeText, styles.badgeNewText]} numberOfLines={1}>{news.hit}</Text></View> : null}
                  {news.now ? <View style={styles.badge}><Text style={styles.badgeText} numberOfLines={1}>{news.now}</Text></View> : null}
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  // The same head and cards as Courts near you, so the two strips read as one family.
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.sm },
  title: { ...typography.title, color: colors.text },
  count: { ...typography.small, color: colors.textMuted },
  scroller: { flexGrow: 0 },
  row: { gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.lg },
  card: { ...lift, width: CARD, padding: spacing.md, gap: 4, borderRadius: radius.lg, backgroundColor: colors.surface },
  cardPressed: { opacity: 0.9 },
  tile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  name: { ...typography.bodyStrong, color: colors.text, lineHeight: 20 },
  meta: { ...typography.small, color: colors.textMuted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.bgElevated, maxWidth: CARD - spacing.md * 2 },
  badgeText: { ...typography.caption, letterSpacing: 0, color: colors.textMuted },
  badgeNew: { backgroundColor: colors.brandDim },
  badgeNewText: { color: colors.brand },
});
