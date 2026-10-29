import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { CardCredit, PreviewOverlay } from '@/components/map/MapChrome';
import { MapCardLoading } from '@/components/map/MapLoadState';
import { CARD_HEIGHT } from '@/components/map/cardFit';
import { BrandWash } from '@/components/ui';
import type { PeekHit } from '@/data/types';
import { hitShort } from '@/features/hits/format';
import { fetchCourts, isClosedCourt, type Court } from '@/features/players/courts';
import { milesBetween } from '@/features/players/geo';
import { placeFor, type LatLng } from '@/features/players/positions';
import { useWeather } from '@/features/players/useWeather';
import type { GuestCourtPin, GuestCourtsCanvasProps } from '@/features/guest/GuestCourtsCanvas';
import { locationHelpFor } from '@/features/guest/locationHelp';
import { buttonShape, colors, radius, spacing, typography, withAlpha } from '@/theme';
import { PRESS_DIM } from '@/theme/press';
import { TextScale } from '@/theme/textScale';
import { useThemedStyles } from '@/theme/ThemeProvider';

/** How many open hits Find Players asks the peek for (GuestFindPlayers): a list this long may have more behind it. */
export const GUEST_PEEK_LIMIT = 30;
/** Where the map shows the town before anyone says where they are, when the open hits name none we know. */
const FALLBACK_CITY = 'Raleigh, NC';
/** The teaser's view of a town: its middle, a little closer than the players' card, so its courts read under the blur. */
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
const Canvas = lazy(() => import('@/components/map/WebMap').then(
  (m) => ({ default: m.GuestCourtsCanvas as React.ComponentType<GuestCourtsCanvasProps> }),
  () => ({ default: (() => null) as React.ComponentType<GuestCourtsCanvasProps> }),
));

export interface GuestCourtsMapProps {
  /** Where the visitor is, once they have said (the same spot the list below sorts by). */
  near: LatLng | null;
  /** The open hits the list below shows (the peek's): undefined while loading, null when they could not load. */
  hits: PeekHit[] | null | undefined;
  locating: boolean;
  /** The browser said no (or could not find them): the how-to replaces the button. */
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

const CTA_CSS_ID = 'cs-guest-cta-css';
const CTA_CSS = `@keyframes cs-guest-cta{0%{transform:scale(1);opacity:.55}70%{transform:scale(1.12,1.5);opacity:0}100%{transform:scale(1.12,1.5);opacity:0}}
.cs-guest-cta-pulse{position:absolute;inset:0;border-radius:18px;pointer-events:none;animation:cs-guest-cta 2.2s cubic-bezier(.22,.61,.36,1) infinite}
@media (prefers-reduced-motion:reduce){.cs-guest-cta-pulse{animation:none;opacity:0}}`;

/**
 * Find Players for a guest (guest mode, Oct 29; owner: "Why does the web link
 * not show map when I turn on location", then on how to ask: "ask on tap
 * then, but make a button they want to tap and almost have fomo if they dont
 * tap or dont find out"): a map of courts, the same card the players get, at
 * the top of the page. Courts and the open hits at them only: never a
 * player, a friend, a face, Up to hit or anyone's spot.
 *
 * Before the visitor says where they are, the map shows the town most of the
 * open hits are in, softened, with what is true there this week ("4 open
 * hits in Raleigh this week") and one green button that asks the browser
 * for their location. Yes: the softening lifts and the map flies to them,
 * their courts and the open hits at them. No (or the browser can't tell):
 * the button says Location is off, with the two steps for this browser.
 * Nothing is asked when the page opens; a browser that already allows it is
 * simply found (GuestFindPlayers).
 */
export function GuestCourtsMap({ near, hits: listed, locating, failed, onLocate }: GuestCourtsMapProps) {
  const styles = useThemedStyles(styleDefinitions);
  // While the list fetches its hits again (nearest first, once they are found), the map keeps the ones it has,
  // so the courts' "Hit 4pm" never blink off mid-flight.
  const [kept, setKept] = useState<PeekHit[] | null | undefined>(listed);
  useEffect(() => { if (listed !== undefined) setKept(listed); }, [listed]);
  const hits = listed === undefined ? kept : listed;
  // The town shown before they are found: settled once, from the first list of open hits (so it never jumps).
  const [town, setTown] = useState<{ name: string; at: LatLng; hits: number } | null>(null);
  const [townMore, setTownMore] = useState(false);
  const [anyHits, setAnyHits] = useState(false);
  useEffect(() => {
    if (town || near || hits === undefined) return;
    const busiest = hits ? busiestTown(hits) : null;
    const fallback = placeFor(FALLBACK_CITY);
    setTown(busiest ?? (fallback ? { name: fallback.name, at: { lat: fallback.lat, lng: fallback.lng }, hits: 0 } : null));
    // A full list may have more of them behind it: "30+".
    setTownMore(!!hits && hits.length >= GUEST_PEEK_LIMIT && !!busiest && busiest.hits === hits.length);
    setAnyHits(!!hits?.length);
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

  // Found, with their courts in: the softening lifts and the map flies to them, all in one move.
  const found = !!near && nearCourts !== null;
  const finding = locating || (!!near && !found);
  const center = (found ? near : town?.at) ?? near ?? null;
  // The view takes in them and their nearest few courts (at most a few miles out).
  const fit = useMemo(() => (found && near ? [near, ...(nearCourts ?? []).filter((c) => milesBetween(near, c) <= 4).slice(0, 8)] : null), [found, near, nearCourts]);
  const pins = useMemo(
    () => (found ? pinsFor(nearCourts ?? [], hits) : pinsFor(townCourts ?? [], hits)),
    [found, nearCourts, townCourts, hits],
  );
  const weather = useWeather(center);
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
  const [helpOpen, setHelpOpen] = useState(true);
  useEffect(() => { if (failed) setHelpOpen(true); }, [failed]);
  const help = useMemo(() => locationHelpFor(typeof navigator !== 'undefined' ? navigator.userAgent : ''), []);

  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById(CTA_CSS_ID)) return;
    const css = document.createElement('style');
    css.id = CTA_CSS_ID;
    css.textContent = CTA_CSS;
    document.head.appendChild(css);
  }, []);

  const openCourt = (c: Court) => router.push({ pathname: '/court/[id]', params: { id: c.id, name: c.name, lat: String(c.lat), lng: String(c.lng) } });

  const townName = town ? town.name.split(',')[0] : '';
  const townCourtCount = townCourts ? townCourts.reduce((n, c) => n + Math.max(1, c.count || 1), 0) : 0;
  // Only what is true: the open hits the peek lists in that town, else the courts the map has there. Never
  // "near you" for the town shown: the app does not know where they are until they tap.
  const headline = town && town.hits > 0
    ? `${town.hits}${townMore ? '+' : ''} open ${town.hits === 1 ? 'hit' : 'hits'} in ${townName}`
    : town && townCourtCount > 0 ? `${townCourtCount} courts in ${townName}` : town ? `Courts in ${townName}` : 'The courts near you';
  const sub = anyHits
    ? 'Players are looking for someone to hit with. See which courts near you have a spot.'
    : 'See every court near you, and the open hits at them.';
  // A soft halo of the page behind the words, so they read over the glimpse of the map with no box round them.
  const halo = { backgroundImage: `radial-gradient(ellipse 72% 58% at 50% 52%, ${withAlpha(colors.bg, 0.82)} 0%, ${withAlpha(colors.bg, 0.55)} 55%, ${withAlpha(colors.bg, 0)} 100%)` } as object;
  const nearHits = found ? (hits ?? []).filter((h) => h.km !== undefined && h.km <= NEAR_KM).length : 0;

  return (
    <View accessibilityLabel="Map of courts near you" style={[styles.card, failed && !found && styles.cardGrow]}>
      <MapCardLoading moving={false} />
      {center ? (
        <View aria-hidden={!found} style={[StyleSheet.absoluteFill, styles.clip, { opacity: drawn ? 1 : 0, transition: 'opacity 400ms cubic-bezier(0.45, 0, 0.55, 1)' } as object]}>
          <View style={[StyleSheet.absoluteFill, {
            filter: found ? 'none' : 'blur(3.5px) saturate(1.1)',
            transform: [{ scale: found ? 1 : 1.04 }],
            transition: 'filter 900ms cubic-bezier(.2,.7,.3,1), transform 900ms cubic-bezier(.2,.7,.3,1)',
          } as object]}>
            {engine || near ? (
              <Suspense fallback={null}>
                <Canvas center={center} zoom={found ? NEAR_ZOOM : TOWN_ZOOM} fit={fit} fly={found} pins={pins} me={found ? near : null} still={!found} onCourt={openCourt} onDrawn={() => setDrawn(true)} />
              </Suspense>
            ) : null}
          </View>
        </View>
      ) : null}
      {/* The softening's veil: lifts with the blur. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veil, { opacity: found ? 0 : 1, transition: 'opacity 700ms cubic-bezier(.2,.7,.3,1)' } as object]} />

      {found ? (
        <>
          <PreviewOverlay cityName="Near you" count={0} placeCount={nearCourts?.length ?? 0} hitCount={nearHits} weather={weather} chip />
          <CardCredit />
        </>
      ) : failed ? (
        <View style={[styles.middleFlow, halo]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: helpOpen }} onPress={() => setHelpOpen((o) => !o)} style={({ pressed }) => [styles.offButton, pressed && styles.pressed]}>
            <Ionicons name="location-outline" size={17} color={colors.text} />
            <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.offText}>Location is off — here’s how to turn it on</Text>
          </Pressable>
          {helpOpen ? (
            <View style={styles.steps}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.stepsWhere}>{help.where}</Text>
              {help.steps.map((step, i) => (
                <View key={i} style={styles.step}>
                  <View style={styles.stepNum}><Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.stepNumText}>{i + 1}</Text></View>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.stepText}>{step}</Text>
                </View>
              ))}
              {help.fallback ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.stepsFallback}>{help.fallback}</Text> : null}
              <Pressable accessibilityRole="button" onPress={onLocate} disabled={locating} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
                <BrandWash radius={buttonShape.smallRadius} curve />
                {locating ? <CourtSpinner size={15} ink={colors.brandInk} /> : null}
                <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.retryText}>{locating ? 'Finding you…' : 'Try again'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : (
        <>
          <View style={[styles.middle, halo]}>
            {town ? (
              <View style={styles.live}>
                {town.hits > 0 ? <View style={styles.liveDot} /> : <Ionicons name="location" size={12} color={colors.textMuted} />}
                <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.liveText}>{town.hits > 0 ? 'This week' : townName}</Text>
              </View>
            ) : null}
            <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.headline}>{headline}</Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.sub}>{sub}</Text>
            <View style={styles.ctaWrap}>
              {finding ? null : <div className="cs-guest-cta-pulse" style={{ background: colors.brand }} />}
              <Pressable accessibilityRole="button" onPress={onLocate} disabled={finding} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
                <BrandWash radius={buttonShape.radius} curve />
                {finding ? <CourtSpinner size={17} ink={colors.brandInk} /> : <Ionicons name="navigate" size={17} color={colors.brandInk} />}
                <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.ctaText}>{finding ? 'Finding you…' : anyHits ? 'Find a hit near me' : 'Find courts near me'}</Text>
              </Pressable>
            </View>
            <View style={styles.privacy}>
              <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.privacyText}>Nobody sees where you are</Text>
            </View>
          </View>
          {weather ? (
            <View pointerEvents="none" style={styles.weather}>
              <Ionicons name={weather.icon as keyof typeof Ionicons.glyphMap} size={13} color={colors.text} />
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.weatherText} accessibilityLabel={`${weather.tempF} degrees, ${weather.label}`}>{weather.tempF}°</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // The players' card's own frame (WebMap's card): its height, corners and edge.
  card: { height: CARD_HEIGHT, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  // Denied: at least the card's height, taller when the steps need it.
  cardGrow: { height: 'auto', minHeight: CARD_HEIGHT },
  clip: { overflow: 'hidden' },
  veil: { backgroundColor: withAlpha(colors.bg, 0.3) },
  middle: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.sm },
  middleFlow: { minHeight: CARD_HEIGHT - 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, gap: spacing.sm },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.open },
  liveText: { ...typography.smallStrong, color: colors.text },
  headline: { ...typography.title, fontSize: 25, lineHeight: 30, letterSpacing: -0.4, color: colors.text, textAlign: 'center', marginTop: 2 },
  sub: { ...typography.body, color: colors.text, textAlign: 'center', maxWidth: 300 },
  ctaWrap: { marginTop: spacing.sm, position: 'relative', alignSelf: 'stretch', maxWidth: 320, width: '100%', marginHorizontal: 'auto' } as object,
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, paddingHorizontal: 22, borderRadius: buttonShape.radius, ...buttonShape.curve, backgroundColor: colors.brand, overflow: 'hidden', shadowColor: colors.brand, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  ctaText: { ...typography.bodyStrong, fontSize: 17, color: colors.brandInk },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  privacyText: { ...typography.small, fontSize: 12, color: colors.textMuted, textAlign: 'center', flexShrink: 1 },
  pressed: { opacity: PRESS_DIM },
  weather: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  weatherText: { ...typography.smallStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  offButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: buttonShape.radius, ...buttonShape.curve, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, alignSelf: 'stretch' },
  offText: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  steps: { alignSelf: 'stretch', gap: 10, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  stepsWhere: { ...typography.smallStrong, color: colors.textMuted },
  stepsFallback: { ...typography.small, color: colors.textMuted },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { ...typography.smallStrong, color: colors.brand },
  stepText: { ...typography.body, color: colors.text, flex: 1 },
  retry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: buttonShape.smallHeight + 4, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, backgroundColor: colors.brand, overflow: 'hidden', marginTop: 2 },
  retryText: { ...typography.smallStrong, fontSize: buttonShape.smallLabel, color: colors.brandInk },
});
