import { PRESS_DIM, PRESS_SHRINK } from '@/theme/press';
import React, { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { NowCardBody, NowHeldBody, nowFrame } from '@/components/place/CourtCardNow';
import { usePeekLook, useNearCourts } from '@/components/place/CourtsNear';
import { PeekCardBody, PeekHeldBody, peekFrame, useCourtPicturesGo } from '@/components/place/CourtsNearPeek';
import { surfaceTint } from '@/components/place/SurfaceTag';
import { Medal, hasCoin } from '@/features/cityBoard/BoardBits';
import { MIN_PLAYERS, sessionsWords, type RankedCity } from '@/features/cityBoard/board';
import { catalogSpot, cityLabel, type ZeroCity } from '@/features/cityBoard/catalog';
import { isAllTime } from '@/features/cityBoard/flag';
import { labelOf, looksPublic } from '@/features/places/courtName';
import { courtSurfaceOf } from '@/features/places/courtSurface';
import { openCourt } from '@/features/players/courtLink';
import { milesBetween } from '@/features/players/geo';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

/**
 * DESIGN PREVIEW ONLY (Nov 3, web demo with ?var=city-unranked:A|B|C|D, see
 * lib/designVar): options for the page of a city at 0 that is not yours
 * (about 200 of the board's 214 open it). Without the query, and always on a
 * phone, ZeroCityPage stays as it is today.
 *
 * Every option keeps to what the phone already knows about such a city: its
 * fixed public spot in the catalog, the courts the map lists around that
 * spot, and the board's own ranked rows. Never a person: the server sends
 * nobody here, and nobody is guessed.
 *
 *   A  Laid out like a ranked city's page: a dash where the place goes,
 *      "Not ranked yet", one short line, and the map as a plain row.
 *   B  A, plus "Courts in <city>": Most active courts' sideways cards, from
 *      the courts the map lists around the city's spot (no visits, no people).
 *   C  A, plus what puts it on the board: five plain marks for the five
 *      players it takes, and an Invite row. It never says how many are there
 *      (the phone cannot know: a city at 0 may have 3 players or none).
 *   D  A, plus "Nearest ranked city": that city's board row, a tap away.
 */
export type ZeroOption = 'A' | 'B' | 'C' | 'D';
export const isZeroOption = (v: string | null): v is ZeroOption => v === 'A' || v === 'B' || v === 'C' || v === 'D';

export function ZeroCityOptions({ option, city, month, board, onMap }: {
  option: ZeroOption; city: ZeroCity; month: string; board: RankedCity[]; onMap: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const name = cityLabel(city);
  return (
    <View>
      {/* Where it stands, as a ranked page says it: the dash its board row shows, then the words. */}
      <View style={styles.standing}>
        <View style={styles.rankLine}>
          <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.rankDash} accessibilityElementsHidden importantForAccessibility="no">–</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.rankOf}>Not ranked yet</Text>
        </View>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.standingLine}>
          Ranked once {MIN_PLAYERS} local players log sessions here{isAllTime(month) ? '' : ' in a month'}.
        </Text>
      </View>

      {option === 'B' ? <CourtsHere city={city} name={name} /> : null}
      {option === 'C' ? <WhatRanks name={name} /> : null}
      {option === 'D' ? <NearestRanked city={city} board={board} /> : null}

      {/* The way to its courts on the map: a plain row, not a floating button. */}
      <View style={styles.rows}>
        {/* C: the way to the five players first, in the same list. */}
        {option === 'C' ? (
          <Pressable accessibilityRole="link" accessibilityLabel="Invite a player from here" onPress={() => router.push('/invite')} style={({ pressed }) => [styles.linkRow, styles.linkLine, pressed && { opacity: PRESS_DIM }]}>
            <Ionicons name="person-add-outline" size={20} color={colors.text} />
            <View style={styles.linkWords}>
              <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.linkTitle}>Know someone who plays here?</Text>
              <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={styles.linkSub}>Invite them to CourtSide</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="link" accessibilityLabel={`See ${name} on the map`} onPress={onMap} style={({ pressed }) => [styles.linkRow, pressed && { opacity: PRESS_DIM }]}>
          <Ionicons name="map-outline" size={20} color={colors.text} />
          <View style={styles.linkWords}>
            <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.linkTitle}>See {name} on the map</Text>
            <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={styles.linkSub}>Its courts, and who is up to hit</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>
      </View>
    </View>
  );
}

/** B: the courts the map lists around the city's fixed spot, as Most active courts' cards. No visits, no people. */
function CourtsHere({ city, name }: { city: ZeroCity; name: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const spot = useMemo(() => catalogSpot(city.id), [city.id]);
  const near = useNearCourts(spot);
  const look = usePeekLook();
  const draw = useCourtPicturesGo() && Platform.OS === 'web';
  // Public-looking first, as Courts near you lists them; at most eight.
  const rows = useMemo(() => [...near.rows.filter((r) => looksPublic(r.c.name)), ...near.rows.filter((r) => !looksPublic(r.c.name))], [near.rows]);
  if (!spot) return null;
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" numberOfLines={1} style={styles.sectionTitle}>Courts in {name}</Text>
      </View>
      {rows.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.courtsScroll} contentContainerStyle={styles.courtsRow}>
          {rows.map(({ c }) => {
            const kind = courtSurfaceOf(c);
            const meta = [c.count > 1 ? `${c.count} courts` : '1 court', c.lit ? 'lights' : null].filter(Boolean).join(' · ');
            return (
              <Pressable key={c.id} accessibilityRole="link" accessibilityLabel={`${labelOf(c)}, ${meta}. Open court`} onPress={() => openCourt({ id: c.id, name: labelOf(c), lat: c.lat, lng: c.lng })}
                style={({ pressed }) => [styles.courtCard, look === 'N' ? peekFrame : nowFrame, pressed && styles.courtPressed]}>
                {look === 'N'
                  ? <PeekCardBody name={labelOf(c)} lat={c.lat} lng={c.lng} meta={meta} kind={kind} tint={surfaceTint(kind)} draw={draw} />
                  : <NowCardBody name={labelOf(c)} meta={meta} kind={kind} tint={surfaceTint(kind)} />}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : near.loading ? (
        <View style={[styles.courtsScroll, styles.courtsRow, styles.held]} accessible accessibilityLabel={`Loading courts in ${name}`}>
          {[0, 1, 2].map((i) => <View key={i} style={[styles.courtCard, look === 'N' ? peekFrame : nowFrame]}>{look === 'N' ? <PeekHeldBody /> : <NowHeldBody />}</View>)}
        </View>
      ) : (
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.quiet}>No named courts on the map here yet</Text>
      )}
    </View>
  );
}

/** C: what would put the city on the board: five plain marks for the five players, never a count (it is not known here). */
function WhatRanks({ name }: { name: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.sectionTitle}>What puts it on the board</Text>
      </View>
      <View style={styles.marks} accessible accessibilityLabel={`${MIN_PLAYERS} players from ${name}`}>
        {Array.from({ length: MIN_PLAYERS }, (_, i) => (
          <View key={i} style={styles.mark}><Ionicons name="person-outline" size={16} color={colors.textFaint} /></View>
        ))}
      </View>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.marksLine}>{MIN_PLAYERS} players with {name} on their profile, each logging sessions.</Text>
    </View>
  );
}

/** D: the nearest city on the board, as its own board row (place, name, how far, sessions), opening its page. */
function NearestRanked({ city, board }: { city: ZeroCity; board: RankedCity[] }) {
  const styles = useThemedStyles(styleDefinitions);
  const nearest = useMemo(() => {
    const from = catalogSpot(city.id);
    if (!from) return null;
    let best: { c: RankedCity; miles: number } | null = null;
    for (const c of board) {
      const at = catalogSpot(c.id);
      if (!at || c.rank === null) continue;
      const miles = milesBetween(from, at);
      if (!best || miles < best.miles) best = { c, miles };
    }
    return best;
  }, [city.id, board]);
  if (!nearest || nearest.c.rank === null) return null;
  const { c, miles } = nearest;
  const rank = c.rank as number;
  const far = `${Math.max(1, Math.round(miles)).toLocaleString()} mi away`;
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.sectionTitle}>Nearest ranked city</Text>
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel={`${cityLabel(c)}, ranked ${rank}, ${sessionsWords(c.sessions)}, ${far}. Open city`} onPress={() => router.push(`/city/${c.id}`)}
        style={({ pressed }) => [styles.boardRow, pressed && { opacity: PRESS_DIM }]}>
        <View style={styles.boardRank}>
          {hasCoin(rank)
            ? <Medal rank={rank} size={40} fontSize={21} markSize={30} />
            : <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.boardRankText}>{rank}</Text>}
        </View>
        <View style={styles.boardName}>
          <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.boardCity}>{cityLabel(c)}</Text>
          <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={styles.boardSub}>{far}</Text>
        </View>
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.boardValue}>{c.sessions}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // As a ranked city's "3rd of 15 ranked" and its line, right under the title.
  standing: { paddingTop: spacing.xs, gap: 2 },
  rankLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rankDash: { ...font('500'), fontSize: 34, letterSpacing: -1.2, color: colors.textFaint },
  rankOf: { ...typography.body, fontSize: 17, color: colors.textMuted },
  standingLine: { ...typography.body, ...font('500'), color: colors.text },
  section: { paddingTop: spacing.xl, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: spacing.sm },
  sectionTitle: { ...typography.title, color: colors.text, flexShrink: 1 },
  quiet: { ...typography.body, color: colors.textMuted, paddingTop: spacing.xs },
  // Plain rows between hairlines, a settings list's, not a floating button.
  rows: { marginTop: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  linkLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: spacing.sm },
  linkWords: { flex: 1, minWidth: 0, gap: 1 },
  linkTitle: { ...font('500'), fontSize: 16, color: colors.text },
  linkSub: { ...typography.small, color: colors.textMuted },
  // B: Most active courts' strip and cards.
  courtsScroll: { marginHorizontal: -spacing.lg, flexGrow: 0 },
  courtsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.xs },
  held: { flexDirection: 'row', overflow: 'hidden' },
  courtCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  courtPressed: { transform: [{ scale: PRESS_SHRINK }] },
  // C: five plain marks, one per player it takes.
  marks: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs },
  mark: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  marksLine: { ...typography.body, color: colors.textMuted, paddingTop: spacing.sm },
  // D: the city board's own row (app/city-board.tsx TableRow), with a chevron since it opens a page.
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: 62, paddingHorizontal: spacing.md, marginHorizontal: -spacing.md },
  boardRank: { width: 40, marginRight: -2, alignItems: 'center' },
  boardRankText: { ...font('700'), fontSize: 26, letterSpacing: -1, textAlign: 'center', fontVariant: ['tabular-nums'], color: colors.textFaint },
  boardName: { flex: 1, minWidth: 0, gap: 2 },
  boardCity: { ...font('600'), fontSize: 17, letterSpacing: -0.2, color: colors.text },
  boardSub: { ...typography.small, color: colors.textFaint },
  boardValue: { ...font('700'), fontSize: 17, color: colors.text, fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'right' },
});
