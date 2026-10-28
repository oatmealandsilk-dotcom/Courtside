import { PRESS_DIM, PRESS_SHRINK } from '@/theme/press';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SwipePressable } from '@/components/SwipePressable';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { NOW_CARD_W, NOW_PAD, NowCardBody, NowHeldBody } from '@/components/place/CourtCardNow';
import { PEEK_CARD_W, PeekCardBody, PeekHeldBody, peekFrame, useCourtPicturesGo } from '@/components/place/CourtsNearPeek';
import { hitShort } from '@/features/hits/format';
import { canSeeHitAt, hitsAtCourt, openHits } from '@/features/hits/visible';
import { countLabel, sameCourt } from '@/features/places/court';
import { labelOf, looksPublic } from '@/features/places/courtName';
import { courtSurfaceOf, surfaceAdjective } from '@/features/places/courtSurface';
import { surfaceTint } from '@/components/place/SurfaceTag';
import { canSeeAtCourt, courtSeeing } from '@/features/places/useCourtPosts';
import { openCourt } from '@/features/players/courtLink';
import { biggerFirst, courtRows, fetchCourts, isClosedCourt, peekCourts, peekSavedCourts, type Court, type CourtRow } from '@/features/players/courts';
import { FirstReveal } from '@/features/feed/FirstReveal';
import { CourtsGlow, useCourtsGlowOn } from '@/features/community/CourtsGlow';
import { Fold } from '@/components/ui/Fold';
import { formatMiles, milesBetween } from '@/features/players/geo';
import { IN_TOWN_MILES } from '@/features/players/mapModel';
import type { LatLng } from '@/features/players/positions';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

/**
 * Which card Courts near you shows (Oct 24, owner: "Ok do map peek, but fix the wording under"):
 *   'N'   Map peek: the court's own map on top, surface + status as small chips on it, the name under it
 *         (CourtsNearPeek has the card, and when its maps are drawn)
 *   'now' the outlined card before it, kept to go back to: the surface tag and status on top, the name and distance under them
 */
export const COURTS_LOOK: 'now' | 'N' = 'N';
/**
 * Map peek's little maps are drawn on the phone by the hidden snapshot view, on the page the app opens to,
 * and that has never run on a real iPhone (this Mac has no Xcode). So admin accounts (the owner's own phone)
 * get it first; everyone else keeps the outlined card until he has seen it on his phone. Then turn this on.
 */
export const PEEK_FOR_EVERYONE = false;
/** The card this person sees: map peek, or the outlined card. */
export function usePeekLook(): 'now' | 'N' {
  const { users, currentUserId } = useApp();
  const admin = !!users.find((u) => u.id === currentUserId)?.isAdmin;
  return COURTS_LOOK === 'N' && (PEEK_FOR_EVERYONE || admin) ? 'N' : 'now';
}

// The outlined card's size and room (CourtCardNow has its body, shared with a city's Most active courts).
const CARD = NOW_CARD_W;
const PAD = NOW_PAD;
const MOST = 8;

/** The line under a card's name: how far, how many courts, lights. */
function metaLine(miles: number, count: number, lit: boolean | undefined): string {
  return [formatMiles(miles), count > 1 ? `${count} courts` : null, lit ? 'lights' : null].filter(Boolean).join(' · ');
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
export function CourtsNear({ center, revealOrder, foldGap = 0, pictures = true }: {
  center: LatLng | null;
  /** On the start page: its place in the first showing's stagger (FirstReveal). */ revealOrder?: number;
  /** The gap above it in its list, which the held strip takes with it as it folds shut. */ foldGap?: number;
  /** False in a picture of the page sliding in (a swipe back from a thread): only maps kept from before show, nothing new is drawn mid-swipe. */ pictures?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const LOOK = usePeekLook();
  // The soft light behind this section (CourtsGlow; Oct 26, owner: "only under courts near you").
  const glow = useCourtsGlowOn() ? <CourtsGlow /> : null;
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
  // Map peek: how many cards from the left have been on screen, so only those draw their maps
  // (2–3 at first, then each one as the strip is swiped to it), and not while the app is opening.
  const picturesGo = useCourtPicturesGo() && pictures;
  const { width: screenW } = useWindowDimensions();
  const step = (LOOK === 'now' ? CARD : PEEK_CARD_W) + spacing.sm;
  const [seen, setSeen] = useState(() => Math.ceil((screenW - 2 * spacing.lg) / step));
  // Counted once the strip comes to rest, so a new map is never started (on a phone, a web view
  // made) while a finger or a fling is moving the strip.
  const rest = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (rest.current) clearTimeout(rest.current); }, []);
  const sawTo = (right: number) => {
    const n = Math.ceil(right / step);
    if (rest.current) clearTimeout(rest.current);
    rest.current = setTimeout(() => { rest.current = null; setSeen((was) => Math.max(was, n)); }, 250);
  };
  if (!rows.length && (holding || heldShown)) {
    const held = (
      <View style={styles.wrap} accessible accessibilityLabel="Loading courts near you">
        {glow}
        <View style={styles.head}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>Courts near you</Text>
        </View>
        <View style={[styles.row, styles.heldRow]}>
          {[0, 1, 2].map((i) => (
            LOOK === 'N' ? <View key={i} style={[styles.card, peekFrame]}><PeekHeldBody /></View> :
            <View key={i} style={styles.card}><NowHeldBody /></View>
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
      {glow}
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title}>Courts near you</Text>
      </View>
      {/* Starts and ends at the page's margins like the topic strip (the pane clips anything wider), so a card cut at the edge says there are more; a drag along it never turns the page. */}
      <ScrollView nativeID="courts-near-strip" horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.row}
        onLayout={LOOK === 'now' ? undefined : (e) => sawTo(e.nativeEvent.layout.width)}
        onScroll={LOOK === 'now' ? undefined : (e) => sawTo(e.nativeEvent.contentOffset.x + e.nativeEvent.layoutMeasurement.width)}
        scrollEventThrottle={LOOK === 'now' ? undefined : 100}>
        {rows.map(({ c, miles }, i) => {
          const kind = courtSurfaceOf(c);
          const meta = metaLine(miles, c.count, c.lit);
          const badge = badges.get(c.id);
          // The tag said aloud: "hard courts".
          const said = kind ? `${surfaceAdjective[kind]} court${c.count === 1 ? '' : 's'}` : null;
          return (
            <SwipePressable
              key={c.id}
              accessibilityRole="link"
              accessibilityLabel={[labelOf(c), meta, said, badge?.hit ? `hit ${badge.hit}` : null, badge?.posts].filter(Boolean).join(', ')}
              onPress={() => openCourt({ id: c.id, name: labelOf(c), lat: c.lat, lng: c.lng })}
              style={({ pressed }) => [styles.card, LOOK === 'N' && peekFrame, pressed && styles.cardPressed]}
            >
              {LOOK === 'N' ? (
                <PeekCardBody name={labelOf(c)} lat={c.lat} lng={c.lng} meta={meta} kind={kind} tint={surfaceTint(kind)}
                  hit={badge?.hit ?? null} posts={badge?.posts ?? null} draw={picturesGo && i < seen} />
              ) : (
                <NowCardBody name={labelOf(c)} meta={meta} kind={kind} tint={surfaceTint(kind)} hit={badge?.hit ?? null} posts={badge?.posts ?? null} />
              )}
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
  allCard: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  allDisc: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  allText: { ...typography.smallStrong, color: colors.brand, textAlign: 'center' },
  // The strip holding its place: the cards' own shape (CourtCardNow's NowHeldBody, CourtsNearPeek's PeekHeldBody), in the page's quiet tone.
  heldRow: { flexDirection: 'row', overflow: 'hidden' },
});
