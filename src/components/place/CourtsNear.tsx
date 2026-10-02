import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { hitShort } from '@/features/hits/format';
import { canSeeHitAt, hitsAtCourt, openHits } from '@/features/hits/visible';
import { countLabel, sameCourt } from '@/features/places/court';
import { labelOf, looksPublic } from '@/features/places/courtName';
import { canSeeAtCourt, courtSeeing } from '@/features/places/useCourtPosts';
import { openCourt } from '@/features/players/courtLink';
import { courtRows, fetchCourts, peekCourts, type Court, type CourtRow } from '@/features/players/courts';
import { formatMiles } from '@/features/players/geo';
import type { LatLng } from '@/features/players/positions';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, radius, spacing, typography } from '@/theme';

const CARD = 150;
const MOST = 8;

/**
 * The named courts around a spot, for Courts near you and the empty Open
 * hits prompt: the same area (and the same cached answer) as the still map
 * above them, so the numbers agree and courts load once. `rows` lists the
 * public-looking ones (parks, rec centres, schools) first, then the other
 * named ones, nearest first within each, at most eight; unnamed courts say
 * too little to list. `nearest` is the nearest named court of all; `all`
 * is every court loaded there, for a search box to look through first.
 */
export function useNearCourts(center: LatLng | null): { rows: CourtRow[]; nearest: CourtRow | null; all: Court[] } {
  const lat = center?.lat;
  const lng = center?.lng;
  const [list, setList] = useState<Court[]>(() => (center ? peekCourts(center) ?? [] : []));
  useEffect(() => {
    if (lat === undefined || lng === undefined) { setList([]); return undefined; }
    const at = { lat, lng };
    let on = true;
    const kept = peekCourts(at);
    if (kept) setList(kept);
    fetchCourts(at).then((got) => { if (on) setList(got); }).catch(() => undefined);
    return () => { on = false; };
  }, [lat, lng]);
  return useMemo(() => {
    if (lat === undefined || lng === undefined) return { rows: [], nearest: null, all: list };
    const named = courtRows(list, { lat, lng }).filter((r) => r.c.name !== 'Tennis courts');
    const rows = [...named.filter((r) => looksPublic(r.c.name)), ...named.filter((r) => !looksPublic(r.c.name))].slice(0, MOST);
    return { rows, nearest: named[0] ?? null, all: list };
  }, [list, lat, lng]);
}

/**
 * "Courts near you" under the map on Find Players: a row of the courts in
 * town, each with how far, how many courts and lights, the next open hit
 * there and how much was posted there. A card opens the court's page; the
 * last one opens the map. Nothing without somewhere to centre on.
 * (Until court access lands, a members-only court can still show here.)
 */
export function CourtsNear({ center }: { center: LatLng | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const { rows } = useNearCourts(center);
  const { hitRequests, posts, users, followingIds, currentUserId, blockedIds, mutedIds } = useApp();
  // What each card says about its court: the soonest open hit you may see there, and the posts its page would show.
  const badges = useMemo(() => {
    const usersById = new Map(users.map((u) => [u.id, u]));
    const hits = openHits(hitRequests, { blockedIds, mutedIds }).filter((h) => canSeeHitAt(h, { usersById, followingIds, currentUserId }));
    const ctx = courtSeeing({ users, blockedIds, mutedIds, followingIds, currentUserId });
    const tagged = posts.filter((p) => !!p.court && !p.archived && canSeeAtCourt(ctx.byId.get(p.authorId), ctx));
    return new Map(rows.map(({ c }) => {
      const next = hitsAtCourt(hits, c)[0];
      const here = tagged.filter((p) => sameCourt(p.court!, c));
      return [c.id, { hit: next ? `Hit ${hitShort(next.startsAt).replace(/^(Today|Tomorrow)/, (w) => w.toLowerCase())}` : null, posts: here.length ? countLabel(here, false) : null }];
    }));
  }, [rows, hitRequests, posts, users, followingIds, currentUserId, blockedIds, mutedIds]);

  if (!center || !rows.length) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>Courts near you</Text>
        <Pressable accessibilityRole="link" accessibilityLabel="See courts on the map" hitSlop={8} onPress={() => router.push('/map')} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.headLink}>Map</Text>
        </Pressable>
      </View>
      {/* Starts and ends at the page's margins like the topic strip (the pane clips anything wider), so a card cut at the edge says there are more; a drag along it never turns the page. */}
      <ScrollView nativeID="courts-near-strip" horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.row}>
        {rows.map(({ c, miles }) => {
          const meta = [formatMiles(miles), c.count > 1 ? `${c.count} courts` : null, c.lit ? 'lights' : null].filter(Boolean).join(' · ');
          const badge = badges.get(c.id);
          return (
            <Pressable
              key={c.id}
              accessibilityRole="link"
              accessibilityLabel={[labelOf(c), meta, badge?.hit, badge?.posts].filter(Boolean).join(', ')}
              onPress={() => openCourt({ id: c.id, name: labelOf(c), lat: c.lat, lng: c.lng })}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.tile}><CourtGlyph size={18} color={colors.brand} /></View>
              <Text style={styles.name} numberOfLines={2}>{labelOf(c)}</Text>
              <Text style={styles.meta} numberOfLines={2}>{meta}</Text>
              {badge?.hit || badge?.posts ? (
                <View style={styles.badges}>
                  {badge.hit ? <View style={[styles.badge, styles.badgeHit]}><Text style={[styles.badgeText, styles.badgeHitText]} numberOfLines={1}>{badge.hit}</Text></View> : null}
                  {badge.posts ? <View style={styles.badge}><Text style={styles.badgeText} numberOfLines={1}>{badge.posts}</Text></View> : null}
                </View>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="link" accessibilityLabel="See all courts on the map" onPress={() => router.push('/map')} style={({ pressed }) => [styles.card, styles.allCard, pressed && styles.cardPressed]}>
          <View style={styles.allDisc}><Ionicons name="map-outline" size={20} color={colors.brand} /></View>
          <Text style={styles.allText}>See all on the map</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.sm },
  title: { ...typography.title, color: colors.text },
  headLink: { ...typography.smallStrong, color: colors.brand },
  pressed: { opacity: 0.6 },
  scroller: { flexGrow: 0 },
  // Room above and below for the cards' lift, which the strip would otherwise cut into a box.
  row: { gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.lg },
  card: { ...lift, width: CARD, padding: spacing.md, gap: 4, borderRadius: radius.lg, backgroundColor: colors.surface },
  cardPressed: { opacity: 0.9 },
  // The quiet court tile of the search rows and the map's results: solid brand stays for buttons.
  tile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  name: { ...typography.bodyStrong, color: colors.text, lineHeight: 20 },
  meta: { ...typography.small, color: colors.textMuted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.bgElevated, maxWidth: CARD - spacing.md * 2 },
  badgeText: { ...typography.caption, letterSpacing: 0, color: colors.textMuted },
  badgeHit: { backgroundColor: colors.brandDim },
  badgeHitText: { color: colors.brand },
  allCard: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  allDisc: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  allText: { ...typography.smallStrong, color: colors.brand, textAlign: 'center' },
});
