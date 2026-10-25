import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import Animated, { Easing, cancelAnimation, interpolate, interpolateColor, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image as ExpoImage } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedTopRow } from '@/features/groups/FeedTopRow';
import { TipBubble } from '@/components/TipBubble';
import { TOP_BAND_HEIGHT, TOP_BAND_TOP } from '@/features/feed/topBand';
import { BAR_METRICS } from '@/features/navigation/tabBarLook';
import { lockPageSwipe } from '@/features/navigation/swipeLock';
import { useTourOpen } from '@/features/tour/tourStore';
import { learned, useTip } from '@/features/tips/tips';
import { useIsFocused } from '@/lib/useIsFocused';
import * as haptics from '@/lib/haptics';
import { colors, font, typography, withAlpha } from '@/theme';
import { darkColors, useTheme } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';
import {
  CARD_GAP, FOR_YOU, LABEL_SPACE, SPRING_BACK, SPRING_DRAG, SPRING_OPEN, SPRING_SNAP,
  cardAt, feedShot, feedSpot, registerShotNode, setWindowsController, setWindowsState, snapFeed,
  useWindowsClipped, useWindowsPhase, useWindowsRowSwitched, useWindowsTarget, windowsState,
  winDrag, winF, winGeo, winLive, winOn, winP, winStill, winTick,
  type FeedKey, type Spot,
} from './feedWindows';

/*
 * The Feed's windows (features/feed/feedWindows has the why and the switch). This file is
 * FeedWindowsView, not FeedWindows: a Mac's disk cannot tell FeedWindows.tsx from feedWindows.ts.
 *
 * The pieces, each a small component of its own so the Feed and its pages never redraw for them:
 *  - WindowsStack: wraps the built feeds (For you and the kept ones). It is the card you came from:
 *    the real feed, held still, shrunk with the same sums as every other card.
 *  - WindowsGround: the dark ground the cards sit on, there only while the windows are up.
 *  - WindowsRow: the top row, put away while they are up (its own 180 ms fade; nothing in it is glass).
 *  - FeedWindows: the other cards (stills), their names, the swipes and taps, Back, the keys in a
 *    browser, and the one-time hint.
 */

/** What a card that is not the real feed shows. */
type Face =
  | { kind: 'shot'; uri: string }
  | { kind: 'poster'; uri: string; contain: boolean }
  | { kind: 'text'; author?: string; text: string }
  | { kind: 'name'; empty: boolean };

function faceOf(key: FeedKey, firstSpot: (key: FeedKey) => Spot | null): Face {
  const spot = feedSpot(key);
  const shot = feedShot(key);
  // A still, only while that feed is still on the page it was taken of.
  if (spot?.page && shot && shot.page === spot.page) return { kind: 'shot', uri: shot.uri };
  const s = spot ?? firstSpot(key) ?? undefined;
  if (s?.poster) return { kind: 'poster', uri: s.poster, contain: s.landscape };
  if (s?.text) return { kind: 'text', author: s.author, text: s.text };
  return { kind: 'name', empty: !s || !s.page };
}

const IDENTITY = { transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }], borderRadius: 0 };

/**
 * The built feeds, as one card: at rest it is exactly the feed (no transform but the identity,
 * nothing cut); while the windows are up it shrinks, moves and rounds with the others.
 */
export function WindowsStack({ children }: { children: React.ReactNode }) {
  const clipped = useWindowsClipped();
  const look = useAnimatedStyle(() => {
    // Closed (or Reduce Motion): exactly the feed, whatever the other values say.
    if (!winOn.value || winStill.value) return IDENTITY;
    // Read so this look is worked out afresh every frame while they are up (winTick: never handed back to React).
    void winTick.value;
    const c = cardAt(winLive.value, winP.value, winF.value, winGeo.value);
    return { transform: [{ translateX: c.x }, { translateY: c.y + winDrag.value }, { scale: c.s }], borderRadius: c.r };
  });
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

/** The dark ground behind the cards, only while they are up. */
export function WindowsGround() {
  const phase = useWindowsPhase();
  if (phase === 'closed') return null;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: darkColors.bg }]} />;
}

/** Shows its children only while the windows are down (a tip never sits over the cards). */
export function WindowsClosedOnly({ children }: { children: React.ReactNode }) {
  const phase = useWindowsPhase();
  return phase === 'closed' ? <>{children}</> : null;
}

/** The Feed's top row, put away while the windows are up; a card picked moves its word there at once. */
export function WindowsRow(props: React.ComponentProps<typeof FeedTopRow>) {
  const phase = useWindowsPhase();
  const target = useWindowsTarget();
  const up = phase !== 'closed';
  const selected = target === null ? props.selected : target === FOR_YOU ? null : target;
  return <FeedTopRow {...props} selected={selected} hidden={props.hidden || up} pinched={!!props.pinched || up} />;
}

export interface WindowFeed { key: FeedKey; name: string }

interface Opened {
  /** The card that is the real feed. */
  origin: number;
  faces: Face[];
  names: string[];
  /** Reduce Motion: every card a picture, faded in over the feed, nothing zooms. */
  still: boolean;
  W: number;
  H: number;
  S: number;
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
 * The windows themselves. Mounted on the Feed (For you and its groups) only while they are
 * switched on for this person; with them off, nothing here exists.
 */
export function FeedWindows({ feeds, current, onChoose, blocked, firstSpot }: {
  /** Activities, For you, then each group: the top row's order. */
  feeds: WindowFeed[];
  /** The feed on show. */
  current: FeedKey;
  /** A card was picked: show that feed (under the card, which then gives way to it). */
  onChoose: (key: FeedKey) => void;
  /** Pinched in, or a clip's comments up: no windows. */
  blocked: boolean;
  /** For a feed not built: where it would start (its newest post). */
  firstSpot: (key: FeedKey) => Spot | null;
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
  openedRef.current = opened;
  const latest = useRef({ feeds, current, onChoose, blocked, firstSpot, focused, tourOpen, reduceMotion, size, insets });
  latest.current = { feeds, current, onChoose, blocked, firstSpot, focused, tourOpen, reduceMotion, size, insets };
  // The card being uncovered after a pick, and how the overlay fades (Reduce Motion only).
  const coverIdx = useSharedValue(-1);
  const coverO = useSharedValue(1);
  const fade = useSharedValue(1);
  // Swipes and taps count only while the windows are up (not while a card grows back).
  const interactive = useSharedValue(0);
  const choosing = useRef<{ key: FeedKey; t: number; face: Face; landed: boolean } | null>(null);
  const raf = useRef(0);
  const guard = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRefs = useRef<(View | null)[]>([]);

  const ctl = useMemo(() => {
    const clearGuard = () => { if (guard.current) clearTimeout(guard.current); guard.current = null; };
    // Whatever an animation reports, the windows are never left half closed.
    const armGuard = (ms: number) => { clearGuard(); guard.current = setTimeout(() => { guard.current = null; if (windowsState().phase !== 'closed') snapClose(); }, ms); };

    const finish = (liveIdx: number) => {
      clearGuard();
      cancelAnimationFrame(raf.current);
      choosing.current = null;
      interactive.value = 0;
      cancelAnimation(winTick);
      winOn.value = 0;
      winP.value = 0;
      winDrag.value = 0;
      winLive.value = liveIdx;
      winF.value = liveIdx;
      winStill.value = 0;
      coverIdx.value = -1;
      coverO.value = 1;
      fade.value = 1;
      setOpened(null);
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
      finish(c?.landed ? c.t : openedRef.current?.origin ?? 0);
    };

    const open = () => {
      const L = latest.current;
      if (windowsState().phase !== 'closed' || !L.focused || L.blocked || L.tourOpen || !L.size) return;
      const origin = L.feeds.findIndex((f) => f.key === L.current);
      if (origin < 0 || L.feeds.length < 2) return;
      const { w: W, h: H } = L.size;
      const barTop = H - (Math.max(L.insets.bottom, 12) + BAR_METRICS.height + 10);
      const top = L.insets.top + 12;
      const room = barTop - LABEL_SPACE - top;
      const S = Math.max(0.3, Math.min(0.64, room / H));
      const dy = top + room / 2 - H / 2;
      winGeo.value = { W, H, S, dy, step: W * S + CARD_GAP, rDevice: L.insets.bottom > 0 ? 44 : 0, rCard: L.insets.bottom > 0 ? 28 : 16, n: L.feeds.length };
      const still = !!L.reduceMotion;
      coverIdx.value = -1;
      coverO.value = 1;
      winDrag.value = 0;
      winLive.value = origin;
      winF.value = origin;
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
      haptics.tap();
      learned('feed-windows');
      const faces = L.feeds.map((f) => faceOf(f.key, L.firstSpot));
      setOpened({ origin, faces, names: L.feeds.map((f) => f.name), still, W, H, S });
      setWindowsState({ phase: 'open', origin: L.current, target: null, held: true, clipped: !still });
      lockPageSwipe(true);
    };

    // Back to the feed you came from: its card grows back to the whole screen.
    const dismiss = () => {
      const o = openedRef.current;
      if (!o || windowsState().phase !== 'open') return;
      interactive.value = 0;
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

    // The picked card's picture stays over the new feed until that feed has drawn its page.
    const uncover = () => {
      const c = choosing.current;
      const o = openedRef.current;
      if (!c || !o) return;
      armGuard(1000);
      if (o.still) { fade.value = withTiming(0, { duration: 200, easing: EASE_OUT }, (done) => { 'worklet'; if (done) runOnJS(finishChosen)(); }); return; }
      // A still of the very page now under it: a cut. A poster or words: a short fade.
      if (c.face.kind === 'shot') { finishChosen(); return; }
      coverO.value = withTiming(0, { duration: 140, easing: EASE_OUT }, (done) => { 'worklet'; if (done) runOnJS(finishChosen)(); });
    };

    const land = () => {
      const c = choosing.current;
      if (!c || c.landed || windowsState().phase !== 'closing') return;
      c.landed = true;
      winLive.value = c.t;
      latest.current.onChoose(c.key);
      armGuard(2500);
      const t0 = Date.now();
      // A feed built only now reports its page once it is up, and its own 220 ms fade-in starts then:
      // counted from that moment, so the feed you came from never shows through it as the picture goes.
      let seen = feedSpot(c.key) !== undefined ? t0 : 0;
      const wait = () => {
        if (choosing.current !== c || windowsState().phase !== 'closing') return;
        const now = Date.now();
        if (!seen && feedSpot(c.key) !== undefined) seen = now;
        // Its page reported, and the feed's own fade-in done (two frames to spare); never past 1.5 s.
        if ((seen && now - seen >= 313) || now - t0 >= 1500) { uncover(); return; }
        raf.current = requestAnimationFrame(wait);
      };
      raf.current = requestAnimationFrame(wait);
    };

    const choose = (t: number) => {
      const o = openedRef.current;
      const L = latest.current;
      if (!o || windowsState().phase !== 'open') return;
      if (t === o.origin) { dismiss(); return; }
      const key = L.feeds[t]?.key;
      if (!key) return;
      interactive.value = 0;
      choosing.current = { key, t, face: o.faces[t], landed: false };
      setWindowsState({ phase: 'closing', target: key });
      armGuard(2500);
      if (o.still) { land(); return; }
      coverIdx.value = t;
      winDrag.value = withSpring(0, SPRING_BACK);
      winF.value = withSpring(t, SPRING_BACK);
      winP.value = withSpring(0, SPRING_BACK, (done) => {
        'worklet';
        if (!done) return;
        winP.value = 0;
        winF.value = t;
        winDrag.value = 0;
        // The real feed comes to rest under the picked card's picture, at full size.
        winLive.value = t;
        runOnJS(land)();
      });
    };

    // Left and right in a browser (and nowhere else): one card along.
    const step = (by: number) => {
      const o = openedRef.current;
      if (!o || windowsState().phase !== 'open') return;
      const n = winGeo.value.n;
      const to = Math.max(0, Math.min(n - 1, Math.round(winF.value) + by));
      winF.value = o.still ? withTiming(to, { duration: 220, easing: EASE_OUT }) : withSpring(to, SPRING_SNAP, (done) => { 'worklet'; if (done) winF.value = to; });
    };

    const pressIn = () => {
      const L = latest.current;
      if (windowsState().phase !== 'closed' || !L.focused) return;
      snapFeed(L.current);
      // The cards' posters, fetched while the finger rests.
      const uris: string[] = [];
      for (const f of L.feeds) {
        if (f.key === L.current) continue;
        const s = feedSpot(f.key) ?? L.firstSpot(f.key);
        if (s?.poster && /^https?:/.test(s.poster)) uris.push(s.poster);
      }
      if (uris.length) void ExpoImage.prefetch(uris, 'memory-disk').catch(() => undefined);
    };

    return {
      open, dismiss, choose, step, snapClose, pressIn,
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
    setWindowsController({ open: () => ctl.open(), close: ctl.close, pressIn: ctl.pressIn });
    return () => {
      setWindowsController(null);
      if (guard.current) clearTimeout(guard.current);
      cancelAnimationFrame(raf.current);
      // Taken down while up (signed out, the layout changed): everything back at once.
      if (windowsState().phase !== 'closed') {
        [winP, winF, winDrag, winStill, winTick].forEach((v) => cancelAnimation(v));
        winOn.value = 0; winP.value = 0; winDrag.value = 0; winStill.value = 0; winF.value = winLive.value;
        setWindowsState({ phase: 'closed', target: null, held: false, clipped: false });
        lockPageSwipe(false);
      }
    };
  }, [ctl]);

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
        // Never while a card grows back: its own motion is left alone.
        if (!interactive.value) return;
        cancelAnimation(winF);
        from.value = winF.value;
      })
      .onUpdate((e) => {
        'worklet';
        if (!interactive.value) return;
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
        } else {
          winDrag.value = Math.max(0, e.translationY) * 0.5;
        }
      })
      .onEnd((e) => {
        'worklet';
        if (!interactive.value) return;
        const g = winGeo.value;
        if (axis.value === 1) {
          const to = Math.max(0, Math.min(g.n - 1, Math.round(winF.value - (e.velocityX / g.step) * 0.18)));
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
        if (!success || !interactive.value) return;
        const g = winGeo.value;
        const w = g.W * g.S;
        const h = g.H * g.S;
        const cy = g.H / 2 + g.dy;
        for (let i = 0; i < g.n; i += 1) {
          const cx = g.W / 2 + (i - winF.value) * g.step;
          if (Math.abs(e.x - cx) <= w / 2 && e.y >= cy - h / 2 && e.y <= cy + h / 2 + LABEL_SPACE) { runOnJS(choose)(i); return; }
        }
        runOnJS(dismiss)();
      });
    return Gesture.Exclusive(pan, tap);
  }, [ctl, interactive, axis, from]);

  const tip = useTip('feed-windows', focused && phase === 'closed' && feeds.length >= 3 && rowSwitched && !blocked);
  const fadeLook = useAnimatedStyle(() => ({ opacity: fade.value }));
  const hairline = withAlpha(colors.onMedia, 0.1);

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
          <StatusBar style="light" />
          <Animated.View style={[StyleSheet.absoluteFill, fadeLook]}>
            {opened.still ? <View style={[StyleSheet.absoluteFill, { backgroundColor: darkColors.bg }]} /> : null}
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
                    topInset={insets.top}
                    onActivate={() => ctl.choose(i)}
                    cardRef={(node) => { cardRefs.current[i] = node; }}
                  />
                ))}
                {opened.names.map((name, i) => (
                  <Label key={`l${i}`} i={i} W={opened.W} S={opened.S} name={name} origin={i === opened.origin} />
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
function Card({ i, W, H, face, name, origin, hairline, coverIdx, coverO, topInset, onActivate, cardRef }: {
  i: number; W: number; H: number; face: Face | null; name: string; origin: boolean; hairline: string;
  coverIdx: SharedValue<number>; coverO: SharedValue<number>; topInset: number;
  onActivate: () => void; cardRef: (node: View | null) => void;
}) {
  const picture = face?.kind === 'shot' || face?.kind === 'poster';
  const look = useAnimatedStyle(() => {
    const c = cardAt(i, winP.value, winF.value, winGeo.value);
    return {
      transform: [{ translateX: c.x }, { translateY: c.y + winDrag.value }, { scale: c.s }],
      borderRadius: c.r,
      // The hairline only on a card, never on the picture covering the whole screen.
      borderColor: interpolateColor(winP.value, [0, 1], ['rgba(255, 255, 255, 0)', hairline]),
      opacity: coverIdx.value === i ? coverO.value : 1,
    };
  });
  const onAction = (e: AccessibilityActionEvent) => { if (e.nativeEvent.actionName === 'activate') onActivate(); };
  return (
    <Animated.View pointerEvents="box-none" style={[styles.card, { width: W, height: H }, picture ? styles.edge : null, look]}>
      {face ? <CardFace face={face} name={name} topInset={topInset} /> : null}
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

function CardFace({ face, name, topInset }: { face: Face; name: string; topInset: number }) {
  if (face.kind === 'shot') {
    return <ExpoImage source={{ uri: face.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} cachePolicy="none" />;
  }
  if (face.kind === 'poster') {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: face.contain ? darkColors.bg : colors.bg }]}>
        <ExpoImage source={{ uri: face.uri }} style={StyleSheet.absoluteFill} contentFit={face.contain ? 'contain' : 'cover'} transition={0} cachePolicy="memory-disk" />
      </View>
    );
  }
  if (face.kind === 'text') {
    return (
      <View style={[StyleSheet.absoluteFill, styles.textFace, { backgroundColor: colors.bg, paddingTop: topInset + 64 }]}>
        {face.author ? <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[typography.smallStrong, { color: colors.text }]}>{face.author}</Text> : null}
        <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={12} style={[typography.body, styles.textBody, { color: colors.text }]}>{face.text}</Text>
      </View>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, styles.nameFace, { backgroundColor: colors.bg }]}>
      <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[typography.title, { color: colors.textMuted }]}>{name}</Text>
      {face.empty ? <Text maxFontSizeMultiplier={TextScale.CHROME} style={[typography.body, styles.nameEmpty, { color: colors.textMuted }]}>No posts yet</Text> : null}
    </View>
  );
}

/** A card's name, under it, coming in as the cards settle. */
function Label({ i, W, S, name, origin }: { i: number; W: number; S: number; name: string; origin: boolean }) {
  const look = useAnimatedStyle(() => {
    const g = winGeo.value;
    const c = cardAt(i, winP.value, winF.value, g);
    return {
      opacity: interpolate(winP.value, [0.55, 1], [0, 1], 'clamp'),
      transform: [{ translateX: c.x }, { translateY: g.H / 2 + c.y + (g.H * c.s) / 2 + 8 + winDrag.value }],
    };
  });
  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.label, { width: W }, look]}>
      <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[styles.labelText, { maxWidth: W * S, color: origin ? colors.onMedia : withAlpha(colors.onMedia, 0.7) }]}>{name}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clipped: { overflow: 'hidden' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 },
  card: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  edge: { borderWidth: 1.5 },
  label: { position: 'absolute', left: 0, top: 0, alignItems: 'center' },
  labelText: { fontSize: 13, lineHeight: 18, ...font('600') },
  textFace: { padding: 20 },
  textBody: { marginTop: 8 },
  nameFace: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  nameEmpty: { marginTop: 8 },
  back: { position: 'absolute', left: 0, width: 44, height: 44 },
});
