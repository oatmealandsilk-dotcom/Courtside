import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { DragSheet } from '@/components/DragSheet';
import { LiveDot } from '@/components/LiveDot';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { CourtMapSnapshots, CourtMapThumb } from '@/components/map/CourtMapThumb';
import { StartButton, type StartPhase } from '@/components/session/StartButton';
import { formBody } from '@/components/sheet/SheetForm';
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
import { show as showToast } from '@/lib/toast';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, inkOn, lift, pageIsDark, radius, spacing, typography, withAlpha } from '@/theme';

/** Why this court was put in for you: where you are, where you played last, or a court you follow. */
type Why = 'here' | 'recent' | 'yours' | 'picked';
const WHY_WORDS: Record<Why, string> = { here: 'You’re here', recent: 'Last time', yours: 'Your court', picked: '' };
/** Who may play at a court, as a court's page sends it. */
const ACCESS: readonly string[] = ['public', 'members', 'pay', 'private'];
/**
 * The court's still map: a band close in on the court's own block (Oct 7,
 * owner's screenshot: the old strip was big and empty around a small pin),
 * a little taller on a tall phone and shorter on a small one (an SE), so the
 * whole sheet still opens without scrolling.
 */
const mapHeight = (windowH: number) => (windowH < 700 ? 100 : Math.round(Math.min(136, windowH * 0.16)));
/** How close in the court's map is: its own block and paths, not the district (a chat's court card stays at 15). */
const MAP_ZOOM = 16;
/** The court's pin, a drop: a round head (radius 16, centred 19 across and 19 down) narrowing to its point at PIN_TIP. */
const PIN_W = 38;
const PIN_H = 50;
const PIN_TIP = 46.5;
const PIN_PATH = 'M19 46.5 C13.6 39.6 3 30.6 3 19 A16 16 0 1 1 35 19 C35 30.6 24.4 39.6 19 46.5 Z';
/**
 * Lines that wrap evenly, never one word left alone on the last ("here." on
 * its own on a 375pt phone): the phone's own rule for it (iPhone, Android),
 * and the browser's.
 */
const EVEN = { lineBreakStrategyIOS: 'push-out', textBreakStrategy: 'balanced' } as const;
const EVEN_WEB = Platform.OS === 'web' ? ({ textWrap: 'balance' } as unknown as TextStyle) : null;

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
 * rules. Then the kind (Practice or Match, practice already picked, on a
 * light sliding switch) and a big round Start under the thumb.
 * Start runs the clock from the tap and opens the live page; at a court
 * anyone may play at it checks you in there too ("I'm playing here").
 * Pressing it is the sheet's one moment (Oct 7, owner: "a better animation.
 * Instead of loading circle"): the ring closes and Start rolls into the
 * running clock (components/session/StartButton), no spinner, no countdown.
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
  // Start pressed: the sheet stops taking taps while the ring closes, and the session is already going.
  const [phase, setPhase] = useState<StartPhase>('idle');
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

  // Start, the moment it is tapped: the clock starts now (the session's start is this tap), while the ring closes.
  // From here on, however the sheet goes away, it goes to the live page: the session is already running.
  const start = async () => {
    next.current = 'live';
    const s = await actions.startLiveSession({ kind, court, place: court ? undefined : shown?.place, access });
    if (s) return true;
    next.current = null;
    showToast({ title: 'Couldn’t start the session', body: 'Try Start again in a moment.', icon: 'alert-circle-outline' });
    return false;
  };
  const dismissed = () => (next.current === 'live' ? router.replace('/live-session') : router.back());

  /* ------------------------------ The look ------------------------------ */
  // How tall the contents are, so the sheet opens just that tall: no empty half under Start.
  const [contentH, setContentH] = useState(0);
  // The map is drawn at the card's own width, once it is known, and as tall as the phone allows.
  const [mapW, setMapW] = useState(0);
  const mapH = mapHeight(useWindowDimensions().height);
  const why = shown ? WHY_WORDS[shown.why] : '';
  const isHere = shown?.why === 'here';
  // How far it is, when the app already knows where you are and you are not standing at it.
  const miles = court && at && !isHere ? milesBetween(at, court) : null;
  const far = miles !== null && miles >= 0.15 ? formatMiles(miles) : '';
  const quiet = [why, far].filter(Boolean).join(' · ');

  if (goingAtOpen) return <Redirect href="/live-session" />;
  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={dismissed} peekFraction={0.9} contentHeight={contentH || undefined}
      header={<Header onClose={close} />}>
      <ScrollView
        contentContainerStyle={[formBody, styles.body]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={phase === 'idle'}
        onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}
      >
        {/* Once Start is pressed the choices above it are made: they stop taking taps while the ring closes. */}
        <View style={styles.choices} pointerEvents={phase === 'idle' ? 'auto' : 'none'}>
          {/* The court: where you are playing, and at its foot who will see you there. */}
          <View style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={placeWords ? `Where: ${placeWords}${why ? `, ${why}` : ''}${far ? `, ${far} away` : ''}. Change it` : 'Pick a court'}
              onPress={change}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              {court ? (
                <View style={[styles.map, { height: mapH }]} onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w && w !== mapW) setMapW(w); }}>
                  {/* First, so the map covers it: where a phone draws the map's picture (a browser needs nothing here). */}
                  <CourtMapSnapshots />
                  {mapW ? <CourtMapThumb lat={court.lat} lng={court.lng} width={mapW} height={mapH} zoom={MAP_ZOOM} /> : null}
                  {/* The map fades into the card at its foot, so the court's name reads as the map's own caption. */}
                  <LinearGradient pointerEvents="none" colors={[withAlpha(colors.surface, 0), colors.surface]} style={styles.mapFade} />
                  <CourtPin mapH={mapH} here={isHere} />
                  <Text pointerEvents="none" style={styles.credit}>© OpenStreetMap</Text>
                </View>
              ) : null}
              <View style={[styles.place, court && styles.placeUnderMap]}>
                {court ? null : (
                  <View style={[styles.tile, !placeWords && styles.tileEmpty]}>
                    <Ionicons name={placeWords ? 'location' : 'add'} size={20} color={placeWords ? colors.brand : colors.textMuted} />
                  </View>
                )}
                <View style={styles.placeWords}>
                  <Text {...EVEN} style={[styles.name, !placeWords && styles.nameEmpty, EVEN_WEB]} numberOfLines={2}>{placeWords || 'Pick a court'}</Text>
                  {quiet ? (
                    <View style={styles.quietRow}>
                      {/* Standing there: the live page's own pulsing dot, in the live green. */}
                      {isHere ? <LiveDot size={7} color={colors.open} /> : null}
                      <Text style={[styles.quiet, isHere && styles.quietHere]} numberOfLines={1}>{quiet}</Text>
                    </View>
                  ) : !placeWords ? <Text style={styles.quiet}>Where are you playing?</Text> : null}
                </View>
                {/* With no court yet the whole row is the button ("Pick a court"), so no second "Pick" beside it. */}
                {placeWords ? <Text style={styles.change}>Change</Text> : null}
              </View>
            </Pressable>
            {/* Who will see you, in the check-in's own words, as the court sheet says them. */}
            <View style={styles.seen} accessible accessibilityLabel={`${seen.line}.${seen.note ? ` ${seen.note}` : ''}`}>
              <View style={[styles.seenTile, seen.shared && styles.seenTileOn]}>
                <Ionicons name={seen.shared ? 'eye' : 'eye-off'} size={16} color={seen.shared ? colors.brand : colors.textMuted} />
              </View>
              <View style={styles.seenWords}>
                <Text {...EVEN} style={[styles.seenLine, seen.shared && styles.seenShared, EVEN_WEB]}>{seen.line}</Text>
                {seen.note ? <Text {...EVEN} style={[styles.seenNote, EVEN_WEB]}>{seen.note}</Text> : null}
              </View>
            </View>
          </View>

          <KindSwitch value={kind} onChange={(k) => { if (k !== kind) haptics.tap(); setKind(k); }} />
        </View>

        {/* Start: round and big, under the thumb, in a ring that closes as it starts (a record button's). */}
        <View style={styles.startWrap}>
          <StartButton onStart={start} onStarted={close} onPhase={setPhase} />
        </View>
      </ScrollView>
    </DragSheet>
  );
}

/** The sheet's top: its title, the one line on how the clock runs (a stopwatch beside it), and a round close. */
function Header({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.head}>
      <View style={styles.headWords}>
        <Text style={styles.title} accessibilityRole="header">Start a session</Text>
        <View style={styles.lineRow}>
          <Ionicons name="stopwatch-outline" size={14} color={colors.brand} />
          <Text style={styles.line} numberOfLines={1}>The clock runs until you tap Finish.</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

/**
 * The court's pin on its map, as a map marks a place: a drop with the court's
 * badge in its head, its point on the spot, and a soft mark on the ground
 * under it. While you're standing there the mark is the live green and
 * breathes, as the live dot does.
 */
function CourtPin({ mapH, here }: { mapH: number; here: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const reduced = useReducedMotion();
  const breath = useSharedValue(0);
  useEffect(() => {
    if (!here || reduced) { breath.value = 0; return; }
    breath.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic) }), -1, false);
  }, [here, reduced, breath]);
  const ring = useAnimatedStyle(() => ({ opacity: here ? 0.7 * (1 - breath.value) : 0, transform: [{ scale: 1 + breath.value * 1.8 }] }), [here]);
  const ground = here ? colors.open : colors.court;
  return (
    <View pointerEvents="none" style={[styles.pin, { top: Math.round(mapH / 2 - PIN_TIP) }]}>
      <Animated.View style={[styles.pinGround, { borderColor: ground }, ring]} />
      <View style={[styles.pinGround, { backgroundColor: withAlpha(ground, 0.38) }]} />
      <Svg width={PIN_W} height={PIN_H} viewBox={`0 0 ${PIN_W} ${PIN_H}`}>
        {/* A mark over the map keeps a plain dark shadow, as the chat's court card draws one: the map is its ground. */}
        <Path d={PIN_PATH} fill="rgba(0, 0, 0, 0.2)" transform="translate(0 1.6)" />
        <Path d={PIN_PATH} fill={colors.court} stroke={colors.surface} strokeWidth={2.5} strokeLinejoin="round" />
      </Svg>
      <View style={styles.pinBadge}>
        <CourtGlyph size={14} color={inkOn(colors.court)} />
      </View>
    </View>
  );
}

const KNOB_INSET = 4;

/**
 * Practice or Match: a light switch with a knob that slides to the choice,
 * so the one filled, coloured thing on the sheet is Start (Oct 7: the ink
 * block it replaces outweighed Start).
 */
function KindSwitch({ value, onChange }: { value: LiveSession['kind']; onChange: (kind: LiveSession['kind']) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const index = Math.max(0, LIVE_KINDS.findIndex((k) => k.value === value));
  const at = useSharedValue(index);
  useEffect(() => { at.value = reduced ? index : withTiming(index, { duration: 240, easing: Easing.bezier(0.22, 1, 0.36, 1) }); }, [index, reduced, at]);
  const each = w ? (w - KNOB_INSET * 2) / LIVE_KINDS.length : 0;
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: at.value * each }] }), [each]);
  const dark = pageIsDark();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Type of session"
      onLayout={(e) => { const next = Math.round(e.nativeEvent.layout.width); if (next !== w) setW(next); }}
      style={[styles.track, { backgroundColor: withAlpha(colors.text, dark ? 0.09 : 0.06) }]}
    >
      {each ? <Animated.View pointerEvents="none" style={[styles.knob, dark ? { backgroundColor: withAlpha(colors.text, 0.16) } : styles.knobLight, { width: each }, knob]} /> : null}
      {LIVE_KINDS.map((k) => {
        const on = k.value === value;
        return (
          <Pressable key={k.value} accessibilityRole="radio" accessibilityState={{ checked: on, selected: on }} accessibilityLabel={k.label} onPress={() => onChange(k.value)} style={({ pressed }) => [styles.kind, pressed && !on && styles.pressed]}>
            <Text style={[styles.kindText, on && styles.kindTextOn]} numberOfLines={1}>{k.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  headWords: { flex: 1, minWidth: 0, gap: 4 },
  title: { ...typography.title, fontSize: 24, letterSpacing: -0.8, color: colors.text },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  line: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  close: { ...lift, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  body: { gap: spacing.xl },
  choices: { gap: spacing.md },
  pressed: { opacity: 0.75 },
  // The court's card: its map across the top, its name under it, who will see you at its foot.
  // The feature card's 20 corners, on the app's own scale.
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  map: { backgroundColor: colors.bgElevated, overflow: 'hidden' },
  mapFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 34 },
  credit: { position: 'absolute', right: 10, top: 7, fontSize: 8, lineHeight: 10, color: colors.textFaint, opacity: 0.85 },
  // The pin, its point on the court's spot in the middle of the map.
  pin: { position: 'absolute', left: '50%', marginLeft: -PIN_W / 2, width: PIN_W, height: PIN_H },
  // The mark on the ground, centred on the pin's point.
  pinGround: { position: 'absolute', top: PIN_TIP - 4, left: PIN_W / 2 - 10, width: 20, height: 8, borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent' },
  // The court's badge, centred in the drop's round head.
  pinBadge: { position: 'absolute', top: 19 - 8.75, left: 19 - 7, width: 14, height: 17.5 },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: 14, paddingBottom: 14 },
  // Under the map the name sits up on the fade, as the map's caption.
  placeUnderMap: { paddingTop: 4 },
  tile: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  tileEmpty: { backgroundColor: colors.surfaceAlt },
  placeWords: { flex: 1, minWidth: 0, gap: 3 },
  name: { ...typography.title, lineHeight: 27, color: colors.text },
  nameEmpty: { color: colors.textMuted },
  quietRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  quiet: { ...typography.small, lineHeight: 18, color: colors.textMuted },
  quietHere: { ...font('600'), color: colors.open },
  // Change: a light word, not a box; the whole court above it takes the tap.
  change: { ...typography.bodyStrong, color: colors.brand },
  seen: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: spacing.lg, paddingRight: spacing.md, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  seenTile: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  seenTileOn: { backgroundColor: colors.brandDim },
  seenWords: { flex: 1, minWidth: 0, gap: 2 },
  seenLine: { ...typography.smallStrong, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  seenShared: { color: colors.text },
  seenNote: { ...typography.small, lineHeight: 18, color: colors.textFaint },
  // Practice or Match: a quiet track, the choice on a light knob that slides to it.
  track: { flexDirection: 'row', borderRadius: radius.pill, padding: KNOB_INSET },
  knob: { position: 'absolute', top: KNOB_INSET, bottom: KNOB_INSET, left: KNOB_INSET, borderRadius: radius.pill },
  knobLight: { ...lift, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  kind: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: radius.pill },
  kindText: { ...typography.bodyStrong, color: colors.textMuted },
  kindTextOn: { color: colors.text },
  startWrap: { alignItems: 'center' },
});
