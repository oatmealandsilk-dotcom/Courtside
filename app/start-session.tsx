import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { Chips, Section, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import type { CourtAccess, LiveSession, TaggedCourt } from '@/data/types';
import { LIVE_KINDS, checkInPlan, liveState, seenLine } from '@/features/activity/liveSession';
import { isMapCourtId, labelOf } from '@/features/places/courtName';
import { openPlacePicker } from '@/features/places/picker';
import { recentPlaces, warmRecentPlaces } from '@/features/places/recents';
import { notKnownAdult } from '@/features/players/age';
import { courtRows, fetchCourts, peekCourts, type Court } from '@/features/players/courts';
import { seenByOnMap } from '@/features/players/mapPrivacy';
import { getPosition } from '@/lib/geo';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/** Why this court was put in for you: where you are, where you played last, or a court you follow. */
type Why = 'here' | 'recent' | 'yours' | 'picked';
const WHY_WORDS: Record<Why, string> = { here: 'You’re here', recent: 'Last time', yours: 'Your court', picked: '' };
/** Who may play at a court, as a court's page sends it. */
const ACCESS: readonly string[] = ['public', 'members', 'pay', 'private'];

/**
 * Start a session (Oct 6, owner: "click start when they start a session …
 * like how Strava does that for running"): one quick step, then the clock.
 * Where, already filled in with the court the app knows you're at (standing
 * there with Location on, the way "Played at …?" finds it), else the last
 * court you tagged, else a court you follow; Change opens Add location.
 * What (Practice, Match or Drills, practice already picked). One line on who
 * will see you, by the court sheet's own check-in rules, and one big Start.
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
    setBusy(true);
    const s = await actions.startLiveSession({ kind, court, place: court ? undefined : shown?.place, access });
    if (!s) { setBusy(false); return; }
    next.current = 'live';
    close();
  };
  const dismissed = () => (next.current === 'live' ? router.replace('/live-session') : router.back());

  if (goingAtOpen) return <Redirect href="/live-session" />;
  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={dismissed} peekFraction={0.7}
      header={<SheetTitle title="Start a session" line="The clock runs until you tap Finish." onClose={close} />}>
      <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled">
        <Section title="Where">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={placeWords ? `Where: ${placeWords}${shown && WHY_WORDS[shown.why] ? `, ${WHY_WORDS[shown.why]}` : ''}. Change it` : 'Pick a court'}
            onPress={change}
            style={({ pressed }) => [styles.where, pressed && styles.pressed]}
          >
            <View style={[styles.tile, !placeWords && styles.tileEmpty]}>
              {court ? <CourtGlyph size={15} color={colors.brand} /> : <Ionicons name={placeWords ? 'location' : 'add'} size={18} color={placeWords ? colors.brand : colors.textMuted} />}
            </View>
            <View style={styles.whereWords}>
              <Text style={[styles.whereName, !placeWords && styles.whereEmpty]} numberOfLines={1}>{placeWords || 'Pick a court'}</Text>
              {shown && WHY_WORDS[shown.why] ? (
                <View style={styles.whyRow}>
                  {shown.why === 'here' ? <View style={styles.hereDot} /> : null}
                  <Text style={[styles.why, shown.why === 'here' && styles.whyHere]}>{WHY_WORDS[shown.why]}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.changePill}><Text style={styles.changeText}>{placeWords ? 'Change' : 'Pick'}</Text></View>
          </Pressable>
        </Section>
        <Section title="What is it">
          <Chips value={kind} onChange={(k) => { if (k) setKind(k); }} options={LIVE_KINDS} />
        </Section>
        <View style={styles.seen} accessible accessibilityLabel={`${seen.line}.${seen.note ? ` ${seen.note}` : ''}`}>
          <Ionicons name={seen.shared ? 'people' : 'lock-closed'} size={16} color={seen.shared ? colors.brand : colors.textMuted} style={styles.seenIcon} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.seenLine, seen.shared && styles.seenShared]}>{seen.line}</Text>
            {seen.note ? <Text style={styles.seenNote}>{seen.note}</Text> : null}
          </View>
        </View>
        <Submit label="Start" busyLabel="Starting…" onPress={() => { void start(); }} busy={busy} />
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  // The court, as a lifted white row with its little court in a green tile, the way a court shows in Your courts.
  where: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingRight: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  pressed: { opacity: 0.7 },
  tile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  tileEmpty: { backgroundColor: colors.surfaceAlt },
  whereWords: { flex: 1, minWidth: 0, gap: 2 },
  whereName: { ...typography.bodyStrong, fontSize: 16, color: colors.text },
  whereEmpty: { color: colors.textMuted },
  whyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hereDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.open },
  why: { ...typography.small, color: colors.textMuted },
  whyHere: { ...font('600'), color: colors.open },
  changePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  changeText: { ...typography.smallStrong, color: colors.text },
  seen: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: -spacing.xs },
  seenIcon: { marginTop: 1 },
  seenLine: { ...typography.smallStrong, color: colors.textMuted },
  seenShared: { color: colors.text },
  seenNote: { ...typography.small, color: colors.textFaint },
});
