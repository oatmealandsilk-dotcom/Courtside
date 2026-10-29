import { PRESS_DIM } from '@/theme/press';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SwipePressable } from '@/components/SwipePressable';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { HitGlyph } from '@/components/HitGlyph';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { Button } from '@/components/ui';
import { fetchPeekHits } from '@/data/api';
import type { PeekHit } from '@/data/types';
import { FORMAT_LABEL, hitShort, levelText } from '@/features/hits/format';
import { courtRows, fetchCourts, isClosedCourt, type CourtRow } from '@/features/players/courts';
import { formatSpotMiles } from '@/features/players/geo';
import { getPosition } from '@/lib/geo';
import { colors, lift, radius, spacing, typography } from '@/theme';
import { GUEST_PEEK_LIMIT, GuestCourtsMap } from './GuestCourtsMap';
import { openJoinSheet } from './joinAsk';
import { TextScale } from '@/theme/textScale';

const spotsText = (n: number) => (n === 1 ? '1 spot left' : `${n} spots left`);
const DENIED_NOTE = 'Location is off for this site, so here are the soonest hits.';
/** Set just before the page reloads after a second "no" in a row, so the reloaded page keeps the how-to up. */
const RELOADED_KEY = 'cs-guest-loc-reloaded';

/**
 * Community → Find Players for a guest (guest mode, Oct 17): the open hits a
 * stranger may see (the peek's own list, peek_hits, migration 163: public
 * adults' hits at listed courts, no names) and, once they tap "Use my
 * location", the courts near them. Never the players map, never people,
 * nobody's spot. Over them (Oct 29), a map of courts and the open hits at
 * them only (GuestCourtsMap), which asks for their location on a tap of its
 * own button; the two share the one spot. "I'm in" asks them to join, and joins the hit once they are
 * in (useShareLanding), the same as the peek.
 */
export function GuestFindPlayers() {
  const styles = useThemedStyles(styleDefinitions);
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [hits, setHits] = useState<PeekHit[] | null | undefined>(undefined);
  const [courts, setCourts] = useState<CourtRow[] | null>(null);
  // Why the last ask for their location came back empty, for the map's how-to.
  const [locFail, setLocFail] = useState<'denied' | 'unavailable' | null>(null);
  // How many asks in a row came back "no". iPhone browsers (Safari, and the ones inside Messenger and
  // Instagram) can keep saying no without asking again until the page reloads, even once the setting is
  // fixed, so a second "no" in a row reloads the page: if it is allowed now, the quiet check finds them.
  const deniedRun = useRef(0);

  const load = useCallback((point: { lat: number; lng: number } | null) => {
    let live = true;
    setHits(undefined);
    fetchPeekHits(point, GUEST_PEEK_LIMIT).then((got) => { if (live) setHits(got); }).catch(() => { if (live) setHits(null); });
    if (point) fetchCourts(point).then((got) => { if (live) setCourts(courtRows(got.filter((c) => !isClosedCourt(c)), point).slice(0, 6)); }).catch(() => { if (live) setCourts([]); });
    return () => { live = false; };
  }, []);
  useEffect(() => load(near), [near, load]);
  // A browser that already lets this site know where it is (said yes before) is simply found, with no
  // question: the map shows their courts straight away. Anything else waits for a tap (owner: "ask on tap").
  useEffect(() => {
    let live = true;
    let reloaded = false;
    try {
      reloaded = Platform.OS === 'web' && typeof sessionStorage !== 'undefined' && sessionStorage.getItem(RELOADED_KEY) === '1';
      if (reloaded) sessionStorage.removeItem(RELOADED_KEY);
    } catch { /* no storage: nothing to carry over */ }
    getPosition({ quiet: true }).then((got) => {
      if (!live) return;
      if (got.ok) { setNear((was) => was ?? { lat: got.lat, lng: got.lng }); return; }
      // Reloaded after a "no" and still not allowed: the how-to stays up, as it was before the reload.
      if (reloaded) { setLocFail('denied'); setNote(DENIED_NOTE); }
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const locate = async () => {
    if (locating) return;
    setLocating(true);
    setNote(null);
    const got = await getPosition({}).catch(() => ({ ok: false as const, reason: 'unavailable' as const }));
    setLocating(false);
    if (got.ok) { deniedRun.current = 0; setLocFail(null); setNear({ lat: got.lat, lng: got.lng }); return; }
    deniedRun.current = got.reason === 'denied' ? deniedRun.current + 1 : 0;
    if (deniedRun.current >= 2 && Platform.OS === 'web' && typeof window !== 'undefined') {
      try { sessionStorage.setItem(RELOADED_KEY, '1'); } catch { /* the reloaded page just opens on the button */ }
      window.location.reload();
      return;
    }
    setLocFail(got.reason === 'denied' ? 'denied' : 'unavailable');
    setNote(got.reason === 'denied' ? DENIED_NOTE : 'Couldn’t find where you are. Here are the soonest hits.');
  };

  const join = (hit: PeekHit) => openJoinSheet(hit.hostFirst ? `join ${hit.hostFirst}’s hit` : 'join this hit', {
    target: { href: `/hit-request/${hit.id}`, joinHit: hit.id, host: hit.hostFirst || undefined },
  });

  return (
    <View style={styles.wrap}>
      <GuestCourtsMap near={near} hits={hits} locating={locating} failed={locFail} onLocate={() => { void locate(); }} />
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title}>Open hits</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.body}>Players looking for someone to hit with in the next 7 days.</Text>
      </View>
      {near ? (
        <View style={[styles.pill, styles.pillOn]}>
          <Ionicons name="navigate" size={14} color={colors.brand} />
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.pillText, styles.pillOnText]}>Nearest first</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Stop using my location" hitSlop={10} onPress={() => { setNear(null); setCourts(null); }}>
            <Ionicons name="close" size={15} color={colors.brand} />
          </Pressable>
        </View>
      ) : (
        <SwipePressable accessibilityRole="button" onPress={() => { void locate(); }} disabled={locating} style={({ pressed }) => [styles.pill, styles.locate, pressed && styles.pressed]}>
          <Ionicons name="navigate-outline" size={15} color={colors.brandInk} />
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.pillText, styles.locateText]}>{locating ? 'Finding you…' : 'Use my location'}</Text>
        </SwipePressable>
      )}
      {note ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.note}>{note}</Text> : null}

      {hits === undefined ? (
        <View style={styles.loading}><CourtSpinner size={28} /></View>
      ) : !hits?.length ? (
        <View style={[styles.card, styles.empty]}>
          <View style={styles.emptyIcon}><HitGlyph size={22} color={colors.brand} /></View>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.emptyTitle}>{hits === null ? 'Couldn’t load the hits' : 'No open hits near you yet'}</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.emptyBody}>{hits === null ? 'Check your connection and try again.' : 'Be the first to post one. Players near you see it straight away.'}</Text>
          <Button label={hits === null ? 'Try again' : 'Post the first hit'} size="sm" variant={hits === null ? 'secondary' : 'primary'} onPress={() => (hits === null ? load(near) : openJoinSheet('post a hit'))} />
        </View>
      ) : (
        <View style={styles.list}>
          {hits.map((h) => {
            const where = [h.court.area, h.km !== undefined ? formatSpotMiles(h.km / 1.609, true) : ''].filter(Boolean).join(' · ');
            return (
              <View key={h.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.when}>{hitShort(h.startsAt)}</Text>
                  <View style={styles.spots}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.spotsText}>{spotsText(h.spotsLeft)}</Text></View>
                </View>
                <View style={styles.placeRow}>
                  <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.place} numberOfLines={2}>{h.court.name}</Text>
                </View>
                {where ? <Text style={styles.where}>{where}</Text> : null}
                <View style={styles.cardFoot}>
                  <View style={styles.chips}>
                    <View style={styles.chip}><Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.chipText}>{FORMAT_LABEL[h.format]}</Text></View>
                    <View style={styles.chip}><Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.chipText}>{levelText(h, h.skillSystem)}</Text></View>
                  </View>
                  <Button label="I'm in" size="sm" onPress={() => join(h)} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {courts?.length ? (
        <View style={styles.list}>
          <View style={styles.head}>
            <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title}>Courts near you</Text>
          </View>
          {courts.map(({ c, miles }) => (
            <SwipePressable key={c.id} accessibilityRole="link" onPress={() => router.push({ pathname: '/court/[id]', params: { id: c.id, name: c.name, lat: String(c.lat), lng: String(c.lng) } })} style={({ pressed }) => [styles.court, pressed && styles.pressed]}>
              <View style={styles.courtTile}><CourtGlyph size={22} color={colors.brand} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.courtName} numberOfLines={1}>{c.name || 'Tennis courts'}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.courtMeta} numberOfLines={1}>{[c.count > 1 ? `${c.count} courts` : '1 court', formatSpotMiles(miles, false), c.lit ? 'Lights' : null].filter(Boolean).join(' · ')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </SwipePressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The Profile tab for a guest, and Coaching when nobody is listed for guests
 * yet: one calm card with the way in, never a pop-up.
 */
export function GuestJoinCard({ title, body }: { title: string; body: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.card, styles.empty]}>
      <View style={styles.emptyIcon}><Ionicons name="person-outline" size={22} color={colors.brand} /></View>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.emptyTitle}>{title}</Text>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.emptyBody}>{body}</Text>
      <Button label="Create a free account" full onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'create' } })} />
      <Button label="I already have an account" variant="secondary" full onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'sign-in' } })} />
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  head: { gap: 3, paddingTop: spacing.sm },
  title: { ...typography.heading, color: colors.text },
  body: { ...typography.small, color: colors.textMuted },
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pillText: { ...typography.smallStrong, color: colors.textMuted },
  pillOn: { backgroundColor: colors.brandDim, borderColor: colors.brandDim },
  pillOnText: { color: colors.brand },
  locate: { backgroundColor: colors.brand, borderColor: colors.brand, paddingHorizontal: 16 },
  locateText: { color: colors.brandInk },
  pressed: { opacity: PRESS_DIM },
  note: { ...typography.small, color: colors.textMuted },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  list: { gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, ...lift },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  when: { ...typography.title, color: colors.text, flexShrink: 1 },
  spots: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  spotsText: { ...typography.smallStrong, color: colors.brand },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  place: { ...typography.heading, color: colors.text, flexShrink: 1 },
  where: { ...typography.small, color: colors.textMuted, marginTop: -4, marginLeft: 22 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, flex: 1 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  chipText: { ...typography.smallStrong, color: colors.textMuted },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  emptyBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', maxWidth: 300 },
  court: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  courtTile: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  courtName: { ...typography.bodyStrong, color: colors.text },
  courtMeta: { ...typography.small, color: colors.textMuted },
});
