import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { CourtMapSnapshots, CourtMapThumb } from '@/components/map/CourtMapThumb';
import { SheetTitle, formBody } from '@/components/sheet/SheetForm';
import { BrandWash, SegmentedControl } from '@/components/ui';
import type { CourtAccess, LiveSession, TaggedCourt } from '@/data/types';
import { LIVE_KINDS, checkInPlan, liveState, seenLine } from '@/features/activity/liveSession';
import { isMapCourtId, labelOf } from '@/features/places/courtName';
import { openPlacePicker } from '@/features/places/picker';
import { recentPlaces, warmRecentPlaces } from '@/features/places/recents';
import { notKnownAdult } from '@/features/players/age';
import { courtRows, fetchCourts, peekCourts, type Court } from '@/features/players/courts';
import { formatMiles, milesBetween } from '@/features/players/geo';
import type { LatLng } from '@/features/players/positions';
import { seenByOnMap } from '@/features/players/mapPrivacy';
import { getPosition } from '@/lib/geo';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, pageIsDark, spacing, typography, withAlpha } from '@/theme';

/** Why this court was put in for you: where you are, where you played last, or a court you follow. */
type Why = 'here' | 'recent' | 'yours' | 'picked';
const WHY_WORDS: Record<Why, string> = { here: 'You’re here', recent: 'Last time', yours: 'Your court', picked: '' };
/** Who may play at a court, as a court's page sends it. */
const ACCESS: readonly string[] = ['public', 'members', 'pay', 'private'];
/** The court's still map: a strip tall enough to read the streets around it. */
const MAP_H = 136;
/** The round Start, and the faint ring around it (a record button's). */
const START = 84;
const RING = 104;

/**
 * Start a session (Oct 6, owner: "click start when they start a session …
 * like how Strava does that for running"): one quick step, then the clock.
 * Laid out as Strava's Record screen, for tennis (Oct 7, owner: "these two
 * screens ui can be significantly better"). The court is the hero: a still
 * map of it with its badge on the spot, its name big, one quiet line under
 * it (You're here, Last time, Your court, how far). It comes already filled
 * in with the court the app knows you're at (standing there with Location
 * on, the way "Played at …?" finds it), else the last court you tagged,
 * else a court you follow; tapping it (Change) opens Add location. At the
 * court's foot, who will see you there, by the court sheet's own check-in
 * rules. Then the kind (Practice, Match or Drills, practice already picked)
 * and a big round Start under the thumb.
 * Start runs the clock and opens the live page; at a court anyone may play
 * at it checks you in there too ("I'm playing here").
 * From a court's own page ("Start a session here", features/players/courtLink
 * startSessionHere) that court comes already chosen, with who may play there.
 */
export default function StartSession() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, currentUser, currentUserId, locationEnabled, followedCourts, courtFacts, mapLive, mapVisibility, teenMap, liveSession } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);
  // Once the sheet is gone: the live page, when Start was tapped; else back where it opened.
  const next = useRef<'live' | null>(null);
  // A court's page sends its court (and who may play there); a place with no court on the map, just its name.
  const params = useLocalSearchParams<{ courtId?: string; courtName?: string; lat?: string; lng?: string; access?: string; place?: string }>();
  const [fromPage] = useState<{ court: TaggedCourt | null; place: string; access?: CourtAccess } | null>(() => {
    const lat = Number(params.lat);
    const lng = Number(params.lng);
    const name = params.courtName?.trim();
    const access = ACCESS.includes(params.access ?? '') ? (params.access as CourtAccess) : undefined;
    if (isMapCourtId(params.courtId) && name && Number.isFinite(lat) && Number.isFinite(lng)) return { court: { id: params.courtId, name, lat, lng }, place: '', access };
    const place = params.place?.trim();
    return place ? { court: null, place } : null;
  });
  const [kind, setKind] = useState<LiveSession['kind']>('practice');
  const [busy, setBusy] = useState(false);
  // A session already going (a second tap, an old link): its own page instead of a second one.
  const [goingAtOpen] = useState(() => !!liveSession && liveState(liveSession) !== 'finished');

  /* ------------------------------ Where ------------------------------ */
  // Each way of knowing where you play, as it arrives; the best one shows until you pick.
  const [here, setHere] = useState<Court | null>(null);
  // Where you are, once the suggestion above has asked (never asked just for this): how far the court is.
  const [at, setAt] = useState<LatLng | null>(null);
  const [recent, setRecent] = useState<TaggedCourt | null>(null);
  const [picked, setPicked] = useState<{ court: TaggedCourt | null; place: string } | null>(() => (fromPage ? { court: fromPage.court, place: fromPage.place } : null));
  // "Played at …?"'s own rule (compose): only a court you are standing at, only with Location on, never for a teen.
  const canSuggest = !!currentUser && !notKnownAdult(currentUser) && locationEnabled;
  useEffect(() => {
    if (!canSuggest) return undefined;
    let on = true;
    void getPosition({ recentMs: 3 * 60_000 }).then((fix) => {
      if (!on || !fix.ok) return;
      const at = { lat: fix.lat, lng: fix.lng };
      setAt(at);
      const pick = (list: Court[]) => {
        if (!on) return;
        const nearest = courtRows(list, at).find((r) => r.c.name !== 'Tennis courts');
        if (nearest && nearest.miles <= 0.1) setHere(nearest.c);
      };
      const kept = peekCourts(at);
      if (kept) pick(kept);
      else fetchCourts(at).then(pick).catch(() => undefined);
    }).catch(() => undefined);
    return () => { on = false; };
  }, [canSuggest]);
  // The last court you tagged a post with, kept on this phone (Add location's recents).
  useEffect(() => {
    if (!currentUserId) return undefined;
    let on = true;
    void warmRecentPlaces().then(() => {
      const last = recentPlaces(currentUserId)?.find((r) => r.court);
      if (on && last?.court) setRecent(last.court);
    });
    return () => { on = false; };
  }, [currentUserId]);
  // Your courts (the ones you follow), asked for once if not yet.
  useEffect(() => { if (followedCourts === null) void actions.loadFollowedCourts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const yours = followedCourts?.[0];

  const hereCourt: TaggedCourt | null = here ? { id: here.id, name: labelOf(here), lat: here.lat, lng: here.lng } : null;
  const yoursCourt: TaggedCourt | null = yours ? { id: yours.courtId, name: yours.name ?? 'Tennis courts', lat: yours.lat, lng: yours.lng } : null;
  const shown: { court: TaggedCourt | null; place: string; why: Why } | null = picked
    // A court picked (or sent by its page) that you are standing at still says so.
    ? { ...picked, why: picked.court && hereCourt && picked.court.id === hereCourt.id ? 'here' : 'picked' }
    : hereCourt ? { court: hereCourt, place: '', why: 'here' }
      : recent ? { court: recent, place: '', why: 'recent' }
        : yoursCourt ? { court: yoursCourt, place: '', why: 'yours' } : null;
  const court = shown?.court ?? null;
  const placeWords = court?.name ?? shown?.place ?? '';
  // Who may play there, for the check-in's rule: what the map's list said, or the court's facts.
  useEffect(() => { if (court) void actions.loadCourtInfo([court.id]); }, [court?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const access: CourtAccess | undefined = (here && court?.id === here.id ? here.access : undefined)
    ?? (fromPage?.court && court?.id === fromPage.court.id ? fromPage.access : undefined)
    ?? (yours && court?.id === yours.courtId && yours.access !== 'unknown' ? yours.access : undefined)
    ?? (court ? courtFacts[court.id]?.access : undefined);
  const change = () => openPlacePicker((value, chosen) => {
    haptics.tap();
    setPicked(chosen ? { court: chosen, place: '' } : value.trim() ? { court: null, place: value.trim() } : null);
  }, placeWords);

  /* ------------------------------ Who sees ------------------------------ */
  const seenBy = seenByOnMap(mapLive, currentUser, teenMap, mapVisibility);
  const plan = checkInPlan({ me: currentUser, court, access, locationOn: locationEnabled, seenBy });
  const seen = seenLine({ here: plan.checkIn, seenBy, why: plan.why, starting: true });

  const start = async () => {
    if (busy) return;
    haptics.commit();
    setBusy(true);
    const s = await actions.startLiveSession({ kind, court, place: court ? undefined : shown?.place, access });
    if (!s) { setBusy(false); return; }
    next.current = 'live';
    close();
  };
  const dismissed = () => (next.current === 'live' ? router.replace('/live-session') : router.back());

  /* ------------------------------ The look ------------------------------ */
  // How tall the contents are, so the sheet opens just that tall: no empty half under Start.
  const [contentH, setContentH] = useState(0);
  // The map is drawn at the card's own width, once it is known.
  const [mapW, setMapW] = useState(0);
  const why = shown ? WHY_WORDS[shown.why] : '';
  const isHere = shown?.why === 'here';
  // How far it is, when the app already knows where you are and you are not standing at it.
  const miles = court && at && !isHere ? milesBetween(at, court) : null;
  const far = miles !== null && miles >= 0.15 ? formatMiles(miles) : '';
  const quiet = [why, far].filter(Boolean).join(' · ');
  const dark = pageIsDark();

  if (goingAtOpen) return <Redirect href="/live-session" />;
  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={dismissed} peekFraction={0.9} contentHeight={contentH || undefined}
      header={<SheetTitle title="Start a session" line="The clock runs until you tap Finish." onClose={close} />}>
      <ScrollView
        contentContainerStyle={[formBody, styles.body]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}
      >
        {/* The court: where you are playing, and at its foot who will see you there. */}
        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={placeWords ? `Where: ${placeWords}${why ? `, ${why}` : ''}${far ? `, ${far} away` : ''}. Change it` : 'Pick a court'}
            onPress={change}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            {court ? (
              <View style={styles.map} onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w && w !== mapW) setMapW(w); }}>
                {/* First, so the map covers it: where a phone draws the map's picture (a browser needs nothing here). */}
                <CourtMapSnapshots />
                {mapW ? <CourtMapThumb lat={court.lat} lng={court.lng} width={mapW} height={MAP_H} /> : null}
                {/* The court's own badge on its spot, as the big map marks a court; its halo goes green while you're standing there. */}
                <View pointerEvents="none" style={styles.pinWrap}>
                  <View style={[styles.halo, isHere && styles.haloHere]} />
                  <View style={styles.pin}><CourtGlyph size={13} color={colors.brandInk} /></View>
                </View>
                <Text pointerEvents="none" style={styles.credit}>© OpenStreetMap</Text>
              </View>
            ) : null}
            <View style={styles.place}>
              {court ? null : (
                <View style={[styles.tile, !placeWords && styles.tileEmpty]}>
                  <Ionicons name={placeWords ? 'location' : 'add'} size={20} color={placeWords ? colors.brand : colors.textMuted} />
                </View>
              )}
              <View style={styles.placeWords}>
                <Text style={[styles.name, !placeWords && styles.nameEmpty]} numberOfLines={2}>{placeWords || 'Pick a court'}</Text>
                {quiet ? (
                  <View style={styles.quietRow}>
                    {isHere ? <View style={styles.hereDot} /> : null}
                    <Text style={[styles.quiet, isHere && styles.quietHere]} numberOfLines={1}>{quiet}</Text>
                  </View>
                ) : !placeWords ? <Text style={styles.quiet}>Where are you playing?</Text> : null}
              </View>
              <Text style={styles.change}>{placeWords ? 'Change' : 'Pick'}</Text>
            </View>
          </Pressable>
          {/* Who will see you, in the check-in's own words, as the court sheet says them. */}
          <View style={styles.seen} accessible accessibilityLabel={`${seen.line}.${seen.note ? ` ${seen.note}` : ''}`}>
            <View style={[styles.seenTile, seen.shared && styles.seenTileOn]}>
              <Ionicons name={seen.shared ? 'eye' : 'eye-off'} size={16} color={seen.shared ? colors.brand : colors.textMuted} />
            </View>
            <View style={styles.seenWords}>
              <Text style={[styles.seenLine, seen.shared && styles.seenShared]}>{seen.line}</Text>
              {seen.note ? <Text style={styles.seenNote}>{seen.note}</Text> : null}
            </View>
          </View>
        </View>

        <SegmentedControl segments={LIVE_KINDS} value={kind} onChange={setKind} tint={colors.text} ink={colors.bg} large radio accessibilityLabel="Type of session" />

        {/* Start: round and big, under the thumb, in a faint ring like a record button's. */}
        <View style={styles.startWrap}>
          <View style={[styles.ring, { borderColor: withAlpha(colors.brand, dark ? 0.42 : 0.28) }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={busy ? 'Starting' : 'Start the session'}
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={() => { void start(); }}
              style={({ pressed }) => [styles.start, { boxShadow: dark ? '0px 10px 24px rgba(0, 0, 0, 0.45)' : `0px 10px 24px ${withAlpha(colors.brand, 0.34)}` }, pressed && styles.startPressed, busy && styles.startBusy]}
            >
              <BrandWash />
              {busy ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Text style={styles.startText}>Start</Text>}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  body: { gap: spacing.lg },
  pressed: { opacity: 0.75 },
  // The court's card: its map across the top, its name under it, who will see you at its foot.
  card: { ...lift, borderRadius: 22, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  map: { height: MAP_H, backgroundColor: colors.bgElevated, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, overflow: 'hidden' },
  pinWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 54, height: 54, borderRadius: 27, backgroundColor: `${colors.court}33` },
  haloHere: { backgroundColor: `${colors.open}33` },
  pin: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.court, borderWidth: 2.5, borderColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    // A mark over the map, drawn as the chat's court card draws it: a plain dark shadow, the map being its ground.
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  credit: { position: 'absolute', right: 8, bottom: 5, fontSize: 8, lineHeight: 10, color: colors.textFaint, opacity: 0.85 },
  place: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: 14, paddingBottom: 14 },
  tile: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  tileEmpty: { backgroundColor: colors.surfaceAlt },
  placeWords: { flex: 1, minWidth: 0, gap: 3 },
  name: { ...typography.title, lineHeight: 27, color: colors.text },
  nameEmpty: { color: colors.textMuted },
  quietRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hereDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.open },
  quiet: { ...typography.small, lineHeight: 18, color: colors.textMuted },
  quietHere: { ...font('600'), color: colors.open },
  // Change: a light word, not a box; the whole court above it takes the tap.
  change: { ...typography.bodyStrong, color: colors.brand, paddingTop: 4 },
  seen: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: spacing.lg, paddingRight: spacing.md, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  seenTile: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  seenTileOn: { backgroundColor: colors.brandDim },
  seenWords: { flex: 1, minWidth: 0, gap: 2 },
  seenLine: { ...typography.smallStrong, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  seenShared: { color: colors.text },
  seenNote: { ...typography.small, lineHeight: 18, color: colors.textFaint },
  startWrap: { alignItems: 'center', paddingTop: spacing.sm },
  ring: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  start: { width: START, height: START, borderRadius: START / 2, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  startPressed: { transform: [{ scale: 0.95 }] },
  startBusy: { opacity: 0.92 },
  startText: { ...typography.bodyStrong, fontSize: 18, letterSpacing: -0.3, color: colors.brandInk },
});
