import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { CardCredit } from '@/components/map/MapChrome';
import { MapCardLoading } from '@/components/map/MapLoadState';
import type { PeekHit } from '@/data/types';
import { hitShort } from '@/features/hits/format';
import { fetchCourts, isClosedCourt, type Court } from '@/features/players/courts';
import { milesBetween } from '@/features/players/geo';
import { placeFor, type LatLng } from '@/features/players/positions';
import type { GuestCourtPin, GuestCourtsCanvasProps } from '@/features/guest/GuestCourtsCanvas';
import { colors, radius, spacing, typography, withAlpha } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { loadMapCss } from '@/components/map/mapCss';

/** How many open hits Find Players asks the peek for (GuestFindPlayers): a list this long may have more behind it. */
export const GUEST_PEEK_LIMIT = 30;
/** Where the map shows the town before anyone says where they are, when the open hits name none we know. */
const FALLBACK_CITY = 'Raleigh, NC';
/** The teaser's view of a town: its middle, a little closer than the players' card, so its courts read. */
const TOWN_ZOOM = 10.8;
/** Once the visitor is found: their neighbourhood, courts a few miles round. */
const NEAR_ZOOM = 12.6;
/** The most courts put on the map round the visitor (the nearest). */
const MAX_NEAR_COURTS = 80;
/** An open hit this close (km, the peek's own distance) counts as nearby. */
const NEAR_KM = 16;

/*
 * The map engine is a megabyte: it comes in through WebMap, the one door
 * the players' map uses too, only when this card is drawn. If it cannot be
 * fetched, the card keeps its plain ground, and everything over it still works.
 */
const Canvas = lazy(() => Promise.all([import('@/components/map/WebMap'), loadMapCss()]).then(([m]) => m).then(
  (m) => ({ default: m.GuestCourtsCanvas as React.ComponentType<GuestCourtsCanvasProps> }),
  () => ({ default: (() => null) as React.ComponentType<GuestCourtsCanvasProps> }),
));

export interface GuestCourtsMapProps {
  /** Where the visitor is, once they have said (the same spot the list below sorts by). */
  near: LatLng | null;
  /** The open hits the list below shows (the peek's): undefined while loading, null when they could not load. */
  hits: PeekHit[] | null | undefined;
  locating: boolean;
  /** The browser said no (or could not find them): the chip says so, quietly. */
  failed: 'denied' | 'unavailable' | null;
  onLocate: () => void;
}

/** The town most of the open hits are in, as a place we can put on the map. */
function busiestTown(hits: PeekHit[]): { name: string; at: LatLng; hits: number } | null {
  const tally = new Map<string, { name: string; at: LatLng; hits: number }>();
  for (const h of hits) {
    const place = h.court.area ? placeFor(h.court.area) : undefined;
    if (!place) continue;
    const row = tally.get(place.name) ?? { name: place.name, at: { lat: place.lat, lng: place.lng }, hits: 0 };
    row.hits += 1;
    tally.set(place.name, row);
  }
  let best: { name: string; at: LatLng; hits: number } | null = null;
  for (const row of tally.values()) if (!best || row.hits > best.hits) best = row;
  return best;
}

/** Each court's open hits: how many, and the soonest one's time. */
function hitsAtCourts(hits: PeekHit[] | null | undefined): Map<string, { n: number; first: string }> {
  const at = new Map<string, { n: number; first: string }>();
  for (const h of hits ?? []) {
    if (!h.court.id) continue;
    const row = at.get(h.court.id);
    if (!row) at.set(h.court.id, { n: 1, first: h.startsAt });
    else { row.n += 1; if (h.startsAt < row.first) row.first = h.startsAt; }
  }
  return at;
}

const pinsFor = (courts: Court[], hits: PeekHit[] | null | undefined): GuestCourtPin[] => {
  const at = hitsAtCourts(hits);
  return courts.map((court) => {
    const on = at.get(court.id);
    return { court, hits: on?.n ?? 0, tag: on ? `Hit ${hitShort(on.first).replace(/^Today /, '')}` : undefined };
  });
};

/**
 * Find Players for a guest (guest mode, Oct 29; owner: "Why does the web link
 * not show map when I turn on location", then on how to ask: "ask on tap
 * then, but make a button they want to tap and almost have fomo if they dont
 * tap or dont find out"): a map of courts, the same card the players get, at
 * the top of the page. Courts and the open hits at them only: never a
 * player, a friend, a face, Up to hit or anyone's spot.
 *
 * Before the visitor says where they are, the map shows the town most of the
 * open hits are in, crisp, with what is true there on a chip ("Raleigh · 4
 * open hits") and one small round locate button in its corner, as Apple Maps
 * has, that asks the browser for their location (Nov 28, owner, of the row
 * that did this under the map: "the show courts near me just looks ai").
 * Yes: the map flies to them, their courts and the open hits at them. No (or
 * the browser can't tell): the chip says so in a few words, nothing more.
 * Nothing is asked when the page opens; a browser that already allows it is
 * simply found (GuestFindPlayers).
 */
export function GuestCourtsMap(props: GuestCourtsMapProps) {
  return <MapCard {...props} />;
}

/** What the card shows: the town or the visitor's courts, the pins, the engine's arrival, the how-to. */
function useCardData({ near, hits: listed, locating, failed }: Pick<GuestCourtsMapProps, 'near' | 'hits' | 'locating' | 'failed'>) {
  // While the list fetches its hits again (nearest first, once they are found), the map keeps the ones it has,
  // so the courts' "Hit 4pm" never blink off mid-flight.
  const [kept, setKept] = useState<PeekHit[] | null | undefined>(listed);
  useEffect(() => { if (listed !== undefined) setKept(listed); }, [listed]);
  const hits = listed === undefined ? kept : listed;
  // The town shown before they are found: settled once, from the first list of open hits (so it never jumps).
  const [town, setTown] = useState<{ name: string; at: LatLng; hits: number } | null>(null);
  const [townMore, setTownMore] = useState(false);
  useEffect(() => {
    if (town || near || hits === undefined) return;
    const busiest = hits ? busiestTown(hits) : null;
    const fallback = placeFor(FALLBACK_CITY);
    setTown(busiest ?? (fallback ? { name: fallback.name, at: { lat: fallback.lat, lng: fallback.lng }, hits: 0 } : null));
    // A full list may have more of them behind it: "30+".
    setTownMore(!!hits && hits.length >= GUEST_PEEK_LIMIT && !!busiest && busiest.hits === hits.length);
  }, [town, near, hits]);

  const [townCourts, setTownCourts] = useState<Court[] | null>(null);
  useEffect(() => {
    if (!town) return undefined;
    let live = true;
    fetchCourts(town.at).then((got) => { if (live) setTownCourts(got.filter((c) => !isClosedCourt(c))); }).catch(() => { if (live) setTownCourts([]); });
    return () => { live = false; };
  }, [town]);

  const [nearCourts, setNearCourts] = useState<Court[] | null>(null);
  useEffect(() => {
    if (!near) { setNearCourts(null); return undefined; }
    let live = true;
    fetchCourts(near).then((got) => {
      if (!live) return;
      const nearest = got.map((c) => ({ c, d: milesBetween(near, c) })).sort((a, b) => a.d - b.d).slice(0, MAX_NEAR_COURTS).map((x) => x.c);
      setNearCourts(nearest);
    }).catch(() => { if (live) setNearCourts([]); });
    return () => { live = false; };
  }, [near?.lat, near?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Found, with their courts in: the map flies to them, all in one move.
  const found = !!near && nearCourts !== null;
  const finding = locating || (!!near && !found);
  const center = (found ? near : town?.at) ?? near ?? null;
  // The view takes in them and their nearest few courts (at most a few miles out).
  const fit = useMemo(() => (found && near ? [near, ...(nearCourts ?? []).filter((c) => milesBetween(near, c) <= 4).slice(0, 8)] : null), [found, near, nearCourts]);
  const pins = useMemo(
    () => (found ? pinsFor(nearCourts ?? [], hits) : pinsFor(townCourts ?? [], hits)),
    [found, nearCourts, townCourts, hits],
  );
  const [drawn, setDrawn] = useState(false);
  // The map engine (a megabyte) is fetched once the page has drawn and the browser is idle, so the open
  // hits below come first on a slow in-app browser; straight away when they are already found.
  const [engine, setEngine] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') { setEngine(true); return undefined; }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const idle = w.requestIdleCallback(() => setEngine(true), { timeout: 1500 });
      return () => w.cancelIdleCallback?.(idle);
    }
    const t = setTimeout(() => setEngine(true), 400);
    return () => clearTimeout(t);
  }, []);
  const openCourt = (c: Court) => router.push({ pathname: '/court/[id]', params: { id: c.id, name: c.name, lat: String(c.lat), lng: String(c.lng) } });

  const townName = town ? town.name.split(',')[0] : '';
  const townCourtCount = townCourts ? townCourts.reduce((n, c) => n + Math.max(1, c.count || 1), 0) : 0;
  const nearHits = found ? (hits ?? []).filter((h) => h.km !== undefined && h.km <= NEAR_KM).length : 0;
  return { hits, town, townCourts, nearCourts, found, finding, center, fit, pins, drawn, setDrawn, engine, openCourt, townName, townMore, townCourtCount, nearHits };
}

/** The map's height: a phone's width of map, edge to edge. */
const MAP_HEIGHT = 260;
/** Narrower than this the page is a phone's, where the map runs out to the screen's edges. */
const PHONE_WIDE = 640;

/**
 * The card (Nov 27, owner, of three options for this screen: "c is the best"): the map drawn crisp, never
 * blurred, veiled or haloed, out to the screen's edges on a phone, with one small chip on it saying what is
 * true there, and one small round locate button opposite it (Nov 28: the row under the map is gone). Both
 * are drawn with the card, before the map engine arrives, and never wait on it. No pulse, no weather, no town pill.
 */
function MapCard({ near, hits: listed, locating, failed, onLocate }: GuestCourtsMapProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { width } = useWindowDimensions();
  const { town, townMore, nearCourts, found, finding, center, fit, pins, drawn, setDrawn, engine, openCourt, townName, townCourtCount, nearHits } = useCardData({ near, hits: listed, locating, failed });
  const edge = width < PHONE_WIDE;
  const nearCount = nearCourts?.length ?? 0;
  const hitsWord = (n: number, more = false) => `${n}${more ? '+' : ''} open ${n === 1 ? 'hit' : 'hits'}`;

  // The map itself, crisp: it comes in on its own layer once drawn (the only thing here that fades, and it holds no blur).
  const map = (
    <View style={[styles.mapArea, edge ? styles.mapEdge : styles.mapAlone]}>
      <MapCardLoading moving={false} />
      {center ? (
        <View aria-hidden={!found} style={[StyleSheet.absoluteFill, styles.clip, { opacity: drawn ? 1 : 0, transition: 'opacity 400ms cubic-bezier(0.45, 0, 0.55, 1)' } as object]}>
          {engine || near ? (
            <Suspense fallback={null}>
              <Canvas center={center} zoom={found ? NEAR_ZOOM : TOWN_ZOOM} fit={fit} fly={found} pins={pins} me={found ? near : null} still={!found} onCourt={openCourt} onDrawn={() => setDrawn(true)} />
            </Suspense>
          ) : null}
        </View>
      ) : null}
      {town || found || failed ? (
        // Its see-through ground follows the court (a withAlpha in the sheet would keep the light court's colour).
        <View pointerEvents="none" style={[styles.chip, { backgroundColor: withAlpha(colors.surface, 0.9) }]}>
          <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={styles.chipText}>
            {failed && !found && !finding
              ? failed === 'denied' ? 'Location is off in your browser' : 'Couldn’t find where you are'
              : found
              ? `Near you · ${nearHits > 0 ? hitsWord(nearHits) : `${nearCount} courts`}`
              : town && town.hits > 0 ? `${townName} · ${hitsWord(town.hits, townMore)}` : `${townName}${townCourtCount > 0 ? ` · ${townCourtCount} courts` : ''}`}
          </Text>
        </View>
      ) : null}
      {/* Courts near me: one small round button, the chip's own see-through look (Nov 28). Found, it stays lit. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={found ? 'Showing courts near you' : finding ? 'Finding you' : 'Show courts near me'}
        accessibilityState={{ disabled: finding || found, busy: finding, selected: found }}
        disabled={finding || found}
        onPress={onLocate}
        hitSlop={6}
        style={({ pressed }) => [styles.locate, { backgroundColor: withAlpha(colors.surface, 0.9) }, pressed && styles.locatePressed]}
      >
        {finding ? <CourtSpinner size={16} /> : <Ionicons name={found ? 'navigate' : 'navigate-outline'} size={17} color={colors.brand} />}
      </Pressable>
      <CardCredit />
    </View>
  );

  return (
    <View accessibilityLabel="Map of courts near you" style={[styles.wrap, edge && styles.wrapEdge]}>
      {map}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  clip: { overflow: 'hidden' },
  mapArea: { position: 'relative', height: MAP_HEIGHT, overflow: 'hidden', backgroundColor: colors.bgElevated },
  // On a computer: the map as a card of its own.
  mapAlone: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border },
  // On a phone: out to the screen's edges, a hairline above and below.
  mapEdge: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  wrap: { gap: spacing.md },
  wrapEdge: { marginHorizontal: -spacing.lg },
  chip: { position: 'absolute', left: 12, top: 12, maxWidth: '80%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  chipText: { ...typography.smallStrong, color: colors.text },
  // Opposite the chip, the same see-through ground and hairline; a thumb's reach with its hitSlop.
  locate: { position: 'absolute', right: 12, top: 12, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  locatePressed: { transform: [{ scale: 0.94 }] },
});
