import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, BackHandler, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, ReduceMotion, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@/components/ui/Button';
import { useCurtainDown } from '@/features/feed/warmup';
import { setBarCompact } from '@/features/navigation/barShrink';
import { START_SECTION, START_TAB, isStartTab } from '@/features/navigation/startTab';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { requestSection, useShownSection } from '@/features/navigation/swipeOrder';
import { LAST_BUTTON, TOUR_STEPS, type HoleShape, type TourStep, type TourTargetId } from '@/features/tour/steps';
import { TOUR_ON, hasSeenTour, isNewAccount, markTourSeen } from '@/features/tour/tourSeen';
import {
  endTourQuietly, lastTourRect, measureTourTarget, nextStep, openTour, setTourPending, skipTour, useTour, useTourRequest,
  type TourRect, type TourRun,
} from '@/features/tour/tourStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import { sinceLastPost, useAnyUploading } from '@/lib/uploads';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { LAYOUT, useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, pageIsDark, radius, typography } from '@/theme';

/**
 * The first-run tour: the screen dims, a small card explains one thing at a
 * time, and a lit window in the dim glides along the bar to the thing being
 * explained. A tap anywhere moves on; Skip ends it. It plays over the page
 * the app opens on (Community, on Find Players), which stays put underneath.
 *
 * It lives in the shell, beside the bar, so the dim can sit over the bar and
 * light one of its buttons. There is no browser twin of this file: the
 * drawing is the same everywhere, and the few browser differences (keys,
 * focus, the dialog role) are checks on Platform below.
 */

/** The app's own ease: quick off the mark, a long soft landing. */
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
/** Our own Reduce Motion handling sets the timings below, so Reanimated is told not to second-guess it. */
const NEVER = ReduceMotion.Never;
/** How long the window and the card take to move from one tip to the next. */
const GLIDE = 360;
/** Between the card's pointer and the lit window: 8 for the pointer, 6 of air. */
const GAP = 14;
/** The screen margin a card never crosses. */
const M = 16;
/** How far the first tip's demo fingertip travels, right to left, above the card. */
const SLIDE = 72;
/** For this long after a tip lands, a tap does not move on, so a quick double tap can't skip one unread. */
const DWELL = 400;
/** The wait on the start page before the dim arrives: the map gets a moment, and anything first-move opens wins. */
const SETTLE_MS = 1200;
/** The bar's own return to full size, before anything on it is measured. */
const BAR_SETTLE_MS = 260;
const PAD = 16;
const TITLE_GAP = 6;
const FOOT_GAP = 14;
const TITLE_ID = 'courtside-tour-title';
/** The phone bar's glass starts 14 points in from each side; a lit tab never spills past it. */
const BAR_SIDE = 15;
/**
 * Android 8 and older draw no outer shadow at all, so there the dim is drawn
 * as a very wide border round the window instead: the same dim, a crisp edge.
 */
const NO_SHADOW_DIM = Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version < 28;

type Layout = 'phone' | 'wide';
type Hole = { x: number; y: number; w: number; h: number; r: number };
type Side = 'down' | 'up' | 'left';
const SIDE_CODE: Record<Side, number> = { down: 1, up: 2, left: 3 };

/**
 * Just after posting, the tour does not start on its own for this long: a
 * new player who posts before it has appeared is taken to Home to see their
 * post go up, and a dim arriving the moment they come back would bury that.
 */
const AFTER_POST_MS = 30_000;
/** Started on its own this launch, per account, in case storage is slow to say so. */
const startedThisLaunch = new Set<string>();
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * When the tour starts, and when it ends without being asked to.
 *
 * On its own it starts only for a new account, set up, fully loaded, on the
 * start page (see startTab) showing the map, with nothing in the way, on the
 * phone layout, the first time on this device. Asked for (Settings, Help, ?tour=N) it
 * skips the "new" and "seen" checks, on either layout.
 */
function useTourStarter(eligible: boolean) {
  const { currentUserId, currentUser, onboardingComplete, remoteLoaded } = useApp();
  const pathname = usePathname();
  const onStart = isStartTab(pathname);
  // On its own it begins only over the map (Find Players): someone who has
  // moved on to the threads is never pulled back to it. When they come back
  // to the map, it tries again.
  const shownStart = useShownSection(START_TAB);
  const request = useTourRequest();
  // Asked for, it goes ahead wherever Community is, and puts the map under itself (below).
  const mapReady = !!request?.force || (shownStart ?? START_SECTION) === START_SECTION;
  // The splash curtain lifts off the start page before anything here is measured.
  const curtainDown = useCurtainDown();
  const { isPhone } = useResponsive();
  const run = useTour();
  const joinedAt = currentUser?.joinedAt;
  // Before the account has come down, the stand-in profile says "joined just now"; it is not trusted until then.
  const accountReady = !!currentUserId && onboardingComplete && (remoteLoaded || !isSupabaseConfigured);
  const startedFor = useRef<string | null>(null);
  // A post or Instant still going up: the tour waits until it has landed.
  const posting = useAnyUploading();

  useEffect(() => {
    if (run.open || !accountReady || !eligible || !onStart || !curtainDown || !currentUserId) return;
    const forced = !!request?.force;
    if (!forced) {
      if (posting) return;
      // A computer's sidebar is labelled row by row; there it only runs when asked for.
      if (!isPhone) return;
      // Switched off for now: it plays only when asked for (Settings, Help).
      if (!TOUR_ON) return;
      if (startedThisLaunch.has(currentUserId)) return;
      if (!request?.pretendNew && !isNewAccount(joinedAt)) return;
      if (!mapReady) return;
    }
    let cancelled = false;
    // The tour is on its way: the feed's own swipe hint holds back meanwhile.
    setTourPending(true);
    void (async () => {
      // Anything that changes during this wait (left Community or its map, a gate came up) cancels it and starts it again.
      const seen = !forced && (await hasSeenTour(currentUserId));
      if (cancelled) return;
      if (seen) { setTourPending(false); return; }
      // Posted a moment ago (and landed): the post gets its moment first.
      if (!forced) await wait(Math.max(0, AFTER_POST_MS - sinceLastPost()));
      if (cancelled) return;
      await wait(SETTLE_MS);
      if (cancelled) return;
      // The bar at full size, labels showing, before any of it is measured.
      setBarCompact(false);
      // The first tip is about the map. Asked for (a replay), Find Players,
      // from its top, is put under it, wherever Community was left. Started
      // on its own, it is already on the map (above) and stays where it is.
      if (forced) {
        requestSection(START_TAB, START_SECTION);
        requestScrollToTop(START_TAB);
      }
      await wait(BAR_SETTLE_MS);
      if (cancelled) return;
      const layout: Layout = isPhone ? 'phone' : 'wide';
      const found = await Promise.all(TOUR_STEPS.map(async (s) => {
        const target = s.target[layout];
        return target ? !!(await measureTourTarget(target.id)) : true;
      }));
      if (cancelled) return;
      // A tip whose button isn't on screen is left out, and the dots count only the tips shown.
      const keys = TOUR_STEPS.filter((_, i) => found[i]).map((s) => s.key);
      const lit = TOUR_STEPS.filter((s, i) => found[i] && s.target[layout]).length;
      // Too little of the bar to point at: try another time, and don't count this one as seen.
      if (lit < 2) { setTourPending(false); return; }
      // Any tour this launch, asked for or not, means it won't also start on its own straight after.
      startedThisLaunch.add(currentUserId);
      // ?tour=N writes nothing; a start on its own, or a replay from Settings or Help, counts as seen.
      if (!forced || request?.markSeen) void markTourSeen(currentUserId);
      const wanted = TOUR_STEPS.slice(request?.startAt ?? 0).find((s) => keys.includes(s.key));
      startedFor.current = currentUserId;
      setTourPending(false);
      openTour(keys, wanted ? keys.indexOf(wanted.key) : 0, forced);
    })();
    return () => { cancelled = true; setTourPending(false); };
  }, [run.open, accountReady, eligible, onStart, mapReady, curtainDown, currentUserId, isPhone, request, joinedAt, posting]);

  // Leaving the start page (a tapped alert opening a chat), a gate coming up,
  // or a different account: the tour just goes. It already counts as seen.
  useEffect(() => {
    if (!run.open) return;
    if (!eligible || !onStart || currentUserId !== startedFor.current) endTourQuietly();
  }, [run.open, eligible, onStart, currentUserId]);
}

export function TourOverlay({ eligible }: { eligible: boolean }) {
  // Signed out mid-tour (or from another tab): the shell takes this away at
  // once, so the tour is closed here too, or the sign-in page would stay
  // hidden from screen readers and the keyboard would stay with the tour.
  useEffect(() => () => endTourQuietly(), []);
  useTourStarter(eligible);
  const run = useTour();
  // The last run on screen, kept for the moment it takes to fade out.
  const [drawn, setDrawn] = useState<TourRun | null>(null);
  useEffect(() => { if (run.open) setDrawn(run); }, [run]);
  const openRef = useRef(run.open);
  openRef.current = run.open;
  const shown = run.open ? run : drawn;
  if (!shown) return null;
  return <TourLayer key={shown.run} run={shown} open={run.open && run.run === shown.run} onGone={() => { if (!openRef.current) setDrawn(null); }} />;
}

/** Whether VoiceOver or TalkBack is on. A browser can't say (react-native-web always answers yes), so there it is taken as off. */
function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AccessibilityInfo.isScreenReaderEnabled().then(setOn).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => sub.remove();
  }, []);
  return on;
}

/** The lit window around a target: round-ended around a tab, a circle around the +, a soft box around a sidebar row. */
function holeFor(r: TourRect, shape: HoleShape, W: number): Hole {
  if (shape === 'circle') {
    const side = Math.max(r.width, r.height) + 20;
    return { x: r.x + r.width / 2 - side / 2, y: r.y + r.height / 2 - side / 2, w: side, h: side, r: side / 2 };
  }
  if (shape === 'pill') {
    // On a narrow phone the tabs sit close to the +, so the window hugs a tab's sides there rather than biting the +.
    const side = W < 370 ? 3 : 8;
    const pad = 8;
    // And it stays inside the bar's glass, rather than poking past its round ends.
    const left = Math.max(BAR_SIDE, r.x - side);
    const right = Math.min(W - BAR_SIDE, r.x + r.width + side);
    const h = r.height + pad * 2;
    return { x: left, y: r.y - pad, w: right - left, h, r: h / 2 };
  }
  const pad = 4;
  return { x: r.x - pad, y: r.y - pad, w: r.width + pad * 2, h: r.height + pad * 2, r: radius.md + pad };
}

/** On a tip with no window, it waits as a pinhole (hidden under its own soft edge) where the next one will open. */
function pinhole(x: number, y: number): Hole {
  return { x: x - 1, y: y - 1, w: 2, h: 2, r: 1 };
}

function parkingFor(steps: TourStep[], at: number, layout: Layout): TourTargetId | null {
  for (let i = at + 1; i < steps.length; i += 1) { const t = steps[i].target[layout]; if (t) return t.id; }
  for (let i = at - 1; i >= 0; i -= 1) { const t = steps[i].target[layout]; if (t) return t.id; }
  return null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Placement { x: number; y: number; side: Side | null; ptr: number }

/**
 * Where the card goes: above the window on a phone (below it if there's no
 * room), to its right in the sidebar layout. With no window it sits centred,
 * its top edge halfway down the screen.
 */
function placeCard(o: { hole: Hole | null; W: number; H: number; cardW: number; cardH: number; top: number; bottom: number; left: number; wide: boolean }): Placement {
  const { hole, W, H, cardW, cardH } = o;
  if (!hole) {
    const x = o.left + (W - o.left - cardW) / 2;
    // Room under it for "Tap anywhere to continue".
    const y = Math.max(o.top + M, Math.min(H * 0.5, H - o.bottom - M - cardH - 40));
    return { x, y, side: null, ptr: cardW / 2 };
  }
  const hx = hole.x + hole.w / 2;
  const hy = hole.y + hole.h / 2;
  const x = clamp(hx - cardW / 2, M, W - M - cardW);
  const ptr = clamp(hx - x, 24, cardW - 24);
  const order: ('above' | 'below' | 'right')[] = o.wide ? ['right', 'above', 'below'] : ['above', 'below'];
  for (const where of order) {
    if (where === 'above') {
      const y = hole.y - GAP - cardH;
      // Clear of the Skip button.
      if (y >= o.top + 52) return { x, y, side: 'down', ptr };
    } else if (where === 'below') {
      const y = hole.y + hole.h + GAP;
      if (y + cardH <= H - o.bottom - M) return { x, y, side: 'up', ptr };
    } else {
      const rx = hole.x + hole.w + GAP;
      if (rx + cardW <= W - M) {
        const y = clamp(hy - cardH / 2, o.top + M, H - M - cardH);
        return { x: rx, y, side: 'left', ptr: clamp(hy - y, 24, cardH - 24) };
      }
    }
  }
  return { x, y: Math.max(o.top + 52, hole.y - GAP - cardH), side: 'down', ptr };
}

type Sizes = Partial<Record<TourStep['key'], { words?: number; foot?: number }>>;

function TourLayer({ run, open, onGone }: { run: TourRun; open: boolean; onGone: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { isPhone, isCompactSidebar } = useResponsive();
  const reduce = useReducedMotion();
  const reader = useScreenReader();
  const layout: Layout = isPhone ? 'phone' : 'wide';
  const dark = pageIsDark();
  // The same black everywhere; a dark page needs a little more of it to read as dimmed at all.
  const dimAlpha = dark ? 0.7 : 0.6;

  const steps = useMemo(() => run.keys.map((k) => TOUR_STEPS.find((s) => s.key === k)).filter((s): s is TourStep => !!s), [run.keys]);
  const wordsFor = (s: TourStep) => (reader && s.screenReader) || s[layout];
  const step = steps[run.step] ?? steps[0];
  const last = run.step >= run.total - 1;
  const spot = step.target[layout];
  const parkId = spot ? null : parkingFor(steps, run.step, layout);

  /* ---- Where the targets are ---- */
  // Seeded with the measurements taken just before the tour opened, so the first tip can draw at once.
  const [rects, setRects] = useState<Partial<Record<TourTargetId, TourRect | null>>>(() => {
    const seed: Partial<Record<TourTargetId, TourRect | null>> = {};
    for (const s of steps) { const t = s.target[layout]; const r = t ? lastTourRect(t.id) : null; if (t && r) seed[t.id] = r; }
    return seed;
  });
  const [tick, setTick] = useState(0);
  const rootRef = useRef<View>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const noteOrigin = () => rootRef.current?.measureInWindow((x, y) => setOrigin((o) => (o.x === x && o.y === y ? o : { x, y })));
  // In a browser, nothing on the page under the dim keeps the keyboard: it is hidden from screen readers while the tour is up.
  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = rootRef.current as unknown as HTMLElement | null;
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && !root?.contains(active)) active.blur?.();
  }, []);

  // Measured again on every tip, a window resize, and coming back to the app.
  // A target that won't answer is tried every 100ms for 600ms; after that the
  // tip shows centred with no window, rather than pointing at the wrong place.
  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const measure = (id: TourTargetId, tries: number) => {
      void measureTourTarget(id).then((r) => {
        if (!alive) return;
        if (r) {
          setRects((m) => {
            const was = m[id];
            return was && was.x === r.x && was.y === r.y && was.width === r.width && was.height === r.height ? m : { ...m, [id]: r };
          });
          return;
        }
        if (tries < 6) timers.push(setTimeout(() => measure(id, tries + 1), 100));
        else setRects((m) => (m[id] === null ? m : { ...m, [id]: null }));
      });
    };
    if (spot) measure(spot.id, 0);
    if (parkId) measure(parkId, 6);
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, [spot?.id, parkId, W, H, tick, layout]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setTick((n) => n + 1); });
    return () => sub.remove();
  }, []);

  const local = (r: TourRect): TourRect => ({ x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height });
  const spotRect = spot ? rects[spot.id] : null;
  const lit = !!(spot && spotRect);
  let hole: Hole;
  if (spot && spotRect) hole = holeFor(local(spotRect), spot.shape, W);
  else {
    const park = parkId ? rects[parkId] : null;
    const at = park ? local(park) : { x: W / 2, y: H / 2, width: 0, height: 0 };
    hole = pinhole(at.x + at.width / 2, at.y + at.height / 2);
  }
  const measured = !spot || spotRect !== undefined;

  /* ---- The card's size, from a hidden copy of every tip's words ---- */
  const cardW = layout === 'phone' ? Math.min(280, W - M * 2) : 300;
  const innerW = cardW - 2 - PAD * 2;
  const [sizes, setSizes] = useState<Sizes>({});
  const noteSize = (key: TourStep['key'], part: 'words' | 'foot', h: number) =>
    setSizes((s) => (s[key]?.[part] === h ? s : { ...s, [key]: { ...s[key], [part]: h } }));
  const size = sizes[step.key];
  const cardH = size?.words != null && size.foot != null ? 2 + PAD + size.words + FOOT_GAP + size.foot + PAD : null;
  const ready = measured && cardH != null;
  const sidebarW = layout === 'wide' ? (isCompactSidebar ? LAYOUT.sidebarCompact : LAYOUT.sidebar) : 0;
  const place = placeCard({ hole: lit ? hole : null, W, H, cardW, cardH: cardH ?? 160, top: insets.top, bottom: insets.bottom, left: sidebarW, wide: layout === 'wide' });

  /* ---- Motion ---- */
  const hx = useSharedValue(hole.x);
  const hy = useSharedValue(hole.y);
  const hw = useSharedValue(hole.w);
  const hh = useSharedValue(hole.h);
  const hr = useSharedValue(hole.r);
  const cx = useSharedValue(place.x);
  const cy = useSharedValue(place.y);
  const ch = useSharedValue(cardH ?? 0);
  const pOff = useSharedValue(place.ptr);
  const pOp = useSharedValue(0);
  const sideSV = useSharedValue(0);
  const rowSV = useSharedValue(0);
  const riseSV = useSharedValue(reduce ? 0 : 8);
  const dimIn = useSharedValue(0);
  const cardIn = useSharedValue(0);
  const out = useSharedValue(1);
  const drop = useSharedValue(0);
  const fade = useSharedValue(1);
  const pulse = useSharedValue(0);
  const pulseOn = useSharedValue(0);
  useEffect(() => { riseSV.value = reduce ? 0 : 8; }, [reduce, riseSV]);

  // The window, the card and its pointer move together; the first placing is a jump, every one after a glide.
  const placed = useRef(false);
  useEffect(() => {
    if (!ready || cardH == null) return;
    const glide = placed.current && !reduce ? GLIDE : 0;
    const go = (v: SharedValue<number>, to: number) => { v.value = glide ? withTiming(to, { duration: glide, easing: EASE, reduceMotion: NEVER }) : to; };
    go(hx, hole.x); go(hy, hole.y); go(hw, hole.w); go(hh, hole.h); go(hr, hole.r);
    go(cx, place.x); go(cy, place.y); go(ch, cardH); go(pOff, place.ptr);
    rowSV.value = spot?.shape === 'row' ? 1 : 0;
    const code = place.side ? SIDE_CODE[place.side] : 0;
    if (code !== sideSV.value) pOp.value = 0;
    sideSV.value = code;
    pOp.value = code
      ? (glide ? withDelay(glide / 2, withTiming(1, { duration: 180, reduceMotion: NEVER })) : 1)
      : 0;
    placed.current = true;
  }, [ready, hole.x, hole.y, hole.w, hole.h, hole.r, place.x, place.y, place.ptr, place.side, cardH, reduce, spot?.shape]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving: the dim fades up, then the card rises into place just behind it.
  const landedAt = useRef(0);
  const entered = useRef(false);
  useEffect(() => {
    if (!ready || entered.current) return;
    entered.current = true;
    landedAt.current = Date.now();
    dimIn.value = withTiming(1, { duration: reduce ? 160 : 280, easing: EASE, reduceMotion: NEVER });
    cardIn.value = withDelay(80, withTiming(1, { duration: reduce ? 160 : 320, easing: EASE, reduceMotion: NEVER }));
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { landedAt.current = Date.now(); }, [run.step]);

  // The words change in the card's own little fade: out, swap, in. The card's height glides meanwhile.
  const [shownStep, setShownStep] = useState(run.step);
  useEffect(() => {
    if (run.step === shownStep) return;
    const to = run.step;
    fade.value = withTiming(0, { duration: reduce ? 60 : 100, reduceMotion: NEVER }, (done) => { if (done) runOnJS(setShownStep)(to); });
  }, [run.step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fade.value = withTiming(1, { duration: reduce ? 100 : 200, reduceMotion: NEVER });
  }, [shownStep]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = steps[shownStep] ?? step;
  const shownWords = wordsFor(shown);
  const shownLast = shownStep >= run.total - 1;

  // A soft ring leaves the lit window every 1.8s, the live dot's rhythm, once the window has arrived.
  useEffect(() => {
    cancelAnimation(pulse);
    cancelAnimation(pulseOn);
    pulse.value = 0;
    pulseOn.value = 0;
    if (!ready || !lit || reduce) return;
    pulseOn.value = withDelay(GLIDE + 500, withTiming(1, { duration: 0, reduceMotion: NEVER }));
    pulse.value = withDelay(GLIDE + 500, withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic), reduceMotion: NEVER }), -1, false));
  }, [run.step, lit, ready, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving: everything fades while the card settles a few points, then the overlay goes.
  useEffect(() => {
    if (open) return;
    const ms = reduce ? 160 : 220;
    cancelAnimation(pulse);
    out.value = withTiming(0, { duration: ms, easing: Easing.in(Easing.cubic), reduceMotion: NEVER }, (done) => { if (done) runOnJS(onGone)(); });
    if (!reduce) drop.value = withTiming(4, { duration: ms, easing: Easing.in(Easing.cubic), reduceMotion: NEVER });
    // A browser tab in the background holds animations; this makes sure the overlay still goes.
    const safety = setTimeout(onGone, ms + 400);
    // On a computer, the keyboard goes back to the page.
    if (Platform.OS === 'web' && typeof document !== 'undefined') (document.activeElement as HTMLElement | null)?.blur?.();
    return () => clearTimeout(safety);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Moving on ---- */
  const tryNext = () => {
    if (!open) return;
    if (!reader && Date.now() - landedAt.current < DWELL) return;
    nextStep();
  };
  const skip = () => { if (open) skipTour(); };
  // Listeners set up once read the latest of these.
  const act = useRef({ next: tryNext, skip });
  act.current = { next: tryNext, skip };

  // Android's Back button skips.
  useEffect(() => {
    if (!open || Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { act.current.skip(); return true; });
    return () => sub.remove();
  }, [open]);

  // A keyboard on a computer: Escape skips; Enter, Space and → go on; ← does
  // nothing; Tab moves between Skip and Next only. Listening ahead of
  // everything else keeps the page underneath from hearing any of it.
  const skipRef = useRef<View>(null);
  const nextRef = useRef<View>(null);
  const cardRef = useRef<View>(null);
  const titleRef = useRef<Text>(null);
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const dom = (r: React.RefObject<View | null>) => r.current as unknown as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as Node | null;
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === 'Escape') { stop(); act.current.skip(); return; }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar' || e.key === 'ArrowRight') {
        stop();
        if (e.repeat) return;
        const onSkip = !!target && !!dom(skipRef)?.contains(target);
        if (onSkip) act.current.skip(); else act.current.next();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { stop(); return; }
      if (e.key === 'Tab') {
        stop();
        const nextHost = dom(nextRef);
        const nextEl = nextHost?.matches?.('[tabindex]') ? nextHost : (nextHost?.querySelector?.('[tabindex]') as HTMLElement | null);
        const list = [dom(skipRef), nextEl].filter((n): n is HTMLElement => !!n);
        if (!list.length) return;
        const at = list.findIndex((n) => n === document.activeElement || n.contains(document.activeElement));
        const to = at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + list.length) % list.length;
        list[to].focus();
      }
    };
    // A trackpad or wheel scroll is a computer's swipe: one deliberate scroll moves on once.
    let travelled = 0;
    let used = false;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      if (quiet) clearTimeout(quiet);
      quiet = setTimeout(() => { travelled = 0; used = false; }, 250);
      if (used) return;
      travelled += Math.abs(e.deltaY) + Math.abs(e.deltaX);
      if (travelled > 40) { used = true; act.current.next(); }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: true });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', onWheel, { capture: true });
      if (quiet) clearTimeout(quiet);
    };
  }, [open]);

  // Each tip, once its words are in: a screen reader goes to the title; in a browser the card takes the focus.
  useEffect(() => {
    if (!ready || !open) return;
    const t = setTimeout(() => {
      if (Platform.OS === 'web') (cardRef.current as unknown as HTMLElement | null)?.focus?.({ preventScroll: true });
      else if (reader && titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current as unknown as Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0], 'focus');
    }, 150);
    return () => clearTimeout(t);
  }, [shownStep, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Drawing ---- */
  const dimStyle = useAnimatedStyle(() => ({ opacity: dimIn.value * out.value }));
  const holeStyle = useAnimatedStyle(() => ({ left: hx.value, top: hy.value, width: hw.value, height: hh.value, borderRadius: hr.value }));
  // On a dark page the lit glass is dark too, so the ring starts brighter to be seen at all.
  const ringPeak = dark ? 0.8 : 0.6;
  const ringStyle = useAnimatedStyle(() => {
    const p = pulse.value;
    // A tab or the + grows by a tenth; a long sidebar row by the same few points all round instead.
    const sx = rowSV.value ? 1 + (12 * p) / Math.max(1, hw.value) : 1 + 0.12 * p;
    const sy = rowSV.value ? 1 + (12 * p) / Math.max(1, hh.value) : 1 + 0.12 * p;
    return {
      left: hx.value, top: hy.value, width: hw.value, height: hh.value, borderRadius: hr.value,
      opacity: pulseOn.value * ringPeak * (1 - p), transform: [{ scaleX: sx }, { scaleY: sy }],
    };
  });
  const cardStyle = useAnimatedStyle(() => ({
    left: cx.value, top: cy.value, opacity: cardIn.value * out.value,
    transform: [{ translateY: (1 - cardIn.value) * riseSV.value + drop.value }],
  }));
  const boxStyle = useAnimatedStyle(() => ({ height: ch.value }));
  // The pointer is drawn through a small window that starts on the card's
  // own edge line, so only the part outside the card shows (and the bit of
  // edge it replaces); inside, the card's own surface carries on untouched.
  const pointerStyle = useAnimatedStyle(() => {
    const s = sideSV.value;
    return {
      left: s === 3 ? -9 : pOff.value - 10,
      top: s === 1 ? ch.value - 1 : s === 2 ? -9 : pOff.value - 10,
      width: s === 3 ? 10 : 20,
      height: s === 3 ? 20 : 10,
      opacity: s ? pOp.value : 0,
    };
  });
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const hintStyle = useAnimatedStyle(() => ({ top: ch.value + 12, opacity: fade.value }));
  const skipStyle = useAnimatedStyle(() => ({ opacity: dimIn.value * out.value }));

  // The dim is the window's own shadow, spread past every edge of the screen.
  // The inner shadow softens the window's edge by a few points, so it reads as light, not a cut-out.
  const reach = Math.ceil(Math.hypot(W, H));
  const shade = `0px 0px 0px ${reach}px rgba(0, 0, 0, ${dimAlpha}), inset 0px 0px 10px 2px rgba(0, 0, 0, ${dimAlpha})`;
  // Where there is no outer shadow (old Android): the window's frame is a border as wide as the screen, in the dim.
  const frameStyle = useAnimatedStyle(() => ({
    left: hx.value - reach, top: hy.value - reach, width: hw.value + reach * 2, height: hh.value + reach * 2, borderRadius: hr.value + reach,
  }));
  // On a dark page the lit glass is nearly as dark as the dim, so the window gets a faint light rim to be found by.
  const rim = dark ? styles.holeRim : null;
  const edge = dark ? colors.borderStrong : colors.border;
  const pointerSides = place.side === 'down' ? styles.pointerDown : place.side === 'up' ? styles.pointerUp : styles.pointerLeft;
  // The first tip, the one with no window, carries the swipe demo and the "tap anywhere" line.
  const mapShown = shown.key === 'map';
  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, 'aria-hidden': true };
  const webDialog = Platform.OS === 'web' ? { role: 'dialog' as const, 'aria-modal': true, 'aria-labelledby': TITLE_ID } : {};
  const webFocus = Platform.OS === 'web' ? { tabIndex: -1 as const } : {};

  return (
    <View
      ref={rootRef}
      onLayout={noteOrigin}
      // Fading out, it lets touches through: the first tap after the tour is the player's.
      style={[styles.root, { pointerEvents: open ? 'auto' : 'none' }]}
      // The whole screen is one quiet catch-all: any touch that ends moves on.
      // It is not a button, so a screen reader never lands on the dim itself.
      // It only asks for touches as they start: asking mid-move as well would
      // take a slightly moving finger off Skip, and Skip would mean Next.
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderRelease={() => act.current.next()}
      accessibilityViewIsModal
      onAccessibilityEscape={() => act.current.skip()}
      onMagicTap={() => act.current.next()}
      {...webDialog}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, dimStyle]}>
        {NO_SHADOW_DIM
          ? <Animated.View style={[styles.hole, { borderWidth: reach, borderColor: `rgba(0, 0, 0, ${dimAlpha})` }, frameStyle]} />
          : <Animated.View style={[styles.hole, { boxShadow: shade }, rim, holeStyle]} />}
        <Animated.View style={[styles.ring, ringStyle]} />
      </Animated.View>

      <Animated.View style={[styles.cardWrap, { width: cardW }, cardStyle]}>
        {mapShown ? (
          <>
            {/* A thumb's swipe means nothing to a mouse, so a computer gets the words alone. */}
            {layout === 'phone' ? <SwipeDemo reduce={reduce} cardW={cardW} fade={fade} hidden={hidden} /> : null}
            <Animated.Text {...hidden} selectable={false} style={[styles.tapHint, hintStyle]}>
              {layout === 'wide' ? 'Click anywhere to continue' : 'Tap anywhere to continue'}
            </Animated.Text>
          </>
        ) : null}
        <Animated.View style={[styles.card, { borderColor: edge }, boxStyle]}>
          <View ref={cardRef} style={[StyleSheet.absoluteFill, styles.focusRing]} {...webFocus}>
            <Animated.View style={[styles.words, fadeStyle]}>
              <Text
                ref={titleRef}
                nativeID={TITLE_ID}
                selectable={false}
                accessibilityRole="header"
                accessibilityLabel={`Tip ${shownStep + 1} of ${run.total}. ${shownWords.title}.`}
                style={styles.title}
              >
                {shownWords.title}
              </Text>
              <Text selectable={false} style={styles.body}>{shownWords.body}</Text>
            </Animated.View>
            <View style={[styles.footerRow, styles.footer]}>
              <Dots total={run.total} at={run.step} styles={styles} hidden={hidden} />
              <Animated.View ref={nextRef} style={fadeStyle}>
                {shownLast ? (
                  <Button label={LAST_BUTTON} onPress={() => act.current.next()} style={styles.pill} />
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel="Next tip" onPress={() => act.current.next()} style={styles.next}>
                    <Text selectable={false} style={styles.nextText}>Next</Text>
                  </Pressable>
                )}
              </Animated.View>
            </View>
          </View>
        </Animated.View>
        <Animated.View {...hidden} pointerEvents="none" style={[styles.pointerClip, pointerStyle]}>
          <View style={[styles.pointer, pointerSides, { borderColor: edge }]} />
        </Animated.View>
      </Animated.View>

      {!last ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={[styles.skipWrap, { top: insets.top + 8 }]}>
          <Animated.View style={skipStyle}>
            {/* Not handed over to the dim mid-press, so a finger that moves a little still skips. */}
            <Pressable ref={skipRef} cancelable={false} accessibilityRole="button" accessibilityLabel="Skip tutorial" onPress={skip} style={styles.skip}>
              <Text selectable={false} style={styles.skipText}>Skip</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      ) : null}

      {/* A hidden copy of every tip's words at the card's width, so the card knows each one's height before it shows it. */}
      <View pointerEvents="none" {...hidden} style={[styles.measurer, { width: innerW }]}>
        {steps.map((s, i) => (
          <View key={s.key} style={styles.measureOne}>
            <View onLayout={(e) => noteSize(s.key, 'words', e.nativeEvent.layout.height)}>
              <Text style={styles.title}>{wordsFor(s).title}</Text>
              <Text style={styles.body}>{wordsFor(s).body}</Text>
            </View>
            <View onLayout={(e) => noteSize(s.key, 'foot', e.nativeEvent.layout.height)} style={styles.footerRow}>
              <View style={styles.dots}><View style={styles.dotOn} /></View>
              {i === steps.length - 1 ? (
                <View style={[styles.pill, styles.pillShape]}><Text style={styles.pillShapeText}>{LAST_BUTTON}</Text></View>
              ) : (
                <View style={styles.next}><Text style={styles.nextText}>Next</Text></View>
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

type Hidden = { accessibilityElementsHidden: boolean; importantForAccessibility: 'no-hide-descendants'; 'aria-hidden': boolean };

/** Where you are in the tour: one dot per tip, the current one a short green pill. */
function Dots({ total, at, styles, hidden }: { total: number; at: number; styles: typeof styleDefinitions; hidden: Hidden }) {
  return (
    <View {...hidden} style={styles.dots}>
      {Array.from({ length: total }, (_, i) => <View key={i} style={i === at ? styles.dotOn : styles.dot} />)}
    </View>
  );
}

/**
 * On the first tip, a small ring slides leftward above the card the way a
 * thumb would to reach Discussions, three times, then a still arrow takes its
 * place and stays, so the tip never ends up with nothing above it. Under
 * Reduce Motion it is the still arrow from the start.
 */
function SwipeDemo({ reduce, cardW, fade, hidden }: { reduce: boolean; cardW: number; fade: SharedValue<number>; hidden: Hidden }) {
  const rise = useSharedValue(0);
  const seen = useSharedValue(0);
  const rest = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { rest.value = 1; return; }
    // Three slides of 1.5s each, after half a second: then the arrow fades in.
    rest.value = 0;
    rest.value = withDelay(500 + 3 * 1500, withTiming(1, { duration: 200, reduceMotion: NEVER }));
    // 900ms across, its last 200ms fading, then 600ms of rest: three times over.
    rise.value = withDelay(500, withRepeat(withSequence(
      withTiming(1, { duration: 900, easing: EASE, reduceMotion: NEVER }),
      withDelay(600, withTiming(0, { duration: 0, reduceMotion: NEVER })),
    ), 3, false));
    seen.value = withDelay(500, withRepeat(withSequence(
      withTiming(1, { duration: 120, reduceMotion: NEVER }),
      withDelay(580, withTiming(0, { duration: 200, reduceMotion: NEVER })),
      withDelay(600, withTiming(0, { duration: 0, reduceMotion: NEVER })),
    ), 3, false));
    return () => { cancelAnimation(rise); cancelAnimation(seen); cancelAnimation(rest); };
  }, [reduce, rise, seen, rest]);
  // From a little right of the middle to a little left of it, right to left, the way the finger goes.
  const ringStyle = useAnimatedStyle(() => ({ opacity: seen.value * fade.value, transform: [{ translateX: SLIDE / 2 - SLIDE * rise.value }] }));
  const stillStyle = useAnimatedStyle(() => ({ opacity: rest.value * fade.value }));
  return (
    <>
      {reduce ? null : <Animated.View {...hidden} pointerEvents="none" style={[demo.ring, { left: (cardW - 26) / 2 }, ringStyle]} />}
      <Animated.View {...hidden} pointerEvents="none" style={[demo.still, { left: (cardW - 24) / 2 }, stillStyle]}>
        <Ionicons name="chevron-back" size={24} color="rgba(255, 255, 255, 0.9)" />
      </Animated.View>
    </>
  );
}

const demo = StyleSheet.create({
  // A faint fill makes it read as a fingertip, not an outline, over a busy page.
  // Both sit on one line just above the card, where the ring travels sideways.
  ring: { position: 'absolute', top: -46, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.9)', backgroundColor: 'rgba(255, 255, 255, 0.22)' },
  still: { position: 'absolute', top: -45, width: 24, height: 24 },
});

const styleDefinitions = StyleSheet.create({
  // Over the bar (30), the upload bar (40) and toasts (50); under the feed's splash curtain (60), never up by now.
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 55,
    // On Android the gesture library only stops at a view with a background; without one, swipes and
    // pinches on the dim reach the pagers and the page underneath. A fully clear one doesn't count.
    ...(Platform.OS === 'android' ? { backgroundColor: 'rgba(0, 0, 0, 0.01)' } : null),
  },
  hole: { position: 'absolute', backgroundColor: 'transparent' },
  holeRim: { borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)' },
  ring: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.7)' },
  cardWrap: { position: 'absolute' },
  // The app's own card, floating: so it takes the overlay shadow, not the page's.
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.18)',
  },
  // A browser's focus ring would draw round the whole card each time a tip lands.
  focusRing: { outlineStyle: 'solid', outlineWidth: 0 },
  words: { position: 'absolute', top: PAD, left: PAD, right: PAD },
  title: { ...typography.heading, color: colors.text, marginBottom: TITLE_GAP },
  body: { ...typography.body, lineHeight: 21, color: colors.textMuted },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { position: 'absolute', left: PAD, right: PAD, bottom: PAD },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
  dotOn: { width: 16, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  // A full 44-point tap area that takes no room: the padding reaches out, the negative margin gives the space back,
  // so the card keeps even air above and below its footer.
  next: { paddingVertical: 14, marginVertical: -14, paddingLeft: 16, paddingRight: 12, marginRight: -12, alignItems: 'flex-end', justifyContent: 'center' },
  nextText: { ...typography.smallStrong, color: colors.brand },
  // The primary pill, trimmed to sit in the card's footer.
  pill: { paddingVertical: 10, paddingHorizontal: 18 },
  pillShape: { borderWidth: 1, borderRadius: radius.pill },
  pillShapeText: { ...typography.bodyStrong },
  // A small square turned on its corner, edged on its two outer sides, so the card's outline runs on round it.
  // Its centre sits on the middle of the card's 1-point edge, so its tip lands about 6 points from the window.
  pointerClip: { position: 'absolute', overflow: 'hidden' },
  pointer: { position: 'absolute', width: 12, height: 12, backgroundColor: colors.surface, borderColor: colors.border, transform: [{ rotate: '45deg' }] },
  pointerDown: { left: 4, top: -5.5, borderRightWidth: 1, borderBottomWidth: 1 },
  pointerUp: { left: 4, top: 3.5, borderTopWidth: 1, borderLeftWidth: 1 },
  pointerLeft: { left: 3.5, top: 4, borderBottomWidth: 1, borderLeftWidth: 1 },
  tapHint: { position: 'absolute', left: 0, right: 0, textAlign: 'center', ...typography.small, color: 'rgba(255, 255, 255, 0.85)' },
  skipWrap: { position: 'absolute', right: 8 },
  skip: { minWidth: 44, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  skipText: { ...typography.bodyStrong, color: 'rgba(255, 255, 255, 0.92)' },
  measurer: { position: 'absolute', left: 0, top: 0, opacity: 0 },
  measureOne: { position: 'absolute', left: 0, right: 0, top: 0, gap: FOOT_GAP },
});
