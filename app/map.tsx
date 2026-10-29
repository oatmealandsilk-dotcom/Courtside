import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { NearbyMap } from '@/components/NearbyMap';
import { useLocationToggle } from '@/features/players/useLocationToggle';
import { useWhoSeesYouUp } from '@/features/players/mapPrivacy';
import { useCourtOpen } from '@/features/players/courtLink';
import { EmptyState } from '@/components/ui';
import { takeHandedPlace } from '@/features/places/geocode';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';
import { cancelGrow, endGrow, exitW, exitX, growEarly, growMapGone, growMapMounted, setGrowLeaving, takeGrowPlan, useGrowEarly } from '@/features/players/mapGrow';
import { zoomPath } from '@/features/players/zoomTiming';

const NATIVE = Platform.OS !== 'web';

/** The community map as the whole page: tiles edge to edge, the controls laid over them. */
export default function MapScreen() {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  const { users, currentUser, currentUserId, blockedIds, detectedCoords, mapLive } = useApp();
  const players = users.filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id));
  const location = useLocationToggle();
  // Nothing is asked on opening the map any more (migration 189, Apple 5.1.2(i)): the map opens
  // on your town, and "Who can see you on the map?" and Apple's prompt come only with Check in.
  // Opened from a post's tagged court: the map goes there, with the courts showing.
  // Opened on an open hit (?hit=…): the map goes there with its card up.
  // From an alert: on a player (?user=…, their card once their pin is in) or a spot (?lat=…&lng=…).
  // From Find Players' search: on a place (?place=1), with its courts listed. The place itself
  // is handed over in memory (handPlace), so an address searched for never sits in the page's address or history.
  const params = useLocalSearchParams<{ court?: string; lat?: string; lng?: string; name?: string; hit?: string; user?: string; place?: string; grow?: string }>();
  // Opened by the Community card growing into it (the check-in zoom, mapGrow): it opened with no slide, see-through over
  // the page pushing in, starting exactly where the grown card shows. In a browser, once it has taken over it is the
  // ordinary full map again: Back slides it away as always. On the phone (v6) it opened earlier still, hidden, while you
  // were being found (mapGrow's openGrow), and stays a see-through page over Community after landing: its own Back and
  // left-edge swipe slide it off (GrownExit below).
  const [growFrom] = useState(() => (params.grow ? takeGrowPlan() : null));
  const earlyId = NATIVE ? growFrom?.early ?? 0 : 0;
  const navigation = useNavigation();
  // A page that closes itself (the phone's hidden map let go): at once, with no movement (it opened with none), and only
  // once it is the page on top (a page opened over it closes first).
  const closeSelf = () => {
    if (navigation.isFocused()) { navigation.goBack(); return () => undefined; }
    return navigation.addListener('focus', () => navigation.goBack());
  };
  useEffect(() => {
    if (!params.grow) return undefined;
    // Opened to grow, but the grow was not there to take (too late, or let go): nothing of it is left waiting (the tab
    // bar, the page). The phone's is see-through and would sit unseen over the page, taking its touches: it goes at once.
    if (!growFrom) { endGrow(); return NATIVE ? closeSelf() : undefined; }
    if (!earlyId) return undefined;
    growMapMounted(earlyId);
    // Another page opened over it before the push-in started (an alert, say): no zoom this time; it closes once back on top.
    const offBlur = navigation.addListener('blur', () => {
      const e = growEarly();
      if (e && e.id === earlyId && !e.started && !e.cancelled) { zoomPath('none', 'cancelled'); cancelGrow(earlyId); }
    });
    return () => { offBlur(); growMapGone(earlyId); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Let go before the push-in started (mapGrow's cancelGrow: you were not found, the server said no, it never drew in
  // time, or 5 s went by: mapGrow EARLY_MAX_MS): it closes itself.
  useGrowEarly();
  const early = earlyId ? growEarly() : null;
  // Once the push-in has started it is the grow's own map (it lands, and stays): only a let-go before then closes it.
  const startedOnce = useRef(false);
  if (early && early.id === earlyId && early.started) startedOnce.current = true;
  const letGo = !!earlyId && !startedOnce.current && (!early || early.id !== earlyId || early.cancelled);
  useEffect(() => (letGo ? closeSelf() : undefined), [letGo]); // eslint-disable-line react-hooks/exhaustive-deps
  const [grown, setGrown] = useState(!growFrom);
  useEffect(() => {
    if (NATIVE || !params.grow || !grown) return;
    navigation.setOptions({ presentation: 'card', animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } });
  }, [grown]); // eslint-disable-line react-hooks/exhaustive-deps
  const lat = Number(params.lat); const lng = Number(params.lng);
  const spotKnown = !!params.lat && !!params.lng && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const focusCourt = useMemo(
    () => (params.court && params.name && spotKnown ? { id: params.court, name: params.name, lat, lng } : null),
    [params.court, params.name, lat, lng, spotKnown],
  );
  const [focusPlace] = useState(() => (params.place && !focusCourt ? takeHandedPlace() : null));
  const focusSpot = useMemo(() => (!focusCourt && !focusPlace && spotKnown ? { lat, lng } : null), [focusCourt, focusPlace, spotKnown, lat, lng]);
  // A court page's map button, or See all on this court's card, comes back here rather than stacking another copy.
  const ownHref = useMemo(() => ({ pathname: '/map' as const, params: { court: params.court, lat: params.lat, lng: params.lng, name: params.name } }), [params.court, params.lat, params.lng, params.name]);
  useCourtOpen('map', focusCourt, focusCourt ? ownHref : null);
  const back = () => goBack(focusCourt ? '/' : '/discuss?section=players');
  // The map's first pins wait while "Who can see you on the map?" is up, so their wave is seen, not
  // played behind the sheet. Until it is known whether the map's rules are on the database (a
  // moment, at most 2.5 s) they wait too.
  const sheetUp = useWhoSeesYouUp();
  const [waited, setWaited] = useState(false);
  useEffect(() => { const t = setTimeout(() => setWaited(true), 2500); return () => clearTimeout(t); }, []);
  const holdPins = sheetUp || (mapLive === null && !waited);
  const grownExit = NATIVE && !!growFrom;
  const exitRef = useRef<() => void>(back);
  const map = (edge?: React.ReactNode) => (currentUser ? (
    <NearbyMap expanded fullscreen me={currentUser} players={players} at={detectedCoords} locationOn={location.locationOn} locating={location.locating} onToggleLocation={location.toggle} onBack={grownExit ? () => exitRef.current() : back} onOpen={(id) => router.push(`/user/${id}`)} focusCourt={focusCourt} focusHit={params.hit ?? null} focusUser={params.user ?? null} focusSpot={focusSpot} focusPlace={focusPlace} holdPins={holdPins} growFrom={growFrom} onGrown={() => setGrown(true)} edge={edge} />
  ) : (
    <EmptyState title="Sign in to see who is around" />
  ));
  if (grownExit) {
    return <GrownExit grown={grown} onBack={back} exitRef={exitRef}>{map}</GrownExit>;
  }
  // The phone's see-through grow page with no grow to take (let go a moment before it came up): nothing of it is ever drawn
  // over the Community page in the frame or two before it closes itself (above).
  if (NATIVE && params.grow) return <View pointerEvents="none" style={styles.fill} />;
  return (
    <View style={{ flex: 1, backgroundColor: grown ? colors.bgElevated : 'transparent' }}>
      {map()}
    </View>
  );
}

/** A finger down within this far of the left edge may take the grown map away (the way iOS's own edge swipe does). */
const EDGE = 24;
/** How far a finger travels before the swipe decides it is its own. */
const SLOP = 10;
/** Let go past this share of the width (or flicked), and the map goes; sooner, and it springs back. */
const COMMIT_AT = 1 / 3;
const FLICK = 500;
/** The slide off: about iOS's own pop, a quick start that settles (a transform only: never an opacity, the map's buttons are glass). */
const EXIT_MS = 320;
const EXIT_EASE = Easing.bezier(0.2, 0.8, 0.25, 1);

/**
 * The phone's grown full map (v6): a see-through page over Community (mapGrow), which iOS would otherwise close by sliding
 * it down, or with no movement at all. So Back slides it off to the right, as any page goes, and a drag from the left edge
 * does the same under the finger (past a third of the way, or a flick, it goes; sooner, it springs back): the Community
 * page is under it all along, so it is what is uncovered, coming back from a little to the left as it is, the way a page
 * under iOS's own back does (mapGrow's exitX: transforms only). Not taking touches until it has fully come in (`grown`);
 * until then the page under it is what is seen.
 *
 * The edge swipe starts only on a strip along the left edge laid over the map (`edge`, given to the map to put between
 * its map and its buttons): a finger there never reaches the map, so the map never pans under a swipe that is taking the
 * page away, and the map's own buttons near the edge keep their taps.
 */
function GrownExit({ grown, onBack, exitRef, children }: { grown: boolean; onBack: () => void; exitRef: React.MutableRefObject<() => void>; children: (edge: React.ReactNode) => React.ReactNode }) {
  const { width } = useWindowDimensions();
  // The page under it follows this one (useGrowHostStyle): mapGrow's own values, back to rest as this map goes.
  const x = exitX;
  const w = exitW;
  useEffect(() => { w.value = width; }, [width]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { x.value = 0; return () => { x.value = 0; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const leaving = useSharedValue(false);
  const latestBack = useRef(onBack);
  latestBack.current = onBack;
  const gone = () => latestBack.current();
  // As it slides away, the page under it is the page you see again (and its tab bar comes back under it, as with any page
  // going back), not only once it has gone.
  const going = () => setGrowLeaving(true);
  useEffect(() => () => setGrowLeaving(false), []);
  exitRef.current = () => {
    if (leaving.value) return;
    leaving.value = true;
    going();
    x.value = withTiming(width, { duration: EXIT_MS, easing: EXIT_EASE }, (done) => { if (done) runOnJS(gone)(); });
  };
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const pan = useMemo(() => Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e, state) => {
      'worklet';
      const t = e.changedTouches[0];
      if (!t || e.numberOfTouches > 1 || leaving.value) { state.fail(); return; }
      sx.value = t.absoluteX;
      sy.value = t.absoluteY;
    })
    .onTouchesMove((e, state) => {
      'worklet';
      if (e.state === State.ACTIVE) return;
      const t = e.allTouches[0];
      if (!t) return;
      const dx = t.absoluteX - sx.value;
      const dy = t.absoluteY - sy.value;
      if (dx > SLOP && dx > Math.abs(dy) * 1.2) state.activate();
      else if (Math.abs(dy) > SLOP || dx < -SLOP) state.fail();
    })
    .onUpdate((e) => {
      'worklet';
      // The screen's own coordinates (the strip moves with the page it is on).
      x.value = Math.max(0, e.absoluteX - sx.value);
    })
    .onEnd((e, success) => {
      'worklet';
      const travel = Math.max(0, e.absoluteX - sx.value);
      const go = success && (travel > w.value * COMMIT_AT || (e.velocityX > FLICK && travel > 24));
      if (go) {
        leaving.value = true;
        runOnJS(going)();
        // The rest of the way at about the finger's speed, never slower than the button's own slide.
        const left = Math.max(0, w.value - travel);
        const ms = Math.max(140, Math.min(EXIT_MS, e.velocityX > 0 ? (left / e.velocityX) * 1000 : EXIT_MS));
        x.value = withTiming(w.value, { duration: ms, easing: Easing.out(Easing.cubic) }, (done) => { if (done) runOnJS(gone)(); });
      } else {
        // Back to rest without passing it (past it, a sliver of the page under it would show at the right edge).
        x.value = withSpring(0, { damping: 26, stiffness: 260, mass: 0.9, overshootClamping: true });
      }
    })
    // Only once it has fully come in (before, the page under it is what is seen, and nothing of it takes a touch).
    .enabled(grown), [grown]); // eslint-disable-line react-hooks/exhaustive-deps
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const edge = (
    <GestureDetector gesture={pan}>
      <View collapsable={false} pointerEvents={grown ? 'auto' : 'none'} style={styles.edge} />
    </GestureDetector>
  );
  return (
    <View collapsable={false} pointerEvents={grown ? 'auto' : 'none'} style={styles.fill}>
      <Animated.View style={[styles.fill, { backgroundColor: grown ? colors.bgElevated : 'transparent' }, slide]}>{children(edge)}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // The edge swipe's strip, over the map and under its buttons (NearbyMap's `edge`).
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: EDGE },
});
