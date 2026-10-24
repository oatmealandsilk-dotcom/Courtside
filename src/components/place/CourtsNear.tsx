import { PRESS_DIM, PRESS_SHRINK } from '@/theme/press';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SwipePressable } from '@/components/SwipePressable';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { HitGlyph } from '@/components/HitGlyph';
import { hitShort } from '@/features/hits/format';
import { canSeeHitAt, hitsAtCourt, openHits } from '@/features/hits/visible';
import { countLabel, sameCourt } from '@/features/places/court';
import { labelOf, looksPublic } from '@/features/places/courtName';
import { surfaceAdjective, surfaceKind, surfaceLabel, surfaceShort, type SurfaceKind } from '@/features/places/courtSurface';
import { canSeeAtCourt, courtSeeing } from '@/features/places/useCourtPosts';
import { openCourt } from '@/features/players/courtLink';
import { biggerFirst, courtRows, fetchCourts, isClosedCourt, peekCourts, peekSavedCourts, type Court, type CourtRow } from '@/features/players/courts';
import { FirstReveal } from '@/features/feed/FirstReveal';
import { Fold } from '@/components/ui/Fold';
import { formatMiles, milesBetween } from '@/features/players/geo';
import { IN_TOWN_MILES } from '@/features/players/mapModel';
import type { LatLng } from '@/features/players/positions';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

const CARD = 168;
// The room inside a card, a little more than a grouped box's, since no fill marks its edge.
const PAD = spacing.lg - 2;
const MOST = 8;

/**
 * What stands top left on a card, in place of the court icon (Oct 24, owner: the icon is "too ai
 * looking and repetitive"; "Maybe something that says the surface of the court?"). 'now' is the
 * icon tile; '1' a small tag, a dot in the surface's colour and its word ("Hard"), none when the
 * map does not say; '2' the tile filled with the surface's colour and its word ("HARD"), the
 * court's colour and "COURTS" when it does not say; '3' no tile, the line under the name says it
 * ("1.6 mi · 8 hard courts · lights") and a hit or posts stand top left alone.
 */
export type CourtsSurfaceLook = 'now' | '1' | '2' | '3';
export const COURTS_SURFACE_LOOK = 'now' as CourtsSurfaceLook;

/** A surface's colour, from the theme's surface slots (the same on every light court). */
function surfaceTint(kind: SurfaceKind | null): string {
  return kind === 'hard' ? colors.surfaceHard : kind === 'clay' ? colors.surfaceClay : kind === 'grass' ? colors.surfaceGrass : colors.surfaceOther;
}

/** The line under a card's name: how far, how many courts (and of what, in look 3), lights. */
function metaLine(miles: number, count: number, lit: boolean | undefined, kind: SurfaceKind | null): string {
  const what = COURTS_SURFACE_LOOK === '3' && kind
    ? `${count} ${surfaceAdjective[kind]} court${count === 1 ? '' : 's'}`
    : count > 1 ? `${count} courts` : null;
  return [formatMiles(miles), what, lit ? 'lights' : null].filter(Boolean).join(' · ');
}

/**
 * The named courts around a spot, for Courts near you and the empty Open
 * hits prompt: around where you are (mapModel's measureFrom), so every
 * distance says how far from you. Knowing no more than your profile's
 * city, that is the still map's own area and cached answer. `rows` lists the
 * public-looking ones (parks, rec centres, schools) first, then the other
 * named ones, at most eight; within each, bigger parks first among places
 * about as far, but never a big park far away before a close court
 * (biggerFirst in courts.ts has the rule and examples). Unnamed courts say
 * too little to list. `nearest` is the nearest named court of all, by
 * distance alone; `all` is every court loaded there, for a search box to
 * look through first.
 */
export function useNearCourts(center: LatLng | null): { rows: CourtRow[]; nearest: CourtRow | null; all: Court[]; loading: boolean } {
  const lat = center?.lat;
  const lng = center?.lng;
  const [list, setList] = useState<Court[]>(() => (center ? peekCourts(center) ?? [] : []));
  // Nothing known yet for here, and the answer still on its way (the strip holds its place meanwhile).
  const [loading, setLoading] = useState(() => !!center && !peekCourts(center));
  // Whether this spot's own answer (kept or fresh) is in yet: until it is, the rows already shown stay (below).
  const [answered, setAnswered] = useState(() => !center || !!peekCourts(center));
  useEffect(() => {
    if (lat === undefined || lng === undefined) { setList([]); setLoading(false); setAnswered(true); return undefined; }
    const at = { lat, lng };
    let on = true;
    let fresh = false;
    const kept = peekCourts(at);
    if (kept) { setList(kept); setLoading(false); setAnswered(true); }
    else {
      setAnswered(false);
      // The courts kept from the last open, the moment they are read, until the fresh ones come.
      void peekSavedCourts(at).then((got) => { if (on && !fresh && got) { setList(got); setLoading(false); setAnswered(true); } });
    }
    fetchCourts(at).then((got) => { fresh = true; if (on) setList(got); }).catch(() => undefined).finally(() => { if (on) { setLoading(false); setAnswered(true); } });
    return () => { on = false; };
  }, [lat, lng]);
  // The rows last shown. A move of the spot (a fix arriving, a new city) keeps them up until the
  // new spot's own courts are in, rather than the strip emptying and coming back (Oct 22, owner:
  // "Nothing framing in or out").
  // Only for a move within the same town: after a move to another city the last city's courts
  // are never listed as near (see `named`), so the strip holds its place empty instead.
  const lastRows = useRef<{ rows: CourtRow[]; at: LatLng | null }>({ rows: [], at: null });
  const result = useMemo(() => {
    if (lat === undefined || lng === undefined) return { rows: [], nearest: null, all: list, loading: false };
    // Members-only and private courts are never suggested: not listed, and never "the nearest" named for a first hit.
    // Only courts in town: after a move to another city, the last city's list (kept while the new one loads, or if it fails) is never listed as near.
    const named = courtRows(list.filter((c) => !isClosedCourt(c)), { lat, lng }).filter((r) => r.c.name !== 'Tennis courts' && r.miles <= IN_TOWN_MILES);
    const rows = [...biggerFirst(named.filter((r) => looksPublic(r.c.name))), ...biggerFirst(named.filter((r) => !looksPublic(r.c.name)))].slice(0, MOST);
    return { rows, nearest: named[0] ?? null, all: list, loading };
  }, [list, lat, lng, loading]);
  const here = lat === undefined || lng === undefined ? null : { lat, lng };
  if (result.rows.length) lastRows.current = { rows: result.rows, at: here };
  else if (!answered && here && lastRows.current.at && lastRows.current.rows.length && milesBetween(lastRows.current.at, here) <= IN_TOWN_MILES) {
    // Measured again from here, so every distance still says how far from you.
    const rows = lastRows.current.rows.map((r) => ({ ...r, miles: milesBetween(here, r.c) })).filter((r) => r.miles <= IN_TOWN_MILES);
    if (rows.length) return { ...result, rows, loading: false };
  }
  return result;
}

/**
 * "Courts near you" under the map on Find Players: a row of the courts in
 * town, each with how far, how many courts and lights, the next open hit
 * there and how much was posted there. A card opens the court's page; the
 * last one opens the map. Nothing without somewhere to centre on. A
 * court the map or players say is members only or private never shows here,
 * nor one you follow: Your courts already shows it, with the same news.
 */
export function CourtsNear({ center, revealOrder, foldGap = 0 }: {
  center: LatLng | null;
  /** On the start page: its place in the first showing's stagger (FirstReveal). */ revealOrder?: number;
  /** The gap above it in its list, which the held strip takes with it as it folds shut. */ foldGap?: number;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const near = useNearCourts(center);
  const { hitRequests, posts, users, followingIds, currentUserId, blockedIds, mutedIds, followedCourts, seeing, shownAtCourt } = useApp();
  const rows = useMemo(() => {
    const mine = new Set((followedCourts ?? []).map((c) => c.courtId));
    return mine.size ? near.rows.filter((r) => !mine.has(r.c.id)) : near.rows;
  }, [near.rows, followedCourts]);
  // What each card says about its court: the soonest open hit you may see there, and the posts its page would show.
  const badges = useMemo(() => {
    const usersById = new Map(users.map((u) => [u.id, u]));
    const hits = openHits(hitRequests, { blockedIds, mutedIds }).filter((h) => canSeeHitAt(h, { usersById, followingIds, currentUserId, seeing }));
    const ctx = courtSeeing({ users, blockedIds, mutedIds, followingIds, currentUserId, shownAtCourt });
    // Only posts at the courts on these cards are asked about (since migration 64 the server says, post by post).
    const tagged = posts.filter((p) => !!p.court && !p.archived && !p.removed && rows.some(({ c }) => sameCourt(p.court!, c)) && canSeeAtCourt(p, ctx));
    return new Map(rows.map(({ c }) => {
      const next = hitsAtCourt(hits, c)[0];
      const here = tagged.filter((p) => sameCourt(p.court!, c));
      return [c.id, { hit: next ? hitShort(next.startsAt).replace(/^Tomorrow/, 'Tmrw') : null, posts: here.length ? countLabel(here, false) : null }];
    }));
  }, [rows, hitRequests, posts, users, followingIds, currentUserId, blockedIds, mutedIds, seeing, shownAtCourt]);

  // Nothing known about here yet: the strip's own shape holds its place, quietly, so nothing below
  // it moves when the courts come (Oct 21). Once the answer is in and there are none, it folds shut,
  // and the page under it glides up (Oct 22 sweep, item 47: it vanished and the page jumped 180 pt).
  const holding = !!center && !rows.length && near.loading;
  const [heldShown, setHeldShown] = useState(holding);
  useEffect(() => { if (holding) setHeldShown(true); }, [holding]);
  if (!rows.length && (holding || heldShown)) {
    const held = (
      <View style={styles.wrap} accessible accessibilityLabel="Loading courts near you">
        <View style={styles.head}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>Courts near you</Text>
        </View>
        <View style={[styles.row, styles.heldRow]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.card}>
              <View style={styles.top}>{COURTS_SURFACE_LOOK === 'now' || COURTS_SURFACE_LOOK === '2' ? <View style={styles.tile} /> : <View style={styles.heldTag} />}</View>
              {/* The real card's room for its words (WordsRoom), under the quiet bars: the same height at every text size, so nothing moves when the courts come. */}
              <View>
                <WordsRoom />
                <View style={[styles.heldLine, styles.heldOver, { width: '82%' }]} />
                <View style={[styles.heldLine, styles.heldOver, styles.heldMeta, styles.heldMetaAt]} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
    return (
      <Fold open={holding} gap={foldGap} onClosed={() => setHeldShown(false)}>
        {revealOrder === undefined ? held : <FirstReveal order={revealOrder}>{held}</FirstReveal>}
      </Fold>
    );
  }
  if (!center || !rows.length) return null;
  const strip = (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title}>Courts near you</Text>
      </View>
      {/* Starts and ends at the page's margins like the topic strip (the pane clips anything wider), so a card cut at the edge says there are more; a drag along it never turns the page. */}
      <ScrollView nativeID="courts-near-strip" horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.row}>
        {rows.map(({ c, miles }) => {
          const kind = surfaceKind(c.surface);
          const meta = metaLine(miles, c.count, c.lit, kind);
          const badge = badges.get(c.id);
          // Said aloud once: look 3 already says it in the line, the others in their own words here.
          const said = COURTS_SURFACE_LOOK !== 'now' && COURTS_SURFACE_LOOK !== '3' && kind ? `${surfaceAdjective[kind]} court${c.count === 1 ? '' : 's'}` : null;
          return (
            <SwipePressable
              key={c.id}
              accessibilityRole="link"
              accessibilityLabel={[labelOf(c), meta, said, badge?.hit ? `hit ${badge.hit}` : null, badge?.posts].filter(Boolean).join(', ')}
              onPress={() => openCourt({ id: c.id, name: labelOf(c), lat: c.lat, lng: c.lng })}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              {/* The court's icon with what's on there beside it (a hit first, else its posts), so the card stays short. */}
              <View style={styles.top}>
                {COURTS_SURFACE_LOOK === 'now' ? <View style={styles.tile}><CourtGlyph size={18} color={colors.brand} /></View>
                  : COURTS_SURFACE_LOOK === '1' ? (kind ? <View style={styles.tag}><View style={[styles.tagDot, { backgroundColor: surfaceTint(kind) }]} /><Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.tagText} numberOfLines={1}>{surfaceLabel[kind]}</Text></View> : null)
                  : COURTS_SURFACE_LOOK === '2' ? <SurfaceSwatch kind={kind} />
                  : null}
                {badge?.hit ? <View style={[styles.badge, styles.badgeHit, styles.badgeRow]}><HitGlyph size={11} color={colors.brand} /><Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.badgeText, styles.badgeHitText]} numberOfLines={1}>{badge.hit}</Text></View>
                  : badge?.posts ? <View style={styles.badge}><Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.badgeText} numberOfLines={1}>{badge.posts}</Text></View> : null}
              </View>
              {/* The name keeps two lines' room at every text size, the very rule the held cards use, so a
                  strip of short names is never shorter than the strip it takes the place of. */}
              <View>
                <WordsRoom />
                <View style={styles.wordsOver}>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={2}>{labelOf(c)}</Text>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{meta}</Text>
                </View>
              </View>
            </SwipePressable>
          );
        })}
        <SwipePressable accessibilityRole="link" accessibilityLabel="See all courts on the map" onPress={() => router.push('/map')} style={({ pressed }) => [styles.card, styles.allCard, pressed && styles.cardPressed]}>
          <View style={styles.allDisc}><Ionicons name="map-outline" size={20} color={colors.brand} /></View>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.allText}>See all on the map</Text>
        </SwipePressable>
      </ScrollView>
    </View>
  );
  return revealOrder === undefined ? strip : <FirstReveal order={revealOrder}>{strip}</FirstReveal>;
}

/** Look 2: the tile filled with the surface's colour, its word in white ("HARD"); "COURTS" when the map does not say. */
function SurfaceSwatch({ kind }: { kind: SurfaceKind | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const word = kind ? surfaceShort[kind] : 'COURTS';
  return (
    <View style={[styles.tile, { backgroundColor: surfaceTint(kind) }]}>
      {/* A fixed tile, so its word never grows with the phone's text size (the card's label says it). */}
      <Text allowFontScaling={false} style={[styles.swatchText, word.length === 5 && styles.swatchText5, word.length > 5 && styles.swatchText6]} numberOfLines={1}>{word}</Text>
    </View>
  );
}

/**
 * The room a court card's words take, unseen: two lines of name and one of
 * distance at the phone's text size. Both the held cards and the real ones
 * stand on it, so the strip is the same height before and after the courts
 * come, whatever the names (Oct 22: a strip of one-line names was 20pt
 * shorter, and everything under it jumped up).
 */
function WordsRoom() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.wordsRoom} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, styles.unseen]} numberOfLines={2}>{'Courts\nnear you'}</Text>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.meta, styles.unseen]} numberOfLines={1}>1 mi</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.sm },
  title: { ...typography.title, color: colors.text },
  headLink: { ...typography.smallStrong, color: colors.brand },
  pressed: { opacity: PRESS_DIM },
  scroller: { flexGrow: 0 },
  // Room above and below, so a card's edge is never cut at the strip's.
  row: { gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.lg },
  // A light card: no fill and no shadow, just a hairline in the theme's border colour, so the strip sits quietly on the page.
  card: { width: CARD, padding: PAD, gap: 4, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  cardPressed: { transform: [{ scale: PRESS_SHRINK }] },
  // The quiet court tile of the search rows and the map's results: solid brand stays for buttons.
  // The tile's height whatever stands there (or nothing), so no look is taller or shorter than another.
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, minHeight: 36 },
  tile: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  // Look 1: a small hairline tag, the surface's dot and its word.
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 7, paddingRight: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  tagDot: { width: 7, height: 7, borderRadius: 4 },
  tagText: { ...typography.caption, letterSpacing: 0, color: colors.text },
  // Look 2: the swatch's word, white on the surface's colour.
  // Sized to the word so it fits the 36 pt tile whole: four letters at 10, five at 8.5, six at 7.5.
  swatchText: { ...typography.caption, ...font('700'), fontSize: 10, letterSpacing: 0.3, color: colors.onMedia },
  swatchText5: { fontSize: 8.5, letterSpacing: 0 },
  swatchText6: { fontSize: 7.5, letterSpacing: 0 },
  name: { ...typography.bodyStrong, fontSize: 16, letterSpacing: -0.2, color: colors.text, lineHeight: 20 },
  meta: { ...typography.small, color: colors.textMuted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.bgElevated, maxWidth: CARD - PAD * 2, flexShrink: 1 },
  badgeText: { ...typography.caption, letterSpacing: 0, color: colors.textMuted },
  badgeHit: { backgroundColor: colors.brandDim },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeHitText: { color: colors.brand },
  allCard: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  allDisc: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  allText: { ...typography.smallStrong, color: colors.brand, textAlign: 'center' },
  // The strip holding its place: the cards' own shape, a name's line and a distance's, in the page's quiet tone.
  heldRow: { flexDirection: 'row', overflow: 'hidden' },
  heldLine: { height: 14, marginVertical: 3, borderRadius: 7, backgroundColor: colors.bgElevated },
  heldMeta: { width: '48%', height: 12 },
  // Looks 1 and 3 hold a tag's place, not a tile's.
  heldTag: { width: 56, height: 22, borderRadius: radius.pill, backgroundColor: colors.bgElevated },
  // Over the unseen words, from their top.
  heldOver: { position: 'absolute', top: 0, left: 0 },
  // The distance's bar, where the distance's line starts: under two name lines (20 each) and the gap.
  heldMetaAt: { top: 44 },
  // The card's words over their room, from its top.
  wordsOver: { position: 'absolute', top: 0, left: 0, right: 0, gap: 4 },
  wordsRoom: { gap: 4 },
  unseen: { opacity: 0 },
});
