import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, AppState, Platform, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import Animated, { Easing, cancelAnimation, interpolate, interpolateColor, runOnJS, runOnUI, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image as ExpoImage } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedTopRow } from '@/features/groups/FeedTopRow';
import { TipBubble } from '@/components/TipBubble';
import { Avatar } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { StreakFlame } from '@/components/StreakFlame';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { LIKE_RED } from '@/components/Heart';
import { markStripShown } from '@/components/MediaPostPage';
import { postKindMeta } from '@/components/PostCard';
import { shownStreak } from '@/features/practice/streakFlame';
import { TOP_BAND_HEIGHT, TOP_BAND_TOP } from '@/features/feed/topBand';
import { BAR_METRICS } from '@/features/navigation/tabBarLook';
import { lockPageSwipe } from '@/features/navigation/swipeLock';
import { useTourOpen } from '@/features/tour/tourStore';
import { learned, useTip } from '@/features/tips/tips';
import { useIsFocused } from '@/lib/useIsFocused';
import { compactNumber, relativeTime } from '@/lib/format';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, font, pageIsDark, radius, spacing, typography, withAlpha } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';
import {
  CARD_GAP, CARD_MAX, FOR_YOU, LABEL_HEIGHT, LABEL_SPACE, SPRING_BACK, SPRING_DRAG, SPRING_OPEN, SPRING_SNAP,
  cardAt, feedReadyAt, feedShot, feedShownAt, feedSpot, feedWhole, registerShotNode, setWindowsController, setWindowsState, snapFeed, swipeTarget,
  useWindowsClipped, useWindowsPhase, useWindowsRowSwitched, useWindowsTarget, windowsState,
  winAway, winDrag, winF, winFinger, winGeo, winLive, winOn, winP, winPick, winScrub, winSel, winStill, winTick,
  type FeedKey, type ScrubEnd, type Spot,
} from './feedWindows';

/*
 * The Feed's windows (features/feed/feedWindows has the why and the switch). This file is
 * FeedWindowsView, not FeedWindows: a Mac's disk cannot tell FeedWindows.tsx from feedWindows.ts.
 *
 * The pieces, each a small component of its own so the Feed and its pages never redraw for them:
 *  - WindowsLayer: wraps each built feed (For you and each kept one), each kept one at its own card while
 *    the windows are up. The one on show is the card you came from: the real feed, held still, shrunk
 *    with the same sums as every other card (the rest hidden there, For you under it). The card picked
 *    grows back at its own card as its own feed (its picture gives way to it on the way), so the
 *    landing is the feed itself, and the card you came from stays up as it slides away.
 *  - WindowsGround: the ground the cards sit on (the middle card's picture, softened), only while they are up.
 *  - WindowsRow: the top row, riding with the real feed's card and fading as it shrinks.
 *  - FeedWindows: the other cards (stills), their names, the swipes and taps, Back, the keys in a
 *    browser, the hand-over to a picked feed, and the one-time hint.
 *  - FeedHold (its own file): the hold that opens them, and the slide after it with the finger still down.
 */

/** What a card that is not the real feed shows. */
type Face =
  | { kind: 'shot'; uri: string }
  | { kind: 'poster'; uri: string; contain: boolean }
  | { kind: 'text'; author?: string; text: string; postId?: string }
  | { kind: 'name'; empty: boolean };

function faceOf(key: FeedKey, firstSpot: (key: FeedKey) => Spot | null): Face {
  const spot = feedSpot(key);
  const shot = feedShot(key);
  // A still, only while that feed is still on the page it was taken of.
  if (spot?.page && shot && shot.page === spot.page) return { kind: 'shot', uri: shot.uri };
  const s = spot ?? firstSpot(key) ?? undefined;
  if (s?.poster) return { kind: 'poster', uri: s.poster, contain: s.landscape };
  if (s?.text) return { kind: 'text', author: s.author, text: s.text, postId: s.postId };
  return { kind: 'name', empty: !s || !s.page };
}

/** The picture a card's ground is made of (its poster or photo; never a page of words). */
function groundOf(key: FeedKey, firstSpot: (key: FeedKey) => Spot | null): string | null {
  const s = feedSpot(key) ?? firstSpot(key) ?? undefined;
  return s?.poster ?? null;
}

/** A palette colour taken part of the way to black. */
function towardBlack(hex: string, t: number): string {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  const c = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - t)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The theme's own dark: the ground where a card has no picture (Clean's ink, New York's navy deepened). */
function deepOf(): string {
  return pageIsDark() ? towardBlack(colors.bg, 0.38) : colors.text;
}

/** Above each card but the one you came from, under its name: who posted, and how many you have not seen. */
export interface WindowMeta {
  avatars: { id: string; name: string; seed: string; uri?: string }[];
  /** Posts in that feed this phone has not shown you. */
  fresh: number;
  /** When its newest post went up (shown when nothing is new). */
  newestAt?: string;
}

// The ground's pictures, one per card, while the windows are up (read by WindowsGround only).
interface GroundData { uris: (string | null)[]; deep: string }
let ground: GroundData | null = null;
const groundListeners = new Set<() => void>();
const setGround = (g: GroundData | null) => { if (g === ground) return; ground = g; groundListeners.forEach((fn) => fn()); };
const subscribeGround = (fn: () => void) => { groundListeners.add(fn); return () => { groundListeners.delete(fn); }; };
const useGround = () => useSyncExternalStore(subscribeGround, () => ground, () => ground);

// The phone's clock over the windows (read by WindowsClock only): white over their dark ground and over a
// picked page that is its picture; once a picked written page is the one on show (it all but fills the
// screen by then), the page's own, so the clock is right as the card lands rather than changing after.
let clockOnPage = false;
const clockListeners = new Set<() => void>();
const setClockOnPage = (v: boolean) => { if (v === clockOnPage) return; clockOnPage = v; clockListeners.forEach((fn) => fn()); };
const subscribeClock = (fn: () => void) => { clockListeners.add(fn); return () => { clockListeners.delete(fn); }; };
const useClockOnPage = () => useSyncExternalStore(subscribeClock, () => clockOnPage, () => clockOnPage);

function WindowsClock() {
  const onPage = useClockOnPage();
  return <StatusBar style={onPage && !pageIsDark() ? 'dark' : 'light'} animated={onPage} />;
}

const IDENTITY = { transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }], borderRadius: 0 };
/**
 * Far out of sight: a feed picked (or left behind by a pick) the windows closed on, until React has
 * hidden its layer. Only for a frame or two: a look held still for a second is handed back to React.
 */
const PARKED = { transform: [{ translateX: 0 }, { translateY: -100000 }, { scale: 1 }], borderRadius: 0 };

/**
 * One built feed (For you, or a kept one; `index` its card): at rest it is exactly the feed (no
 * transform but the identity, nothing cut). While the windows are up each kept feed sits at its own
 * card, shrunk, moved and rounded with the same sums as every picture, so nothing React shows or hides
 * there ever has to be moved into place first: the feed you came from is its card, the one picked grows
 * back at its card as itself, and the rest are hidden there (their FeedLayer). `base` (For you) is never
 * hidden: it is its own card when it is one of those two, and otherwise lies under the card you came
 * from (which stays up until the windows close).
 */
export function WindowsLayer({ index, base = false, children }: { index: number; base?: boolean; children: React.ReactNode }) {
  const clipped = useWindowsClipped();
  const look = useAnimatedStyle(() => {
    const picked = index >= 0 && winPick.value === index;
    // Closed (or Reduce Motion): exactly the feed, whatever the other values say; but a feed picked or left
    // behind waits out of sight until React has hidden it (FeedWindows' finish), never over the feed on show.
    if (!winOn.value || winStill.value) return index >= 0 && winAway.value === index ? PARKED : IDENTITY;
    // Read so this look is worked out afresh every frame while they are up (winTick: never handed back to React).
    void winTick.value;
    const c = cardAt(index < 0 || (base && !picked) ? winLive.value : index, winP.value, winF.value, winGeo.value);
    return { transform: [{ translateX: c.x }, { translateY: c.y + winDrag.value }, { scale: c.s }], borderRadius: c.r };
  }, [index, base]);
  return (
    <Animated.View collapsable={false} style={[StyleSheet.absoluteFill, clipped ? styles.clipped : null, look]}>
      {children}
    </Animated.View>
  );
}

/** One feed's pages, the view its still is taken of. */
export function SnapFrame({ feed, children }: { feed: FeedKey; children: React.ReactNode }) {
  const ref = useRef<View>(null);
  useEffect(() => {
    registerShotNode(feed, ref.current);
    return () => registerShotNode(feed, null);
  }, [feed]);
  return <View ref={ref} collapsable={false} style={StyleSheet.absoluteFill}>{children}</View>;
}

/**
 * The ground behind the cards, only while they are up: the middle card's own picture, softened, the
 * way the iPhone's app switcher sits on the wallpaper. One layer per card, each as strong as its card
 * is near the middle, so the ground follows a swipe frame by frame (plain pictures, never glass or a
 * blur view: fading them is safe). A card with no picture (words, an empty feed) has the theme's own
 * dark. Up at full strength from the first frame: the shrinking feed uncovers it.
 */
export function WindowsGround() {
  const phase = useWindowsPhase();
  const g = useGround();
  if (phase === 'closed' || !g) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: g.deep, overflow: 'hidden' }]}>
      {g.uris.map((uri, i) => <GroundLayer key={i} i={i} uri={uri} deep={g.deep} />)}
      <View style={[StyleSheet.absoluteFill, styles.shade]} />
      <Vignette />
    </View>
  );
}

function GroundLayer({ i, uri, deep }: { i: number; uri: string | null; deep: string }) {
  const look = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, 1 - Math.abs(winF.value - i))) }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: deep }, look]}>
      {uri ? <ExpoImage source={{ uri }} style={[StyleSheet.absoluteFill, styles.groundPicture]} contentFit="cover" blurRadius={30} transition={0} cachePolicy="memory-disk" /> : null}
    </Animated.View>
  );
}

/** Darker towards the corners: black at nothing in the middle, 0.30 at the corners. One still drawing. */
function Vignette() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="windows-vignette" cx="50" cy="50" r="71" gradientUnits="userSpaceOnUse">
          <Stop offset="0.35" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.3} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill="url(#windows-vignette)" />
    </Svg>
  );
}

/** Shows its children only while the windows are down (a tip never sits over the cards). */
export function WindowsClosedOnly({ children }: { children: React.ReactNode }) {
  const phase = useWindowsPhase();
  return phase === 'closed' ? <>{children}</> : null;
}

/**
 * The Feed's top row. While the windows are up it rides with the real feed's card (the same sums)
 * and fades in the first part of the zoom, so nothing of it is left floating over the shrinking card;
 * coming back, it fades in over the last part, on the picked feed already, and sits above the cards
 * meanwhile. Nothing in the row is glass, so its fade is safe.
 */
export function WindowsRow(props: React.ComponentProps<typeof FeedTopRow>) {
  const phase = useWindowsPhase();
  const target = useWindowsTarget();
  const up = phase !== 'closed';
  const selected = target === null ? props.selected : target === FOR_YOU ? null : target;
  const look = useAnimatedStyle(() => {
    if (!winOn.value || winStill.value) return ROW_REST;
    void winTick.value;
    // The card in the middle: the real feed as it shrinks, the picked one as it grows back.
    const c = cardAt(winF.value, winP.value, winF.value, winGeo.value);
    return {
      opacity: interpolate(winP.value, [0, 0.3], [1, 0], 'clamp'),
      transform: [{ translateX: 0 }, { translateY: c.y + winDrag.value }, { scale: c.s }],
    };
  });
  return (
    <Animated.View pointerEvents={up ? 'none' : 'box-none'} style={[StyleSheet.absoluteFill, { zIndex: phase === 'closing' ? 10 : 8 }, look]}>
      <FeedTopRow {...props} selected={selected} />
    </Animated.View>
  );
}
const ROW_REST = { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };

export interface WindowFeed { key: FeedKey; name: string }

interface Opened {
  /** The card that is the real feed. */
  origin: number;
  faces: Face[];
  names: string[];
  metas: (WindowMeta | null)[];
  /** Reduce Motion: every card a picture, faded in over the feed, nothing zooms. */
  still: boolean;
  W: number;
  H: number;
  S: number;
}

interface Choosing {
  key: FeedKey;
  t: number;
  face: Face;
  /** When it was picked: its own feed's layer counts as up once it has been drawn since. */
  pickAt: number;
  /** The picked feed is now the one on show (it has been growing in its card as itself since the pick). */
  switched: boolean;
  switchAt: number;
  /** The picked card has grown back to the whole screen. */
  landed: boolean;
  /** Its own feed is drawn under it: the card's picture gives way over what is left of the grow (gone as it lands). */
  follow: boolean;
  fading: boolean;
}

const READER_ACTIONS = [{ name: 'activate' }];
/**
 * In a browser: the tabs' own sideways swipe (SwipeSurface.web) leaves the cards alone (the phone's
 * checks lockPageSwipe), and the browser never takes a drag on them for a scroll of its own
 * (the tabs allow up-and-down panning, which cancelled the swipe down).
 */
const SWIPE_IGNORE = (Platform.OS === 'web' ? { dataSet: { swipeIgnore: 'true' } } : {}) as object;
const NO_BROWSER_PAN = (Platform.OS === 'web' ? { touchAction: 'none' } : {}) as object;
const EASE_OUT = Easing.out(Easing.quad);
/**
 * Where the grow back makes the picked feed the one on show (its clock, the row's and the bar's ink): by
 * then the card you came from is off the screen and the picked one all but fills it.
 */
const SWITCH_AT_P = 0.15;
/** The longest a picked card's cover waits for its feed to draw, before it fades anyway. */
const READY_WAIT_MS = 600;
/** A picked card's cover still up as it lands (its feed drew too late to take over on the way): it fades this long. */
const COVER_FADE_MS = 160;
/** The picked card's picture gives way during the grow only if its feed is up while at least this much of it is left (else after it lands). */
const FOLLOW_FROM_P = 0.3;
/** How long the Feed is on screen in a visit before the windows' tip may show (it waits for a quiet moment, not the first swipe). */
const TIP_AFTER_MS = 20_000;
/** How long the middle card rests before its feed is built behind the cards, ready to be picked. */
const PREPARE_AFTER_MS = 150;

/**
 * The windows themselves. Mounted on the Feed (For you and its groups) only while they are
 * switched on for this person; with them off, nothing here exists.
 */
export function FeedWindows({ feeds, current, onChoose, onPrepare, blocked, firstSpot, metaOf }: {
  /** Activities, For you, then each group: the top row's order. */
  feeds: WindowFeed[];
  /** The feed on show. */
  current: FeedKey;
  /** A card was picked: show that feed (under the card, which then gives way to it). */
  onChoose: (key: FeedKey) => void;
  /** A card has rested in the middle: build its feed behind the cards (hidden), so a pick is instant. */
  onPrepare: (key: FeedKey) => void;
  /** Pinched in, or a clip's comments up: no windows. */
  blocked: boolean;
  /** For a feed not built: where it would start (its newest post). */
  firstSpot: (key: FeedKey) => Spot | null;
  /** The line under a card's name. */
  metaOf: (key: FeedKey) => WindowMeta | null;
}) {
  useTheme();
  const insets = useSafeAreaInsets();
  const phase = useWindowsPhase();
  const focused = useIsFocused();
  const tourOpen = useTourOpen();
  const reduceMotion = useReducedMotion();
  const rowSwitched = useWindowsRowSwitched();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const openedRef = useRef<Opened | null>(null);
  openedRef.current = opened ?? openedRef.current;
  const latest = useRef({ feeds, current, onChoose, onPrepare, blocked, firstSpot, metaOf, focused, tourOpen, reduceMotion, size, insets });
  latest.current = { feeds, current, onChoose, onPrepare, blocked, firstSpot, metaOf, focused, tourOpen, reduceMotion, size, insets };
  // The picked card's cover over its feed: which card, how strong, and (a written card) the last of
  // the grow it follows out (from that p down to 0).
  const coverIdx = useSharedValue(-1);
  const coverO = useSharedValue(1);
  const coverFrom = useSharedValue(0);
  // 1 from a pick until the grow has handed over to the picked feed (SWITCH_AT_P).
  const switchArmed = useSharedValue(0);
  // How the overlay fades (Reduce Motion only).
  const fade = useSharedValue(1);
  // Swipes and taps count only while the windows are up (not while a card grows back).
  const interactive = useSharedValue(0);
  const choosing = useRef<Choosing | null>(null);
  // Counts the closes that kept a feed out of sight (winAway), so only the latest close lets it back.
  const awaySeq = useRef(0);
  const raf = useRef(0);
  const guard = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prepareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRefs = useRef<(View | null)[]>([]);

  const ctl = useMemo(() => {
    const clearGuard = () => { if (guard.current) clearTimeout(guard.current); guard.current = null; };
    // Whatever an animation reports, the windows are never left half closed.
    const armGuard = (ms: number) => { clearGuard(); guard.current = setTimeout(() => { guard.current = null; if (windowsState().phase !== 'closed') snapClose(); }, ms); };

    const finish = (liveIdx: number) => {
      clearGuard();
      cancelAnimationFrame(raf.current);
      if (prepareTimer.current) clearTimeout(prepareTimer.current);
      prepareTimer.current = null;
      // As they close, a feed the screen must not show waits out of sight (WindowsLayer's PARKED) until
      // React has hidden its layer, rather than standing at the whole screen over the feed on show for a
      // frame: the one a pick left behind (it stayed up as it slid away), or the one picked, if they
      // closed before it became the one on show (taken down at once). Never For you, which lies under
      // whichever feed is on show. Written before the close, so it is in place when the close is.
      const c = choosing.current;
      const awayKey = !c || !openedRef.current || openedRef.current.still ? null : c.switched ? windowsState().origin : c.key;
      const away = awayKey && awayKey !== FOR_YOU ? latest.current.feeds.findIndex((f) => f.key === awayKey) : -1;
      winAway.value = away;
      if (away >= 0) {
        const seq = ++awaySeq.current;
        requestAnimationFrame(() => requestAnimationFrame(() => { if (awaySeq.current === seq && windowsState().phase === 'closed') winAway.value = -1; }));
      }
      choosing.current = null;
      interactive.value = 0;
      winScrub.value = 0;
      switchArmed.value = 0;
      cancelAnimation(winTick);
      winOn.value = 0;
      // Only after the close: For you, landed on, never stands for a frame under the card it came from.
      winPick.value = -1;
      winP.value = 0;
      winDrag.value = 0;
      winLive.value = liveIdx;
      winF.value = liveIdx;
      winStill.value = 0;
      coverIdx.value = -1;
      coverO.value = 1;
      coverFrom.value = 0;
      fade.value = 1;
      openedRef.current = null;
      setOpened(null);
      setGround(null);
      setClockOnPage(false);
      setWindowsState({ phase: 'closed', target: null, held: false, clipped: false });
      lockPageSwipe(false);
    };
    const finishOrigin = () => finish(openedRef.current?.origin ?? 0);
    const finishChosen = () => finish(choosing.current?.t ?? openedRef.current?.origin ?? 0);

    // At once, no animation: the Feed was left, the groups changed, the window changed size.
    const snapClose = () => {
      if (windowsState().phase === 'closed') return;
      [winP, winF, winDrag, winStill].forEach((v) => cancelAnimation(v));
      cancelAnimation(fade);
      cancelAnimation(coverO);
      const c = choosing.current;
      finish(c?.switched ? c.t : openedRef.current?.origin ?? 0);
    };

    const open = (finger: boolean) => {
      const L = latest.current;
      if (windowsState().phase !== 'closed' || !L.focused || L.blocked || L.tourOpen || !L.size) return;
      const origin = L.feeds.findIndex((f) => f.key === L.current);
      if (origin < 0 || L.feeds.length < 2) return;
      const { w: W, h: H } = L.size;
      const barTop = H - (Math.max(L.insets.bottom, 12) + BAR_METRICS.height + 10);
      // The names sit above the cards: names and cards, as one block, fit between the top and the
      // bar, the cards as large as they may be, the block centred in what is left.
      const top = L.insets.top + 8;
      const room = barTop - LABEL_SPACE - top;
      const S = Math.max(0.3, Math.min(CARD_MAX, room / H));
      const cardTop = top + LABEL_SPACE + Math.max(0, room - H * S) / 2;
      const dy = cardTop + (H * S) / 2 - H / 2;
      winGeo.value = { W, H, S, dy, step: W * S + CARD_GAP, rDevice: L.insets.bottom > 0 ? 44 : 0, rCard: L.insets.bottom > 0 ? 24 : 16, n: L.feeds.length };
      const still = !!L.reduceMotion;
      coverIdx.value = -1;
      coverO.value = 1;
      coverFrom.value = 0;
      switchArmed.value = 0;
      winPick.value = -1;
      winAway.value = -1;
      winDrag.value = 0;
      winLive.value = origin;
      winF.value = origin;
      winSel.value = origin;
      winOn.value = 1;
      interactive.value = 1;
      cancelAnimation(winTick);
      winTick.value = 0;
      // A phone only (a browser hands nothing back), and only while the real feed is a moving card.
      if (!still && Platform.OS !== 'web') winTick.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, true);
      if (still) {
        winStill.value = 1;
        winP.value = 1;
        fade.value = 0;
        fade.value = withTiming(1, { duration: 200, easing: EASE_OUT });
      } else {
        winStill.value = 0;
        fade.value = 1;
        // The zoom starts here, before any of React's work below.
        winP.value = withSpring(1, SPRING_OPEN, (done) => { 'worklet'; if (done) winP.value = 1; });
      }
      // The finger that held is still down: sliding it now moves between the cards (FeedHold).
      // Decided on the UI thread, in order with the finger's own lift: a finger already up (it lifted
      // while this hop was on its way) leaves the cards up to swipe and tap, never waiting on a slide.
      winScrub.value = 0;
      if (finger) runOnUI(() => { 'worklet'; winScrub.value = winFinger.value ? 1 : 0; })();
      haptics.tap();
      learned('feed-windows');
      const faces = L.feeds.map((f) => faceOf(f.key, L.firstSpot));
      const o: Opened = {
        origin, faces, still, W, H, S,
        names: L.feeds.map((f) => f.name),
        metas: L.feeds.map((f, i) => (i === origin ? null : L.metaOf(f.key))),
      };
      openedRef.current = o;
      setOpened(o);
      setGround({ uris: L.feeds.map((f) => groundOf(f.key, L.firstSpot)), deep: deepOf() });
      setWindowsState({ phase: 'open', origin: L.current, target: null, held: true, clipped: !still });
      lockPageSwipe(true);
    };

    // Back to the feed you came from: its card grows back to the whole screen.
    const dismiss = () => {
      const o = openedRef.current;
      if (!o || windowsState().phase !== 'open') return;
      interactive.value = 0;
      winScrub.value = 0;
      setWindowsState({ phase: 'closing', target: null });
      armGuard(2500);
      if (o.still) {
        fade.value = withTiming(0, { duration: 200, easing: EASE_OUT }, (done) => { 'worklet'; if (done) runOnJS(finishOrigin)(); });
        return;
      }
      const to = o.origin;
      winDrag.value = withSpring(0, SPRING_BACK);
      winF.value = withSpring(to, SPRING_BACK);
      winP.value = withSpring(0, SPRING_BACK, (done) => { 'worklet'; if (done) runOnJS(finishOrigin)(); });
    };

    // The picked card grows back as its own feed, drawn in it from the pick on (WindowsLayer; built
    // then if it was not yet): once that feed is up with its page whole, the card's picture gives way
    // to it over what is left of the grow, gone as the card lands, so the landing is the feed itself
    // and nothing is swapped at the end (Oct 26: a picture of a page, cut to the page as it landed,
    // read as a glitch). A feed not up until late in the grow (one just built, still fetching its
    // picture): the picture stays until the card has landed, then fades over the whole page.
    const settle = () => {
      const c = choosing.current;
      const o = openedRef.current;
      if (!c || !o || c !== choosing.current || windowsState().phase !== 'closing') return;
      const now = Date.now();
      const whole = feedWhole(c.key);
      if (!c.follow && !c.fading && !c.landed && !o.still && whole && feedShownAt(c.key) >= c.pickAt) {
        // Only with most of the grow still to go: squeezed into its last moments the change would be
        // a flash, so a feed that is up later is given way to by a plain fade once the card has landed.
        const p = winP.value;
        if (p > FOLLOW_FROM_P) { c.follow = true; coverFrom.value = p; }
      }
      const ready = feedReadyAt(c.key) >= c.switchAt;
      if (c.landed && c.switched && !c.fading) {
        const timedOut = now - c.switchAt >= READY_WAIT_MS;
        if (o.still) {
          if (ready || timedOut) {
            c.fading = true;
            fade.value = withTiming(0, { duration: 200, easing: EASE_OUT }, (done) => { 'worklet'; if (done) runOnJS(finishChosen)(); });
            return;
          }
        } else if ((ready && (c.follow || whole)) || timedOut) {
          if (ready && c.follow) { finishChosen(); return; }
          c.fading = true;
          coverO.value = withTiming(0, { duration: COVER_FADE_MS, easing: EASE_OUT }, (done) => { 'worklet'; if (done) runOnJS(finishChosen)(); });
          return;
        }
      }
      raf.current = requestAnimationFrame(settle);
    };

    // The grow has gone far enough that the card you came from is off the screen: the picked feed,
    // growing in its card as itself, becomes the one on show (its clock, the row's and the bar's ink).
    const handOver = () => {
      const c = choosing.current;
      if (!c || c.switched || windowsState().phase !== 'closing') return;
      c.switched = true;
      c.switchAt = Date.now();
      const spot = feedSpot(c.key);
      setClockOnPage(!!spot?.page && !spot.full);
      // Its page is on show with its numbers as the card lands (or as its picture gives way just after):
      // a session strip keeps them rather than dropping to 0 to count up as its feed becomes the one on show.
      if (spot?.postId) markStripShown(spot.postId);
      // The feed you came from stays up at its card as it slides off (its FeedLayer: leaving), until they close.
      latest.current.onChoose(c.key);
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(settle);
    };
    const landed = () => {
      const c = choosing.current;
      if (!c) return;
      c.landed = true;
      if (!c.switched) handOver();
    };

    const choose = (t: number) => {
      const o = openedRef.current;
      const L = latest.current;
      if (!o || windowsState().phase !== 'open') return;
      if (t === o.origin) { dismiss(); return; }
      const key = L.feeds[t]?.key;
      if (!key) return;
      interactive.value = 0;
      winScrub.value = 0;
      choosing.current = { key, t, face: o.faces[t], pickAt: Date.now(), switched: false, switchAt: 0, landed: false, follow: false, fading: false };
      if (!o.still) {
        // Its own feed goes up at its card from now, under the card's picture (a kept feed is there
        // already, hidden, so React only shows it; For you comes out from under the card you came from),
        // and is built now if it was not yet.
        winPick.value = t;
        coverIdx.value = t;
        coverO.value = 1;
        coverFrom.value = 0;
        if (key !== FOR_YOU) L.onPrepare(key);
      }
      setWindowsState({ phase: 'closing', target: key });
      armGuard(2500);
      if (o.still) { landed(); return; }
      switchArmed.value = 1;
      winDrag.value = withSpring(0, SPRING_BACK);
      winF.value = withSpring(t, SPRING_BACK);
      winP.value = withSpring(0, SPRING_BACK, (done) => {
        'worklet';
        if (!done) return;
        winP.value = 0;
        winF.value = t;
        winDrag.value = 0;
        if (switchArmed.value) { switchArmed.value = 0; runOnJS(handOver)(); }
        runOnJS(landed)();
      });
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(settle);
    };

    // Left and right in a browser (and nowhere else): one card along.
    const step = (by: number) => {
      const o = openedRef.current;
      if (!o || windowsState().phase !== 'open') return;
      const n = winGeo.value.n;
      const to = Math.max(0, Math.min(n - 1, Math.round(winF.value) + by));
      winF.value = o.still ? withTiming(to, { duration: 220, easing: EASE_OUT }) : withSpring(to, SPRING_SNAP, (done) => { 'worklet'; if (done) winF.value = to; });
    };

    // The held finger lifted (FeedHold).
    const scrubEnd = (how: ScrubEnd, sel: number) => {
      if (windowsState().phase !== 'open') return;
      if (how === 'choose') { choose(sel); return; }
      if (how === 'close') { dismiss(); return; }
      // Left up: they settle on the card pointed at, to swipe and tap as before.
      const o = openedRef.current;
      winDrag.value = o?.still ? withTiming(0, { duration: 220, easing: EASE_OUT }) : withSpring(0, SPRING_DRAG, (done) => { 'worklet'; if (done) winDrag.value = 0; });
      winF.value = o?.still ? withTiming(sel, { duration: 220, easing: EASE_OUT }) : withSpring(sel, SPRING_SNAP, (done) => { 'worklet'; if (done) winF.value = sel; });
    };

    // A card that has rested in the middle: its feed is built (hidden) and its poster fetched, so a pick is instant.
    const restAt = (idx: number) => {
      if (prepareTimer.current) clearTimeout(prepareTimer.current);
      prepareTimer.current = null;
      if (idx < 0) return;
      prepareTimer.current = setTimeout(() => {
        prepareTimer.current = null;
        const L = latest.current;
        const key = L.feeds[idx]?.key;
        if (!key || windowsState().phase !== 'open') return;
        const face = openedRef.current?.faces[idx];
        if (face?.kind === 'poster' && /^https?:/.test(face.uri)) void ExpoImage.prefetch([face.uri], 'memory-disk').catch(() => undefined);
        if (key !== L.current && key !== FOR_YOU) L.onPrepare(key);
      }, PREPARE_AFTER_MS);
    };

    const pressIn = () => {
      const L = latest.current;
      if (windowsState().phase !== 'closed' || !L.focused) return;
      snapFeed(L.current);
      // The cards' posters, fetched while the finger rests.
      const uris: string[] = [];
      for (const f of L.feeds) {
        const s = feedSpot(f.key) ?? L.firstSpot(f.key);
        if (s?.poster && /^https?:/.test(s.poster)) uris.push(s.poster);
      }
      if (uris.length) void ExpoImage.prefetch(uris, 'memory-disk').catch(() => undefined);
    };

    return {
      open, dismiss, choose, step, snapClose, pressIn, scrubEnd, restAt, handOver,
      close: () => {
        const p = windowsState().phase;
        if (p === 'closed') return false;
        if (p === 'open') dismiss();
        return true;
      },
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The row, the bar, Back and AppShell reach the windows through the store.
  useEffect(() => {
    setWindowsController({ open: (_from, finger) => ctl.open(finger), close: ctl.close, pressIn: ctl.pressIn, scrubEnd: ctl.scrubEnd });
    return () => {
      setWindowsController(null);
      if (guard.current) clearTimeout(guard.current);
      if (prepareTimer.current) clearTimeout(prepareTimer.current);
      cancelAnimationFrame(raf.current);
      // Taken down while up (signed out, the layout changed): everything back at once.
      if (windowsState().phase !== 'closed') {
        [winP, winF, winDrag, winStill, winTick].forEach((v) => cancelAnimation(v));
        winAway.value = -1; winOn.value = 0; winP.value = 0; winDrag.value = 0; winStill.value = 0; winScrub.value = 0; winF.value = winLive.value; winPick.value = -1;
        setGround(null);
        setClockOnPage(false);
        setWindowsState({ phase: 'closed', target: null, held: false, clipped: false });
        lockPageSwipe(false);
      }
    };
  }, [ctl]);

  // The grow back makes the picked feed the one on show once the card you came from is off the screen.
  useAnimatedReaction(() => switchArmed.value === 1 && winP.value < SWITCH_AT_P, (now, before) => {
    if (!now || before) return;
    switchArmed.value = 0;
    runOnJS(ctl.handOver)();
  }, [ctl]);
  // The middle card at rest (a lingering slide, a settled swipe): its feed gets built behind the cards.
  useAnimatedReaction(() => {
    if (!interactive.value && !winScrub.value) return -1;
    const r = Math.round(winF.value);
    return Math.abs(winF.value - r) < 0.2 ? r : -1;
  }, (now, before) => { if (now !== before) runOnJS(ctl.restAt)(now); }, [ctl]);

  // Gone at once when the Feed is left (another tab, a page opened over it), the groups change, or the window does.
  const feedsKey = feeds.map((f) => f.key).join('|');
  useEffect(() => { if (!focused) ctl.snapClose(); }, [focused, ctl]);
  // The app sent away: back on the feed you were on when you return (and nothing rests shrunk meanwhile, see winTick).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'background') ctl.snapClose(); });
    return () => sub.remove();
  }, [ctl]);
  const shape = useRef({ feedsKey, w: size?.w, h: size?.h });
  useEffect(() => {
    const was = shape.current;
    shape.current = { feedsKey, w: size?.w, h: size?.h };
    if (was.feedsKey !== feedsKey || was.w !== size?.w || was.h !== size?.h) ctl.snapClose();
  }, [feedsKey, size?.w, size?.h, ctl]);

  // A browser: no text selection or long-press menu on the words a hold opens from.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const menu = (e: Event) => { const t = e.target as Element | null; if (t?.closest?.('[data-feed-hold]')) e.preventDefault(); };
    document.addEventListener('contextmenu', menu);
    return () => document.removeEventListener('contextmenu', menu);
  }, []);

  // A browser's keys while the windows are up: ← → move, Enter opens, Esc goes back.
  useEffect(() => {
    if (!opened || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (windowsState().phase !== 'open') return;
      if (e.key === 'ArrowLeft') ctl.step(-1);
      else if (e.key === 'ArrowRight') ctl.step(1);
      else if (e.key === 'Enter' || e.key === ' ') {
        const focusedCard = (document.activeElement as HTMLElement | null)?.dataset?.windowCard;
        ctl.choose(focusedCard !== undefined ? Number(focusedCard) : Math.round(winF.value));
      } else if (e.key === 'Escape') ctl.dismiss();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [opened, ctl]);

  // A screen reader starts on the card you came from.
  useEffect(() => {
    if (!opened || Platform.OS === 'web') return undefined;
    const id = setTimeout(() => {
      const node = cardRefs.current[opened.origin];
      if (node) AccessibilityInfo.sendAccessibilityEvent(node as never, 'focus');
    }, 80);
    return () => clearTimeout(id);
  }, [opened]);

  // Which way a drag went (0 not yet, 1 sideways, 2 down), and where the middle card stood when it began.
  const axis = useSharedValue(0);
  const from = useSharedValue(0);
  const gesture = useMemo(() => {
    const { choose, dismiss } = ctl;
    const pan = Gesture.Pan()
      .activeOffsetX([-10, 10])
      .activeOffsetY([-10, 10])
      .onStart(() => {
        'worklet';
        axis.value = 0;
        // Never while a card grows back (or the held finger is still sliding): their own motion is left alone.
        if (!interactive.value || winScrub.value) return;
        cancelAnimation(winF);
        from.value = winF.value;
      })
      .onUpdate((e) => {
        'worklet';
        if (!interactive.value || winScrub.value) return;
        // The way it goes is settled once it has gone somewhere (a browser reports a first move of nothing).
        if (axis.value === 0) {
          if (Math.max(Math.abs(e.translationX), Math.abs(e.translationY)) < 6) return;
          axis.value = Math.abs(e.translationX) >= Math.abs(e.translationY) ? 1 : 2;
        }
        const g = winGeo.value;
        if (axis.value === 1) {
          let f = from.value - e.translationX / g.step;
          const last = g.n - 1;
          // Past either end it gives, a third as much.
          if (f < 0) f *= 0.3;
          else if (f > last) f = last + (f - last) * 0.3;
          winF.value = f;
        }
        // A downward swipe still closes them (onEnd), but the cards stay level while the finger moves
        // (Oct 26, owner: "there shouldn't rly be up and down movement").
      })
      .onEnd((e) => {
        'worklet';
        if (!interactive.value || winScrub.value) return;
        const g = winGeo.value;
        if (axis.value === 1) {
          // A little easier than half a card, and never two cards on one flick (feedWindows: swipeTarget).
          const to = swipeTarget(winF.value, from.value, e.velocityX / g.step, g.n);
          if (winStill.value) winF.value = withTiming(to, { duration: 220, easing: EASE_OUT });
          else winF.value = withSpring(to, { ...SPRING_SNAP, velocity: -e.velocityX / g.step }, (done) => { 'worklet'; if (done) winF.value = to; });
        } else if (axis.value === 2) {
          if (e.translationY > 70 || e.velocityY > 600) runOnJS(dismiss)();
          else if (winStill.value) winDrag.value = withTiming(0, { duration: 220, easing: EASE_OUT });
          else winDrag.value = withSpring(0, SPRING_DRAG, (done) => { 'worklet'; if (done) winDrag.value = 0; });
        }
      });
    const tap = Gesture.Tap()
      .maxDistance(10)
      .onEnd((e, success) => {
        'worklet';
        if (!success || !interactive.value || winScrub.value) return;
        const g = winGeo.value;
        const w = g.W * g.S;
        const h = g.H * g.S;
        const cy = g.H / 2 + g.dy;
        for (let i = 0; i < g.n; i += 1) {
          const cx = g.W / 2 + (i - winF.value) * g.step;
          // The card, or its name above it.
          if (Math.abs(e.x - cx) <= w / 2 && e.y >= cy - h / 2 - LABEL_SPACE && e.y <= cy + h / 2) { runOnJS(choose)(i); return; }
        }
        runOnJS(dismiss)();
      });
    return Gesture.Exclusive(pan, tap);
  }, [ctl, interactive, axis, from]);

  // The tip (Oct 26, owner: "This feature is kind of hidden"): at once after a feed is switched from
  // the top row, or once the Feed has been on screen a while this visit (TIP_AFTER_MS), never in the
  // tutorial. Like every tip it waits its turn: one a visit, never over another.
  const [dwelled, setDwelled] = useState(false);
  const watching = focused && phase === 'closed' && !blocked && !tourOpen;
  useEffect(() => {
    if (dwelled || !watching) return undefined;
    const t = setTimeout(() => setDwelled(true), TIP_AFTER_MS);
    return () => clearTimeout(t);
  }, [dwelled, watching]);
  const tip = useTip('feed-windows', watching && feeds.length >= 2 && (rowSwitched || dwelled));
  const fadeLook = useAnimatedStyle(() => ({ opacity: fade.value }));
  const hairline = withAlpha(colors.onMedia, 0.16);

  return (
    <>
      {/* The Feed's own size: the cards are worked out from it as they open. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setSize((s) => (s && s.w === width && s.h === height ? s : { w: width, h: height })); }} />
      <TipBubble tip="feed-windows" shown={tip.shown && phase === 'closed'} onClose={tip.close} pointer="up" style={{ top: insets.top + TOP_BAND_TOP + TOP_BAND_HEIGHT + 4, left: 16, right: 16 }} />
      {opened ? (
        <View
          style={[styles.overlay, NO_BROWSER_PAN]}
          accessibilityViewIsModal
          onAccessibilityEscape={ctl.dismiss}
          {...SWIPE_IGNORE}
        >
          <WindowsClock />
          <Animated.View style={[StyleSheet.absoluteFill, fadeLook]}>
            {opened.still ? <View style={[StyleSheet.absoluteFill, { backgroundColor: deepOf() }]} /> : null}
            {/* First for a screen reader, out of sight above the cards (a tap there goes back too, as anywhere off a card). */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Back to ${opened.names[opened.origin] ?? 'the feed'}`}
              onPress={ctl.dismiss}
              style={[styles.back, { top: insets.top }]}
            />
            <GestureDetector gesture={gesture}>
              <View collapsable={false} style={StyleSheet.absoluteFill}>
                {opened.names.map((name, i) => (
                  <Card
                    key={i}
                    i={i}
                    W={opened.W}
                    H={opened.H}
                    face={i === opened.origin && !opened.still ? null : opened.faces[i]}
                    name={name}
                    origin={i === opened.origin}
                    hairline={hairline}
                    coverIdx={coverIdx}
                    coverO={coverO}
                    coverFrom={coverFrom}
                    onActivate={() => ctl.choose(i)}
                    cardRef={(node) => { cardRefs.current[i] = node; }}
                  />
                ))}
                {opened.names.map((name, i) => (
                  <Label key={`l${i}`} i={i} W={opened.W} S={opened.S} name={name} origin={i === opened.origin} meta={opened.metas[i]} />
                ))}
              </View>
            </GestureDetector>
          </Animated.View>
        </View>
      ) : null}
    </>
  );
}

/** One card: a full-screen view, shrunk with the shared sums. Its look and words live on plain views inside. */
function Card({ i, W, H, face, name, origin, hairline, coverIdx, coverO, coverFrom, onActivate, cardRef }: {
  i: number; W: number; H: number; face: Face | null; name: string; origin: boolean; hairline: string;
  coverIdx: SharedValue<number>; coverO: SharedValue<number>; coverFrom: SharedValue<number>;
  onActivate: () => void; cardRef: (node: View | null) => void;
}) {
  const look = useAnimatedStyle(() => {
    const c = cardAt(i, winP.value, winF.value, winGeo.value);
    return {
      transform: [{ translateX: c.x }, { translateY: c.y + winDrag.value }, { scale: c.s }],
      borderRadius: c.r,
      // The hairline only on a card, never on the picture covering the whole screen.
      borderColor: interpolateColor(winP.value, [0, 1], ['rgba(255, 255, 255, 0)', hairline]),
      // Half a point on the card as it stands (the card is drawn at full size, then shrunk).
      borderWidth: 0.5 / Math.max(0.3, c.s),
    };
  });
  // The picked card's picture gives way to its own feed, up beneath it, over what is left of the grow
  // (FeedWindows' settle), most of the way while the card is still small: where the two differ (a
  // picture of a page, its words set large), the change is over early and the feed itself does the
  // growing. The card's hairline stays, as on the card you came from. Plain pictures and words, never
  // glass or a blur: fading them is safe.
  const faceLook = useAnimatedStyle(() => {
    if (coverIdx.value !== i) return { opacity: 1 };
    let opacity = coverO.value;
    if (coverFrom.value > 0) {
      const left = Math.max(0, Math.min(1, winP.value / coverFrom.value));
      opacity = Math.min(opacity, left * left);
    }
    return { opacity };
  });
  const onAction = (e: AccessibilityActionEvent) => { if (e.nativeEvent.actionName === 'activate') onActivate(); };
  return (
    <Animated.View pointerEvents="box-none" style={[styles.card, { width: W, height: H }, look]}>
      {face ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, faceLook]}><CardFace face={face} name={name} H={H} /></Animated.View> : null}
      <View
        ref={cardRef}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${name}, feed${origin ? ', current' : ''}`}
        accessibilityHint="Opens this feed"
        accessibilityActions={READER_ACTIONS}
        onAccessibilityAction={onAction}
        style={StyleSheet.absoluteFill}
        {...(Platform.OS === 'web' ? { dataSet: { windowCard: String(i) } } : {})}
      />
    </Animated.View>
  );
}

function CardFace({ face, name, H }: { face: Face; name: string; H: number }) {
  if (face.kind === 'shot') {
    return <ExpoImage source={{ uri: face.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} cachePolicy="none" />;
  }
  if (face.kind === 'poster') {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: face.contain ? '#000000' : colors.bg }]}>
        <ExpoImage source={{ uri: face.uri }} style={StyleSheet.absoluteFill} contentFit={face.contain ? 'contain' : 'cover'} transition={0} cachePolicy="memory-disk" />
      </View>
    );
  }
  if (face.kind === 'text') return <WrittenFace face={face} H={H} />;
  return (
    <View style={[StyleSheet.absoluteFill, styles.nameFace, { backgroundColor: colors.bg }]}>
      <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[typography.title, { color: colors.text }]}>{name}</Text>
      <Text maxFontSizeMultiplier={TextScale.CHROME} style={[typography.body, styles.nameEmpty, { color: colors.textMuted }]}>{face.empty ? 'No posts yet' : ' '}</Text>
    </View>
  );
}

/**
 * A written post's card: its page, with the words set large (at the card's size they read at about
 * 22 points): the post's own header and label, the words, then its buttons, centred a little above
 * the middle. Drawn, not live: nothing on it can be pressed.
 */
function WrittenFace({ face, H }: { face: Extract<Face, { kind: 'text' }>; H: number }) {
  const { posts, users, currentUserId } = useApp();
  const post = face.postId ? posts.find((p) => p.id === face.postId) : undefined;
  const author = post ? users.find((u) => u.id === post.authorId) : undefined;
  const kind = post ? postKindMeta(post) : null;
  const likes = post?.likedBy.length ?? 0;
  const liked = !!post && !!currentUserId && post.likedBy.includes(currentUserId);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
      <View style={[styles.writtenBlock, { height: H * 0.8 }]}>
        {author ? (
          <View style={styles.writtenHeader}>
            <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={44} />
            <View style={styles.writtenWho}>
              <View style={styles.writtenNameRow}>
                <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[styles.writtenName, { color: colors.text }]}>{author.name}</Text>
                <StreakFlame days={shownStreak(author, currentUserId)} silent />
              </View>
              <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[typography.small, { color: colors.textFaint }]}>@{author.handle}{post ? ` · ${relativeTime(post.createdAt)}` : ''}</Text>
            </View>
            <LevelPill profile={author.profile} small />
          </View>
        ) : face.author ? (
          <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[styles.writtenName, { color: colors.text }]}>{face.author}</Text>
        ) : null}
        {kind ? (
          <View style={[styles.kindRow, { borderColor: withAlpha(kind.tint, 0.33) }]}>
            {kind.icon === 'court'
              ? <View style={styles.kindGlyph}><CourtGlyph size={10.4} color={kind.tint} /></View>
              : <Ionicons name={kind.icon} size={13} color={kind.tint} />}
            <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.kindLabel, { color: kind.tint }]}>{kind.label}</Text>
          </View>
        ) : null}
        <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={8} style={[styles.writtenWords, { color: colors.text }]}>{face.text}</Text>
        {post ? (
          <View style={styles.writtenActions}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? LIKE_RED : colors.text} />
            {likes ? <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.writtenCount, { color: colors.text }]}>{compactNumber(likes)}</Text> : null}
            <Ionicons name="chatbubble-outline" size={25} color={colors.text} style={styles.writtenAction} />
            <Ionicons name="arrow-redo-outline" size={26} color={colors.text} style={styles.writtenAction} />
            <View style={styles.writtenEnd} />
            <Ionicons name="bookmark-outline" size={25} color={colors.text} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A card's name above it (a finger come up from the bar never covers it), brightest on the middle
 * card, coming in as the cards settle. Under the name of the card you came from, the row's own mark;
 * under the others' names, who posted and how many you have not seen. The names stand on one line
 * across the cards whatever is under them; the block's foot is LABEL_SPACE - LABEL_HEIGHT above the card.
 */
function Label({ i, W, S, name, origin, meta }: { i: number; W: number; S: number; name: string; origin: boolean; meta: WindowMeta | null }) {
  const look = useAnimatedStyle(() => {
    const g = winGeo.value;
    const c = cardAt(i, winP.value, winF.value, g);
    const near = Math.max(0, Math.min(1, 1 - Math.abs(winF.value - i)));
    return {
      opacity: (0.55 + 0.45 * near) * interpolate(winP.value, [0.55, 1], [0, 1], 'clamp'),
      transform: [{ translateX: c.x }, { translateY: g.H / 2 + c.y - (g.H * c.s) / 2 - LABEL_SPACE + winDrag.value }],
    };
  });
  const fresh = meta ? (meta.fresh > 9 ? '9+ new' : meta.fresh > 0 ? `${meta.fresh} new` : meta.newestAt ? relativeTime(meta.newestAt) : '') : '';
  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.label, { width: W }, look]}>
      <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[styles.labelText, { maxWidth: W * S, color: colors.onMedia }]}>{name}</Text>
      {origin ? (
        <View style={styles.labelLine}>
          <View style={[styles.labelMark, { backgroundColor: colors.onMedia }]} />
        </View>
      ) : meta && (meta.avatars.length || fresh) ? (
        <View style={[styles.labelLine, styles.labelMeta]}>
          {meta.avatars.length ? (
            <View style={[styles.labelFaces, { width: 16 + (meta.avatars.length - 1) * 11 }]}>
              {meta.avatars.map((a, k) => (
                <Avatar key={a.id} name={a.name} seed={a.seed} uri={a.uri} size={16} style={[styles.labelFace, { left: k * 11, zIndex: 3 - k }]} />
              ))}
            </View>
          ) : null}
          {fresh ? <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[styles.labelFresh, { color: withAlpha(colors.onMedia, 0.78) }]}>{fresh}</Text> : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clipped: { overflow: 'hidden' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 },
  card: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  shade: { backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  // A little larger than the page, so the softened picture's edges never show.
  groundPicture: { transform: [{ scale: 1.12 }] },
  label: { position: 'absolute', left: 0, top: 0, height: LABEL_HEIGHT, alignItems: 'center' },
  labelText: { fontSize: 15, lineHeight: 20, ...font('600') },
  // The line under a name: the row's own mark (at its top, 24 points under the name's top), or who posted.
  labelLine: { marginTop: 4, height: 16, alignItems: 'center' },
  labelMark: { width: 18, height: 2.5, borderRadius: 1.25 },
  labelMeta: { flexDirection: 'row', gap: 6 },
  labelFaces: { height: 16 },
  labelFace: { position: 'absolute', top: 0 },
  labelFresh: { fontSize: 12.5, lineHeight: 16, ...font('500') },
  nameFace: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  nameEmpty: { marginTop: 8 },
  writtenBlock: { position: 'absolute', top: 0, left: 0, right: 0, justifyContent: 'center', paddingHorizontal: 20 },
  writtenHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  writtenWho: { flex: 1, minWidth: 0 },
  writtenNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  writtenName: { fontSize: 16, lineHeight: 21, ...font('600'), flexShrink: 1 },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, marginTop: 12 },
  kindGlyph: { width: 13, alignItems: 'center' },
  kindLabel: { ...typography.caption, fontSize: 12, letterSpacing: 0 },
  writtenWords: { fontSize: 32, lineHeight: 41, letterSpacing: -0.5, ...font('600'), marginTop: 14 },
  writtenActions: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  writtenCount: { fontSize: 15, ...font('600'), marginLeft: 5 },
  writtenAction: { marginLeft: 18 },
  writtenEnd: { flex: 1 },
  back: { position: 'absolute', left: 0, width: 44, height: 44 },
});
