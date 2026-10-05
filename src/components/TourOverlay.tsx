import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, BackHandler, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, ReduceMotion, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@/components/ui/Button';
import { useCurtainDown } from '@/features/feed/warmup';
import { setBarCompact } from '@/features/navigation/barShrink';
import { TAB_BAR_H } from '@/features/navigation/barInset';
import { isAtStop, slidePagesTo, type PageStop } from '@/features/navigation/pageSlide';
import { START_SECTION, START_TAB, isTabPage } from '@/features/navigation/startTab';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { isPageDragging, isPageScrolling } from '@/features/navigation/swipeLock';
import { LAST_BUTTON, TOUR_STEPS, tourPageAt, type HoleShape, type TourSpot, type TourStep, type TourTargetId } from '@/features/tour/steps';
import { useTourHeld } from '@/features/tour/tourHold';
import { useMapLead } from '@/features/tour/mapLead';
import { TOUR_ON, hasSeenTour, isNewAccount, markTourSeen } from '@/features/tour/tourSeen';
import {
  endTourQuietly, lastTourRect, measureTourTarget, nextStep, prevStep, openTour, setTourPending, skipTour, useTour, useTourRequest,
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
 * The first-run tutorial: the screen dims a little, a small card explains one
 * thing at a time, and a lit window in the dim glides along the bar to the
 * thing being explained. Next moves on; so does a tap on the dim (a swipe
 * never moves the pages against the finger; see touched).
 *
 * It begins on the page the app opens on (Community, on Find Players),
 * sliding there under the dim from whichever tab the player was on, and the
 * pages move along under its tips the way a swipe moves them (see each tip's
 * page in steps.ts): on to Discussions while it shows the swipe, then on to
 * the Feed and its +. On the first tip a second window lights the one thing
 * to do on the map page (the invite card, the friends card or "I'm free":
 * mapLead.ts), while the bar's Community button stays lit too. The card
 * steps aside while the pages turn and comes back once the page has landed,
 * pointing at it. The Feed's clips hold still under the dim while it is up
 * (app/(tabs)/index.tsx).
 *
 * Got it on the last tip, or Skip on any, and the pages glide back to the
 * map, at its top (useBackToStart).
 *
 * It lives in the shell, beside the bar, so the dim can sit over the bar and
 * light one of its buttons. There is no browser twin of this file: the
 * drawing is the same everywhere, and the few browser differences (keys,
 * focus, the dialog role) are checks on Platform below.
 */

/** The app's own ease: quick off the mark, a long soft landing. */
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
/** The pages' own ease when they turn (TabsPager, SectionPager, SwipeSurface), so the demo fingertip moves the way they do. */
const PAGE_EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
/** Our own Reduce Motion handling sets the timings below, so Reanimated is told not to second-guess it. */
const NEVER = ReduceMotion.Never;
/** How long the window and the card take to move from one tip to the next. */
const GLIDE = 360;
/** Between the card's pointer and the lit window: 8 for the pointer, 6 of air. */
const GAP = 14;
/** The screen margin a card never crosses. */
const M = 16;
/** How far the swipe tip's demo fingertip travels, right to left, above the card. */
const SLIDE = 72;
/** For this long after a tip lands, a tap does not move on, so a quick double tap can't skip one unread. */
const DWELL = 400;
/** The wait on a tab before the tour begins: the page gets a moment, and anything first-move opens wins. */
const SETTLE_MS = 1200;
/** A page turn, from asking for it to the page being drawn where it went (the browser's slide is 300ms). */
const SLIDE_MS = 450;
/** Arriving from another page: the dim is mostly up by now, and the pages slide to the first tip's page under it. */
const ARRIVE_DIM_MS = 220;
/** From the swipe tip's words appearing to the fingertip's stroke, and the pages' slide with it. */
const DEMO_LEAD = 350;
/** The fingertip's one stroke: as long as a page turn (240 to 300ms), so finger and page arrive together. */
const STROKE_MS = 300;
/** The swipe tip holds its taps until its slide has played (the words' swap, the lead, the stroke), so every player sees it once. */
const SWIPE_DWELL = 100 + DEMO_LEAD + STROKE_MS + 100;
/** Further than this sideways, a touch on the dim is a swipe, not a tap. */
const SIDEWAYS = 24;
/** The bar's own return to full size, before anything on it is measured. */
const BAR_SETTLE_MS = 260;
const PAD = 16;
const TITLE_GAP = 6;
const FOOT_GAP = 14;
const TITLE_ID = 'courtside-tour-title';
/** The phone bar's glass starts 14 points in from each side; a lit tab never spills past it. */
const BAR_SIDE = 15;
/**
 * How dark the dim is: light enough that the page reads clearly through it,
 * so the player sees where they are. A dark page needs a little more of the
 * same black to look dimmed at all, so both end up looking about as light.
 */
const DIM_LIGHT = 0.36;
const DIM_DARK = 0.5;
/**
 * The soft light just outside a lit window, so it still stands out from a
 * lighter dim. White shows more on a dark page, so there it is softer, with
 * a faint light rim to mark the window's edge as well.
 */
const GLOW_LIGHT = 0.55;
const GLOW_DARK = 0.32;
/** Room above the phone bar where the bar's part of the dim begins (see the two windows, below). */
const BAR_AIR = 18;
/**
 * Looking for a window on a page: from about when a page turn lands (they
 * take 260 to 300ms; two readings alike tell a page still sliding from one
 * at rest), this often, and for at most this long before the tip shows
 * without it. Kept short: meanwhile the card is out of the way and taps
 * wait, so a window that can't be found must never leave the screen dim
 * and unanswering for long. Found, it takes about 100 to 200ms of this.
 */
const PAGE_LOOK_MS = 300;
const PAGE_POLL_MS = 60;
const PAGE_WAIT_MAX = 800;
/** At the end, the tutorial fades first and the pages glide back once it has mostly gone, so the glide is seen. */
const LEAVE_MS = 200;
/** The card stepping aside while the pages turn under it, and coming back once the page has landed. */
const AWAY_MS = 140;
const BACK_MS = 260;
/**
 * Android 8 and older draw no outer shadow at all, so there the dim is drawn
 * as a very wide border round the window instead: the same dim, a crisp edge.
 */
const NO_SHADOW_DIM = Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version < 28;

type Layout = 'phone' | 'wide';
type Hole = { x: number; y: number; w: number; h: number; r: number };
/** A part of the screen with a window of its own (see the two windows, below). */
type Region = { left: number; top: number; width: number; height: number };
type Side = 'down' | 'up' | 'left';
const SIDE_CODE: Record<Side, number> = { down: 1, up: 2, left: 3 };

/**
 * Just after posting, the tour does not start on its own for this long: a
 * new player who posts before it has appeared is taken to the Feed to see
 * their post go up, and a dim arriving the moment it lands would bury that.
 */
const AFTER_POST_MS = 30_000;
/** Started on its own this launch, per account, in case storage is slow to say so. */
const startedThisLaunch = new Set<string>();
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** The longest the tour waits for a finger to lift, in case a drag never says it ended. */
const FINGER_WAIT_MAX = 15_000;

/**
 * In a browser, the fingers on the screen (and the mouse button) anywhere on
 * the page, watched while the tour might start. Touch events rather than
 * pointer events: a list the browser scrolls itself cancels the pointer
 * while the finger is still down, but not the touch.
 */
const pressing = { touches: 0, mouse: false };
function watchPresses(): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => undefined;
  const touch = (e: TouchEvent) => { pressing.touches = e.touches.length; };
  const down = () => { pressing.mouse = true; };
  const up = () => { pressing.mouse = false; };
  const away = () => { pressing.touches = 0; pressing.mouse = false; };
  const opts = { capture: true, passive: true };
  window.addEventListener('touchstart', touch, opts);
  window.addEventListener('touchend', touch, opts);
  window.addEventListener('touchcancel', touch, opts);
  window.addEventListener('mousedown', down, true);
  window.addEventListener('mouseup', up, true);
  window.addEventListener('blur', away);
  return () => {
    window.removeEventListener('touchstart', touch, opts);
    window.removeEventListener('touchend', touch, opts);
    window.removeEventListener('touchcancel', touch, opts);
    window.removeEventListener('mousedown', down, true);
    window.removeEventListener('mouseup', up, true);
    window.removeEventListener('blur', away);
    away();
  };
}

/** A finger still on the page: a sideways swipe, the Feed's clips mid-scroll, or in a browser any touch at all. */
const fingerDown = () => isPageDragging() || isPageScrolling() || pressing.touches > 0 || pressing.mouse;

/**
 * In a browser a tap is followed, a moment later, by a click aimed at
 * whatever is under the finger by then. When a tap on the dim ends the tour,
 * the dim has already let touches through, so that click would land on the
 * page underneath (a name on the Feed, opening a profile). It is caught here.
 */
function eatFollowUpClick() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const kinds = ['mousedown', 'mouseup', 'click'] as const;
  const eat = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
  kinds.forEach((k) => window.addEventListener(k, eat, true));
  setTimeout(() => kinds.forEach((k) => window.removeEventListener(k, eat, true)), 400);
}

/** When the tutorial last turned the pages: the turn back to the map waits for that one to land. */
let lastTurnAt = 0;

/** Turns the pages to a stop the way a swipe would; false when they are already there. */
function turnPages(from: string, to: PageStop): boolean {
  if (isAtStop(from, to)) return false;
  lastTurnAt = Date.now();
  slidePagesTo(from, to);
  return true;
}

/**
 * At the end (Got it, or Skip on any tip): the pages glide back to the map
 * the app opens on, from its top, so the player finishes where the app
 * starts. It waits for the tutorial to fade (LEAVE_MS), and for a turn still
 * landing, since a browser's page turn takes a moment to let go. Not when a
 * page has since opened over the tabs: that is where they went.
 */
function useBackToStart(run: TourRun, here: React.MutableRefObject<string>) {
  const wasOpen = useRef(run.open);
  useEffect(() => {
    const was = wasOpen.current;
    wasOpen.current = run.open;
    if (!was || run.open || (run.ended !== 'done' && run.ended !== 'skipped')) return undefined;
    const home: PageStop = { pathname: START_TAB, section: START_SECTION };
    // A player who taps another tab the moment it closes has gone where they
    // wanted: the glide doesn't drag them back. (A turn the tutorial itself
    // started may still be landing, and that changes the page on its own.)
    const closedOn = here.current;
    const turning = lastTurnAt + SLIDE_MS > Date.now();
    const timer = setTimeout(() => {
      const from = here.current;
      if (!isTabPage(from)) return;
      if (!turning && from !== closedOn) return;
      if (isAtStop(from, home)) { requestScrollToTop(START_TAB); return; }
      // Arriving from another tab it is out of sight, so it jumps to its top; on the threads it glides there.
      requestScrollToTop(START_TAB, from !== START_TAB);
      turnPages(from, home);
    }, Math.max(LEAVE_MS, lastTurnAt + SLIDE_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [run.open, run.ended]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * When the tour starts, and when it ends without being asked to.
 *
 * On its own it starts only for a new account, set up, fully loaded, on any
 * of the four tabs with nothing opened over them (a post, a profile, the
 * Create box, a menu, a photo full screen, an "are you sure?": it waits for
 * those to close), with no finger on the page, on the phone layout, the
 * first time on this device. Wherever the player is, the dim comes up first
 * and then the pages slide to the start page (see startTab), the map from
 * its top, so the move plainly belongs to the tutorial and the first tip
 * lines up with what is underneath (TourLayer). Asked for (Settings, Help,
 * ?tour=N) it skips the "new" and "seen" checks, on either layout.
 */
function useTourStarter(eligible: boolean) {
  const { currentUserId, currentUser, onboardingComplete, remoteLoaded } = useApp();
  const pathname = usePathname();
  const onTab = isTabPage(pathname);
  const request = useTourRequest();
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
  // A menu, a photo full screen or a question open over the tab: it waits for that to close (tourHold).
  const held = useTourHeld();
  useEffect(() => watchPresses(), []);

  useEffect(() => {
    if (run.open || !accountReady || !eligible || !onTab || held || !curtainDown || !currentUserId) return;
    const forced = !!request?.force;
    if (!forced) {
      if (posting) return;
      // A computer's sidebar is labelled row by row; there it only runs when asked for.
      if (!isPhone) return;
      // Switched off for now: it plays only when asked for (Settings, Help).
      if (!TOUR_ON) return;
      if (startedThisLaunch.has(currentUserId)) return;
      if (!request?.pretendNew && !isNewAccount(joinedAt)) return;
    }
    let cancelled = false;
    // The tour is on its way: the feed's own swipe hint holds back meanwhile.
    setTourPending(true);
    void (async () => {
      // Anything that changes during this wait (a page opened over the tabs, a gate came up) cancels it and starts it again.
      const seen = !forced && (await hasSeenTour(currentUserId));
      if (cancelled) return;
      if (seen) { setTourPending(false); return; }
      // Posted a moment ago (and landed): the post gets its moment first.
      if (!forced) await wait(Math.max(0, AFTER_POST_MS - sinceLastPost()));
      if (cancelled) return;
      await wait(SETTLE_MS);
      if (cancelled) return;
      // Never under a finger: the page is the player's until it lifts.
      for (let waited = 0; fingerDown() && waited < FINGER_WAIT_MAX; waited += 250) {
        await wait(250);
        if (cancelled) return;
      }
      // The bar at full size, labels showing, before any of it is measured.
      // The bar doesn't move with the pages, so it can be measured before they slide.
      setBarCompact(false);
      await wait(BAR_SETTLE_MS);
      if (cancelled) return;
      const layout: Layout = isPhone ? 'phone' : 'wide';
      const inLayout = TOUR_STEPS.filter((s) => s[layout] !== null);
      const found = await Promise.all(inLayout.map(async (s) => {
        const target = s.target[layout];
        return target ? !!(await measureTourTarget(target.id)) : true;
      }));
      if (cancelled) return;
      // A tip whose button isn't on screen is left out, and the dots count only the tips shown.
      const keys = inLayout.filter((_, i) => found[i]).map((s) => s.key);
      const lit = inLayout.filter((s, i) => found[i] && s.target[layout]).length;
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
  }, [run.open, accountReady, eligible, onTab, held, curtainDown, currentUserId, isPhone, request, joinedAt, posting]);

  // A page opened over the tabs (a tapped alert opening a chat), a gate
  // coming up, or a different account: the tour just goes. It already counts
  // as seen. Moving between the tabs is the tour's own doing, and fine.
  useEffect(() => {
    if (!run.open) return;
    if (!eligible || !onTab || currentUserId !== startedFor.current) endTourQuietly();
  }, [run.open, eligible, onTab, currentUserId]);
}

export function TourOverlay({ eligible }: { eligible: boolean }) {
  // Signed out mid-tour (or from another tab): the shell takes this away at
  // once, so the tour is closed here too, or the sign-in page would stay
  // hidden from screen readers and the keyboard would stay with the tour.
  useEffect(() => () => endTourQuietly(), []);
  useTourStarter(eligible);
  const run = useTour();
  const pathname = usePathname();
  const here = useRef(pathname);
  here.current = pathname;
  useBackToStart(run, here);
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

/** The lit window around a target: round-ended around a tab, a circle around the +, a soft box around a sidebar row, round-ended with air around something on a page. */
function holeFor(r: TourRect, shape: HoleShape, W: number): Hole {
  if (shape === 'round') {
    const pad = 6;
    const h = r.height + pad * 2;
    return { x: r.x - pad, y: r.y - pad, w: r.width + pad * 2, h, r: h / 2 };
  }
  if (shape === 'box') {
    const pad = 8;
    return { x: r.x - pad, y: r.y - pad, w: r.width + pad * 2, h: r.height + pad * 2, r: radius.lg + pad };
  }
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

/** A window closed down to a pinhole at its own middle, the way it opens and closes in place. */
const closedAt = (h: Hole): Hole => pinhole(h.x + h.w / 2, h.y + h.h / 2);

const sameRect = (a: TourRect, b: TourRect) =>
  Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

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
      if (y >= o.top + M) return { x, y, side: 'down', ptr };
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
  return { x, y: Math.max(o.top + M, hole.y - GAP - cardH), side: 'down', ptr };
}

type Sizes = Partial<Record<TourStep['key'], { words?: number; foot?: number }>>;

function TourLayer({ run, open, onGone }: { run: TourRun; open: boolean; onGone: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { isPhone, isCompactSidebar } = useResponsive();
  const reduce = useReducedMotion();
  const reader = useScreenReader();
  // What the map page leads with, for the first tip's words (mapLead.ts).
  const lead = useMapLead();
  const layout: Layout = isPhone ? 'phone' : 'wide';
  const dark = pageIsDark();
  const dimAlpha = dark ? DIM_DARK : DIM_LIGHT;
  const glowAlpha = dark ? GLOW_DARK : GLOW_LIGHT;

  // The tab page on show, read when the pages are about to move rather than when the move was planned.
  const pathname = usePathname();
  const here = useRef(pathname);
  here.current = pathname;

  const steps = useMemo(() => run.keys.map((k) => TOUR_STEPS.find((s) => s.key === k)).filter((s): s is TourStep => !!s), [run.keys]);
  // A tip left out of this layout never reaches here; the phone's words stand in for the types' sake.
  const wordsFor = (s: TourStep) => (reader && s.screenReader) || (lead ? s.byLead?.[lead] : undefined) || s[layout] || s.phone;
  const step = steps[run.step] ?? steps[0];
  const last = run.step >= run.total - 1;
  // The bar's window (a sidebar row on a computer), and the second window on the page itself.
  const spot = step.target[layout];
  const pageSpot: TourSpot | null = step.onPage?.[layout] ?? null;
  const parkId = spot ? null : parkingFor(steps, run.step, layout);

  /* ---- Where the bar's targets are ---- */
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
            return was && sameRect(was, r) ? m : { ...m, [id]: r };
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

  /* ---- Turning the pages underneath ---- */
  // When this run last turned the pages: a window on a page is looked for once that turn has landed.
  const [turnedAt, setTurnedAt] = useState(0);
  const turn = (to: PageStop) => { if (turnPages(here.current, to)) setTurnedAt(lastTurnAt); };
  // A tip with a window on its page starts that page from the top, so the
  // thing is where the tip says: at once when the page is out of sight, a
  // glide when it is the one on show.
  const toTop = (to: PageStop) => requestScrollToTop(to.pathname, here.current !== to.pathname);
  // Each later tip's page (steps.ts): on to it as soon as the tip is asked
  // for, by the same slide a swipe makes (the first tip's page is the
  // arrival's, below). The swipe tip moves the pages itself once its words
  // are up (see the words, below). The end's glide back to the map is
  // TourOverlay's (useBackToStart), which outlasts this layer.
  const pagesAt = useRef(run.step);
  useEffect(() => {
    if (!open || run.step === pagesAt.current) return;
    pagesAt.current = run.step;
    const page = tourPageAt(steps, run.step);
    if (!page) return;
    if (steps[run.step]?.onPage?.[layout]) toTop(page);
    turn(page);
  }, [open, run.step]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Where the window on a page is ---- */
  // Looked for once the pages have turned there and come to rest: two
  // readings alike, all of it on screen (a page mid-slide is neither). Never
  // taken from an earlier visit, which may have been scrolled. Not found in
  // time, the tip shows on the bar's window alone.
  const [pageRect, setPageRect] = useState<{ step: number; rect: TourRect | null } | null>(null);
  useEffect(() => {
    if (!pageSpot) return undefined;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const at = run.step;
    let since = 0;
    let prev: TourRect | null = null;
    const poll = () => {
      if (!since) since = Date.now();
      void measureTourTarget(pageSpot.id).then((r) => {
        if (!alive) return;
        const whole = r && r.x >= -1 && r.y >= -1 && r.x + r.width <= W + 1 && r.y + r.height <= H + 1 ? r : null;
        if (whole && prev && sameRect(whole, prev)) { setPageRect({ step: at, rect: whole }); return; }
        prev = whole;
        if (Date.now() - since > PAGE_WAIT_MAX) { setPageRect({ step: at, rect: null }); return; }
        timer = setTimeout(poll, PAGE_POLL_MS);
      });
    };
    timer = setTimeout(poll, Math.max(0, lastTurnAt + PAGE_LOOK_MS - Date.now()));
    return () => { alive = false; if (timer) clearTimeout(timer); };
    // Looked for again when the map page settles on what it leads with (its spots came down after the tip did).
  }, [run.step, pageSpot?.id, turnedAt, W, H, tick, lead]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- The two windows ---- */
  const local = (r: TourRect): TourRect => ({ x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height });
  const spotRect = spot ? rects[spot.id] : null;
  const barLit = !!(spot && spotRect);
  let barHole: Hole;
  if (spot && spotRect) barHole = holeFor(local(spotRect), spot.shape, W);
  else {
    const park = parkId ? rects[parkId] : null;
    const at = park ? local(park) : { x: W / 2, y: H / 2, width: 0, height: 0 };
    barHole = pinhole(at.x + at.width / 2, at.y + at.height / 2);
  }
  const barMeasured = !spot || spotRect !== undefined;
  const pageMeasured = !pageSpot || pageRect?.step === run.step;
  const pageFound = pageSpot && pageRect?.step === run.step ? pageRect.rect : null;
  const pageHole = pageSpot && pageFound ? holeFor(local(pageFound), pageSpot.shape, W) : null;
  // The card points at the page's window when there is one, else at the bar's.
  const mainHole = pageHole ?? (barLit ? barHole : null);
  const mainShape = pageHole ? pageSpot?.shape : spot?.shape;

  /* ---- The card's size, from a hidden copy of every tip's words ---- */
  const cardW = layout === 'phone' ? Math.min(280, W - M * 2) : 300;
  const innerW = cardW - 2 - PAD * 2;
  const [sizes, setSizes] = useState<Sizes>({});
  const noteSize = (key: TourStep['key'], part: 'words' | 'foot', h: number) =>
    setSizes((s) => (s[key]?.[part] === h ? s : { ...s, [key]: { ...s[key], [part]: h } }));
  const size = sizes[step.key];
  const cardH = size?.words != null && size.foot != null ? 2 + PAD + size.words + FOOT_GAP + size.foot + PAD : null;
  // The dim and the bar's window can come up (and the pages turn) once this much is known...
  const barReady = barMeasured && cardH != null;
  // ...and the card once its tip's window on the page has been looked for too.
  const ready = barReady && pageMeasured;
  // The pages are turning to a tip's window on a page: the card steps aside until it is found, and taps wait.
  const waiting = open && !pageMeasured;
  const sidebarW = layout === 'wide' ? (isCompactSidebar ? LAYOUT.sidebarCompact : LAYOUT.sidebar) : 0;
  const place = placeCard({ hole: mainHole, W, H, cardW, cardH: cardH ?? 160, top: insets.top, bottom: insets.bottom, left: sidebarW, wide: layout === 'wide' });

  // Each window has its own part of the screen, and each part dims all of
  // itself but its own window: the window's shadow, spread past the part's
  // edges and cut off there. The parts meet in one straight line at the same
  // dim, so the join can't be seen: just above the bar on a phone (the bar's
  // window always lives below it, the page's above), at the sidebar's edge
  // on a computer. One shadow can only leave one window, hence two parts.
  const split = layout === 'phone' ? Math.round(H - Math.max(insets.bottom, 12) - TAB_BAR_H - BAR_AIR) : Math.round(sidebarW);
  const pageRegion: Region = layout === 'phone'
    ? { left: 0, top: 0, width: W, height: Math.max(0, split) }
    : { left: split, top: 0, width: Math.max(0, W - split), height: H };
  const barRegion: Region = layout === 'phone'
    ? { left: 0, top: split, width: W, height: Math.max(0, H - split) }
    : { left: 0, top: 0, width: Math.max(0, split), height: H };

  /* ---- Motion ---- */
  // The bar's window.
  const bx = useSharedValue(barHole.x);
  const by = useSharedValue(barHole.y);
  const bw = useSharedValue(barHole.w);
  const bh = useSharedValue(barHole.h);
  const br = useSharedValue(barHole.r);
  const bLit = useSharedValue(0);
  // The page's window: a pinhole in the middle of the page until a tip has one.
  const firstPage = pinhole(pageRegion.left + pageRegion.width / 2, pageRegion.top + pageRegion.height / 2);
  const px = useSharedValue(firstPage.x);
  const py = useSharedValue(firstPage.y);
  const pw = useSharedValue(firstPage.w);
  const ph = useSharedValue(firstPage.h);
  const pr = useSharedValue(firstPage.r);
  const pLit = useSharedValue(0);
  // Where each part of the screen starts, so each window is drawn inside its own part.
  const pageLeft = useSharedValue(pageRegion.left);
  const pageTop = useSharedValue(pageRegion.top);
  const barLeft = useSharedValue(barRegion.left);
  const barTop = useSharedValue(barRegion.top);
  useEffect(() => {
    pageLeft.value = pageRegion.left; pageTop.value = pageRegion.top;
    barLeft.value = barRegion.left; barTop.value = barRegion.top;
  }, [pageRegion.left, pageRegion.top, barRegion.left, barRegion.top]); // eslint-disable-line react-hooks/exhaustive-deps
  const cx = useSharedValue(place.x);
  const cy = useSharedValue(place.y);
  const ch = useSharedValue(cardH ?? 0);
  const pOff = useSharedValue(place.ptr);
  const pOp = useSharedValue(0);
  const sideSV = useSharedValue(0);
  const rowSV = useSharedValue(0);
  // Which window the soft ring leaves: the page's (1) or the bar's (0).
  const ringOnPage = useSharedValue(0);
  const riseSV = useSharedValue(reduce ? 0 : 8);
  const dimIn = useSharedValue(0);
  const cardIn = useSharedValue(0);
  // 1 while the card has stepped aside for a page turn.
  const away = useSharedValue(0);
  const out = useSharedValue(1);
  const drop = useSharedValue(0);
  const fade = useSharedValue(1);
  const pulse = useSharedValue(0);
  const pulseOn = useSharedValue(0);
  useEffect(() => { riseSV.value = reduce ? 0 : 8; }, [reduce, riseSV]);
  const landedAt = useRef(0);

  // The bar's window moves as soon as it is measured: it glides along the
  // bar while the pages turn, the first placing a jump.
  const barPlaced = useRef(false);
  useEffect(() => {
    if (!barMeasured) return;
    const glide = barPlaced.current && !reduce ? GLIDE : 0;
    const go = (v: SharedValue<number>, to: number) => { v.value = glide ? withTiming(to, { duration: glide, easing: EASE, reduceMotion: NEVER }) : to; };
    go(bx, barHole.x); go(by, barHole.y); go(bw, barHole.w); go(bh, barHole.h); go(br, barHole.r);
    go(bLit, barLit ? 1 : 0);
    barPlaced.current = true;
  }, [barMeasured, barHole.x, barHole.y, barHole.w, barHole.h, barHole.r, barLit, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  // The card, its pointer and the page's window move together once the tip
  // is ready: a glide from the last tip, or, after stepping aside for a page
  // turn, straight to the new place while out of sight. The page's window
  // opens in place from a pinhole at its middle and closes the same way.
  const cardPlaced = useRef(false);
  const cardAway = useRef(false);
  const pageWas = useRef<Hole | null>(null);
  const closePageWindow = (ms: number) => {
    const was = pageWas.current;
    if (!was) return;
    const to = closedAt(was);
    const go = (v: SharedValue<number>, end: number) => { v.value = ms ? withTiming(end, { duration: ms, easing: EASE, reduceMotion: NEVER }) : end; };
    go(px, to.x); go(py, to.y); go(pw, to.w); go(ph, to.h); go(pr, to.r); go(pLit, 0);
    pageWas.current = null;
  };
  useEffect(() => {
    if (!ready || cardH == null) return;
    const glide = cardPlaced.current && !cardAway.current && !reduce ? GLIDE : 0;
    const go = (v: SharedValue<number>, to: number, ms = glide) => { v.value = ms ? withTiming(to, { duration: ms, easing: EASE, reduceMotion: NEVER }) : to; };
    go(cx, place.x); go(cy, place.y); go(ch, cardH); go(pOff, place.ptr);
    rowSV.value = mainShape === 'row' ? 1 : 0;
    ringOnPage.value = pageHole ? 1 : 0;
    const code = place.side ? SIDE_CODE[place.side] : 0;
    if (code !== sideSV.value) pOp.value = 0;
    sideSV.value = code;
    pOp.value = code
      ? (glide ? withDelay(glide / 2, withTiming(1, { duration: 180, reduceMotion: NEVER })) : 1)
      : 0;
    const opening = reduce ? 0 : GLIDE;
    if (pageHole) {
      const was = pageWas.current;
      if (was) {
        // Already open (a resize): on to its new place.
        go(px, pageHole.x, opening); go(py, pageHole.y, opening); go(pw, pageHole.w, opening); go(ph, pageHole.h, opening); go(pr, pageHole.r, opening);
      } else {
        const from = closedAt(pageHole);
        const grow = (v: SharedValue<number>, a: number, b: number) => {
          v.value = opening
            ? withSequence(withTiming(a, { duration: 0, reduceMotion: NEVER }), withTiming(b, { duration: opening, easing: EASE, reduceMotion: NEVER }))
            : b;
        };
        grow(px, from.x, pageHole.x); grow(py, from.y, pageHole.y); grow(pw, from.w, pageHole.w); grow(ph, from.h, pageHole.h); grow(pr, from.r, pageHole.r);
      }
      go(pLit, 1, opening);
      pageWas.current = pageHole;
    } else closePageWindow(opening);
    // Back from stepping aside: in at its new place, and taps count from here.
    if (cardAway.current) {
      cardAway.current = false;
      away.value = withTiming(0, { duration: reduce ? 100 : BACK_MS, easing: EASE, reduceMotion: NEVER });
      landedAt.current = Math.max(landedAt.current, Date.now());
    }
    cardPlaced.current = true;
  }, [ready, place.x, place.y, place.ptr, place.side, cardH, reduce, mainShape, pageHole?.x, pageHole?.y, pageHole?.w, pageHole?.h, pageHole?.r]); // eslint-disable-line react-hooks/exhaustive-deps

  // The pages are turning to a tip's window on a page: the card steps aside
  // and the last page's window closes, so nothing points at a page sliding by.
  useEffect(() => {
    if (!waiting || !cardPlaced.current || cardAway.current) return;
    cardAway.current = true;
    away.value = withTiming(1, { duration: reduce ? 80 : AWAY_MS, reduceMotion: NEVER });
    closePageWindow(reduce ? 0 : AWAY_MS + 60);
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving: the dim fades up first. When the first tip's page is somewhere
  // else (the player was on the Feed), the pages slide there under the dim,
  // so the move plainly belongs to the tutorial, not a stray swipe; then the
  // card rises. Already there, the card follows the dim straight away.
  const entered = useRef(false);
  // The card is up: the swipe tip's demo and slide wait for this.
  const [up, setUp] = useState(false);
  const arrival = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => arrival.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!barReady || entered.current) return;
    entered.current = true;
    const page = tourPageAt(steps, run.step);
    const moving = !!page && !isAtStop(here.current, page);
    landedAt.current = Date.now() + (moving ? ARRIVE_DIM_MS + SLIDE_MS : 80);
    dimIn.value = withTiming(1, { duration: reduce ? 160 : 280, easing: EASE, reduceMotion: NEVER });
    // The map from its top: at once when it is sliding in from another tab
    // (not yet in view), a glide when the player is already on it. A page
    // with a window on it (?tour=5, ?tour=6) the same way.
    const toStart = page?.pathname === START_TAB;
    const fromTop = toStart || !!pageSpot;
    if (page && moving) {
      arrival.current.push(setTimeout(() => {
        if (toStart) requestScrollToTop(START_TAB, here.current !== START_TAB);
        else if (fromTop) toTop(page);
        turn(page);
      }, ARRIVE_DIM_MS));
    } else if (page && fromTop) requestScrollToTop(page.pathname);
  }, [barReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // The card rises once its tip is ready, and not before the arrival's slide has landed.
  const risen = useRef(false);
  useEffect(() => {
    if (!ready || !entered.current || risen.current) return;
    risen.current = true;
    const after = Math.max(0, landedAt.current - Date.now());
    landedAt.current = Date.now() + after;
    cardIn.value = withDelay(after, withTiming(1, { duration: reduce ? 160 : 320, easing: EASE, reduceMotion: NEVER }));
    arrival.current.push(setTimeout(() => setUp(true), after));
  }, [ready, barReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // A later tip lands now; the first one when its card is up (above); one on another page when its card is back.
  useEffect(() => { landedAt.current = Math.max(landedAt.current, Date.now()); }, [run.step]);

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

  // The swipe tip moves the pages itself once its words are up, with the
  // fingertip's one stroke, so the finger and the page go together.
  useEffect(() => {
    const to = steps[shownStep]?.slidesTo;
    if (!open || !up || !to || shownStep !== run.step) return undefined;
    const timer = setTimeout(() => turn(to), DEMO_LEAD);
    return () => clearTimeout(timer);
  }, [open, up, shownStep, run.step]); // eslint-disable-line react-hooks/exhaustive-deps

  // A soft ring leaves the window the card points at every 1.8s, the live dot's rhythm, once the window has arrived.
  const mainLit = !!mainHole;
  useEffect(() => {
    cancelAnimation(pulse);
    cancelAnimation(pulseOn);
    pulse.value = 0;
    pulseOn.value = 0;
    if (!ready || !up || !mainLit || reduce) return;
    pulseOn.value = withDelay(GLIDE + 500, withTiming(1, { duration: 0, reduceMotion: NEVER }));
    pulse.value = withDelay(GLIDE + 500, withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic), reduceMotion: NEVER }), -1, false));
  }, [run.step, mainLit, ready, up, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Too soon after a tip landed for a touch to count (DWELL; longer on the
  // swipe tip, until its slide has played), and never while the card has
  // stepped aside for a page turn: a tap then would skip a tip unread.
  const settling = () => waiting || (!reader && Date.now() - landedAt.current < (step.slidesTo ? SWIPE_DWELL : DWELL));
  const tryNext = () => {
    if (!open || settling()) return false;
    nextStep();
    return true;
  };
  const skip = () => { if (open) skipTour(); };
  const tryBack = () => { if (!open || settling()) return; prevStep(); };
  // A touch on the dim, by how far it went. A tap, or a drag up or down,
  // moves on. Sideways, the pages never move against the finger: leftward
  // moves on (each tip's page lies to the right of the last, so the pages
  // go the finger's way); rightward does nothing. On the swipe tip a
  // sideways drag is the real thing: it moves the pages between the map and
  // the threads, the way the tip just said, and leftward from the threads
  // moves on to the Feed.
  const touched = (dx: number, dy: number) => {
    if (!open || settling()) return;
    const sideways = Math.abs(dx) > SIDEWAYS && Math.abs(dx) > Math.abs(dy);
    if (sideways && step.slidesTo && step.page) {
      const toward = dx < 0 ? step.slidesTo : step.page;
      if (!isAtStop(here.current, toward)) { turn(toward); return; }
      if (dx > 0) return;
    } else if (sideways && dx > 0) return;
    const ending = last;
    if (tryNext() && ending) eatFollowUpClick();
  };
  // Listeners set up once read the latest of these.
  const act = useRef({ next: tryNext, skip, touched });
  act.current = { next: tryNext, skip, touched };
  const touchFrom = useRef<{ x: number; y: number } | null>(null);

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
  // Each window is drawn inside its own part of the screen, so its place there is its place on the screen less where the part starts.
  const pageHoleStyle = useAnimatedStyle(() => ({ left: px.value - pageLeft.value, top: py.value - pageTop.value, width: pw.value, height: ph.value, borderRadius: pr.value }));
  const barHoleStyle = useAnimatedStyle(() => ({ left: bx.value - barLeft.value, top: by.value - barTop.value, width: bw.value, height: bh.value, borderRadius: br.value }));
  // The light round each window sits over both parts, so it is never cut at the join; it fades as its window closes.
  const pageGlowStyle = useAnimatedStyle(() => ({ left: px.value, top: py.value, width: pw.value, height: ph.value, borderRadius: pr.value, opacity: pLit.value }));
  const barGlowStyle = useAnimatedStyle(() => ({ left: bx.value, top: by.value, width: bw.value, height: bh.value, borderRadius: br.value, opacity: bLit.value }));
  // On a dark page the lit glass is dark too, so the ring starts brighter to be seen at all.
  const ringPeak = dark ? 0.8 : 0.7;
  const ringStyle = useAnimatedStyle(() => {
    const p = pulse.value;
    const onPage = ringOnPage.value === 1;
    const x = onPage ? px.value : bx.value;
    const y = onPage ? py.value : by.value;
    const w = onPage ? pw.value : bw.value;
    const h = onPage ? ph.value : bh.value;
    // A tab or the + grows by a tenth; a long sidebar row or a box on a page by the same few points all round instead.
    const even = rowSV.value || onPage;
    const sx = even ? 1 + (12 * p) / Math.max(1, w) : 1 + 0.12 * p;
    const sy = even ? 1 + (12 * p) / Math.max(1, h) : 1 + 0.12 * p;
    return {
      left: x, top: y, width: w, height: h, borderRadius: onPage ? pr.value : br.value,
      opacity: pulseOn.value * ringPeak * (1 - p), transform: [{ scaleX: sx }, { scaleY: sy }],
    };
  });
  const cardStyle = useAnimatedStyle(() => ({
    left: cx.value, top: cy.value, opacity: cardIn.value * out.value * (1 - away.value),
    transform: [{ translateY: (1 - cardIn.value) * riseSV.value + away.value * riseSV.value * 0.5 + drop.value }],
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

  // The dim is each window's own shadow, spread past every edge of its part of the screen.
  // The inner shadow softens the window's edge by a few points, so it reads as light, not a cut-out.
  const reach = Math.ceil(Math.hypot(W, H));
  const shade = `0px 0px 0px ${reach}px rgba(0, 0, 0, ${dimAlpha}), inset 0px 0px 8px 1px rgba(0, 0, 0, ${dimAlpha})`;
  // Where there is no outer shadow (old Android): a window's frame is a border as wide as the screen, in the dim.
  const pageFrameStyle = useAnimatedStyle(() => ({
    left: px.value - pageLeft.value - reach, top: py.value - pageTop.value - reach, width: pw.value + reach * 2, height: ph.value + reach * 2, borderRadius: pr.value + reach,
  }));
  const barFrameStyle = useAnimatedStyle(() => ({
    left: bx.value - barLeft.value - reach, top: by.value - barTop.value - reach, width: bw.value + reach * 2, height: bh.value + reach * 2, borderRadius: br.value + reach,
  }));
  const frame = { borderWidth: reach, borderColor: `rgba(0, 0, 0, ${dimAlpha})` };
  // A soft light just outside each lit window, so it stands out from the lighter dim; on a dark page a faint light rim as well.
  const glow = [{ boxShadow: `0px 0px 14px 2px rgba(255, 255, 255, ${glowAlpha})` }, dark ? styles.holeRim : null];
  const edge = dark ? colors.borderStrong : colors.border;
  const pointerSides = place.side === 'down' ? styles.pointerDown : place.side === 'up' ? styles.pointerUp : styles.pointerLeft;
  // The swipe tip carries the fingertip that shows the swipe. (The first
  // tip's "Tap anywhere to continue" chip went on Oct 5: Next is the one way
  // on that is shown, though a tap on the dim still moves on.)
  const swipeShown = shown.key === 'swipe';
  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, 'aria-hidden': true };
  const webDialog = Platform.OS === 'web' ? { role: 'dialog' as const, 'aria-modal': true, 'aria-labelledby': TITLE_ID } : {};
  const webFocus = Platform.OS === 'web' ? { tabIndex: -1 as const } : {};

  return (
    <View
      ref={rootRef}
      onLayout={noteOrigin}
      // Fading out, it lets touches through: the first tap after the tour is the player's.
      style={[styles.root, { pointerEvents: open ? 'auto' : 'none' }]}
      // The whole screen is one quiet catch-all: a touch that ends moves on
      // (or, sideways, moves the pages; see touched). It is not a button, so
      // a screen reader never lands on the dim itself. It only asks for
      // touches as they start: asking mid-move as well would take a slightly
      // moving finger off Skip, and Skip would mean Next.
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => { touchFrom.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; }}
      onResponderTerminate={() => { touchFrom.current = null; }}
      onResponderRelease={(e) => {
        const from = touchFrom.current;
        touchFrom.current = null;
        act.current.touched(from ? e.nativeEvent.pageX - from.x : 0, from ? e.nativeEvent.pageY - from.y : 0);
      }}
      accessibilityViewIsModal
      onAccessibilityEscape={() => act.current.skip()}
      onMagicTap={() => act.current.next()}
      {...webDialog}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, dimStyle]}>
        <View style={[styles.region, pageRegion]}>
          {NO_SHADOW_DIM
            ? <Animated.View style={[styles.hole, frame, pageFrameStyle]} />
            : <Animated.View style={[styles.hole, { boxShadow: shade }, pageHoleStyle]} />}
        </View>
        <View style={[styles.region, barRegion]}>
          {NO_SHADOW_DIM
            ? <Animated.View style={[styles.hole, frame, barFrameStyle]} />
            : <Animated.View style={[styles.hole, { boxShadow: shade }, barHoleStyle]} />}
        </View>
        <Animated.View style={[styles.hole, glow, pageGlowStyle]} />
        <Animated.View style={[styles.hole, glow, barGlowStyle]} />
        <Animated.View style={[styles.ring, ringStyle]} />
      </Animated.View>

      {/* Stepped aside for a page turn, the card is out of sight, so its buttons don't answer either. */}
      <Animated.View style={[styles.cardWrap, { width: cardW, pointerEvents: waiting ? 'none' : 'auto' }, cardStyle]}>
        {/* A thumb's swipe means nothing to a mouse, so a computer never gets the swipe tip at all (steps.ts). */}
        {swipeShown && layout === 'phone' && up ? <SwipeDemo reduce={reduce} cardW={cardW} fade={fade} hidden={hidden} /> : null}
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
              <Animated.View style={[styles.actions, fadeStyle]}>
                {/* Skip lives in the card, beside Next: with the lighter dim the page's own
                    buttons show clearly in the top corner, where it used to sit on them. Not
                    handed over to the dim mid-press, so a finger that moves a little still skips. */}
                {/* Back one tip, for one read too fast (Oct 4, owner). */}
                {run.step > 0 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Previous tip" onPress={tryBack} style={styles.skip}>
                    <Text selectable={false} style={styles.skipText}>Back</Text>
                  </Pressable>
                ) : null}
                {shownLast ? null : (
                  <Pressable ref={skipRef} cancelable={false} accessibilityRole="button" accessibilityLabel="Skip tutorial" onPress={skip} style={styles.skip}>
                    <Text selectable={false} style={styles.skipText}>Skip</Text>
                  </Pressable>
                )}
                <View ref={nextRef}>
                  {shownLast ? (
                    <Button label={LAST_BUTTON} onPress={() => act.current.next()} style={styles.pill} />
                  ) : (
                    <Pressable accessibilityRole="button" accessibilityLabel="Next tip" onPress={() => act.current.next()} style={styles.next}>
                      <Text selectable={false} style={styles.nextText}>Next</Text>
                    </Pressable>
                  )}
                </View>
              </Animated.View>
            </View>
          </View>
        </Animated.View>
        <Animated.View {...hidden} pointerEvents="none" style={[styles.pointerClip, pointerStyle]}>
          <View style={[styles.pointer, pointerSides, { borderColor: edge }]} />
        </Animated.View>
      </Animated.View>


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
 * On the swipe tip, a small ring makes one stroke leftward above the card,
 * the way a thumb goes to reach the threads, at the very moment the pages
 * slide there underneath (DEMO_LEAD), and as quickly as they do; then a
 * still two-way arrow takes its place and stays, so the tip never ends up
 * with nothing above it. One stroke, because a second would move nothing.
 * Under Reduce Motion it is the still arrow from the start.
 */
function SwipeDemo({ reduce, cardW, fade, hidden }: { reduce: boolean; cardW: number; fade: SharedValue<number>; hidden: Hidden }) {
  const rise = useSharedValue(0);
  const seen = useSharedValue(0);
  const rest = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { rest.value = 1; return; }
    rest.value = 0;
    rise.value = 0;
    seen.value = 0;
    // In at its start a moment before it moves, so the eye is on it; gone once it lands.
    seen.value = withDelay(DEMO_LEAD - 200, withSequence(
      withTiming(1, { duration: 150, reduceMotion: NEVER }),
      withDelay(50 + STROKE_MS, withTiming(0, { duration: 200, reduceMotion: NEVER })),
    ));
    // Across in a page turn's time, on the pages' own ease.
    rise.value = withDelay(DEMO_LEAD, withTiming(1, { duration: STROKE_MS, easing: PAGE_EASE, reduceMotion: NEVER }));
    // Then the still arrow, as the ring fades.
    rest.value = withDelay(DEMO_LEAD + STROKE_MS + 100, withTiming(1, { duration: 200, reduceMotion: NEVER }));
    return () => { cancelAnimation(rise); cancelAnimation(seen); cancelAnimation(rest); };
  }, [reduce, rise, seen, rest]);
  // From a little right of the middle to a little left of it, right to left, the way the finger goes.
  const ringStyle = useAnimatedStyle(() => ({ opacity: seen.value * fade.value, transform: [{ translateX: SLIDE / 2 - SLIDE * rise.value }] }));
  const stillStyle = useAnimatedStyle(() => ({ opacity: rest.value * fade.value }));
  return (
    <>
      {reduce ? null : <Animated.View {...hidden} pointerEvents="none" style={[demo.ring, { left: (cardW - 26) / 2 }, ringStyle]} />}
      <Animated.View {...hidden} pointerEvents="none" style={[demo.still, { left: (cardW - 24) / 2 }, stillStyle]}>
        {/* Both ways: the words say left and right. */}
        <Ionicons name="swap-horizontal" size={24} color="rgba(255, 255, 255, 0.95)" style={demo.shadow} />
      </Animated.View>
    </>
  );
}

const demo = StyleSheet.create({
  // A faint fill makes it read as a fingertip, not an outline, over a busy page.
  // Both sit on one line just above the card, where the ring travels sideways.
  // A soft dark shadow keeps the white readable over a light page through the lighter dim.
  ring: {
    position: 'absolute', top: -46, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.95)',
    backgroundColor: 'rgba(255, 255, 255, 0.3)', boxShadow: '0px 1px 6px rgba(0, 0, 0, 0.35)',
  },
  still: { position: 'absolute', top: -45, width: 24, height: 24 },
  shadow: { textShadowColor: 'rgba(0, 0, 0, 0.4)', textShadowRadius: 5, textShadowOffset: { width: 0, height: 1 } },
});

const styleDefinitions = StyleSheet.create({
  // Over the bar (30), the upload bar (40) and toasts (50); under the feed's splash curtain (60), never up by now.
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 55,
    // On Android the gesture library only stops at a view with a background; without one, swipes and
    // pinches on the dim reach the pagers and the page underneath. A fully clear one doesn't count.
    ...(Platform.OS === 'android' ? { backgroundColor: 'rgba(0, 0, 0, 0.01)' } : null),
  },
  // A part of the screen with one window in it; what spreads past its edges is cut off there.
  region: { position: 'absolute', overflow: 'hidden' },
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
    // A touch deeper than a page's own cards: with the lighter dim, this is what lifts it off the page.
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.22)',
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
  actions: { flexDirection: 'row', alignItems: 'center' },
  // Quieter than Next, with the same 44-point reach that takes no room.
  skip: { paddingVertical: 14, marginVertical: -14, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  skipText: { ...typography.smallStrong, color: colors.textMuted },
  measurer: { position: 'absolute', left: 0, top: 0, opacity: 0 },
  measureOne: { position: 'absolute', left: 0, right: 0, top: 0, gap: FOOT_GAP },
});
