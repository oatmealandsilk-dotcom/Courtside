import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Animated, Keyboard, Platform, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Reanimated, { type SharedValue, cancelAnimation, runOnJS, runOnUI, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import * as haptics from '@/lib/haptics';
import { PullDisc, usePullDisc } from '@/components/PullDisc';
import { PULL_DISARM, PULL_DISC, PULL_GAP, PULL_LAND_SLACK, PULL_LINE, PULL_MIN_SPIN, PULL_RETURN, WEB_PULL_LINE, fingerFor, pullFetch, pullRowLift, pullRowOpacity, rubberBand } from '@/lib/pullRefresh';
import { isPageDragging, sectionPan, subscribePageDragging } from '@/features/navigation/swipeLock';
import { KeyboardScrollContext, afterKeyboard, visibleAboveKeyboard, type Measurable } from '@/lib/keyboardScroll';
import { KEYBOARD_ROOM, useKeyboardRoom } from '@/lib/keyboardRoom';
import { TAB_FOR_KEY, subscribeScrollToTop } from '@/features/navigation/scrollToTop';
import { barCompact, glideBar } from '@/features/navigation/barShrink';
import { useTabActive } from '@/features/navigation/tabFocus';
import { useBarInset } from '@/features/navigation/barInset';
import { useResponsive } from '@/lib/useResponsive';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale, colors, spacing, typography } from '@/theme';
import { scrollMemory } from './scrollMemory';

const IOS = Platform.OS === 'ios';
const WEB = Platform.OS === 'web';
// Roughly how far a page coasts after letting go, per point-per-millisecond of speed (as Screen).
const COAST = 499;
/** A move made by code that never quite arrives (clamped at an end) stops being quiet after this long. */
const QUIET_MS = 900;
/** Vertical-only touches in a browser, beneath the scroller, so a sideways swipe stays the pager's (see Screen). */
const verticalOnlyTouch = WEB ? ({ touchAction: 'pan-y' } as unknown as ViewStyle) : null;

/**
 * One refresh at a time for every section of a page: pulling the second
 * section while the first one's fetch runs waits on that same fetch.
 */
let inflight: Promise<unknown> | null = null;

export interface PaneScrollerProps {
  /** Where this section was left is kept under this name (scrollMemory), e.g. 'discuss:players'. */
  memoryKey: string;
  /** Whether this section is the one on show in its pager. */
  active: boolean;
  /** Pull down past the top to run this; a small "Updated" note confirms it. `false` back means it failed. */
  onRefresh?: () => Promise<boolean | void> | boolean | void;
  /** Hands the caller the scroller. */
  scrollRef?: React.MutableRefObject<ScrollView | null>;
  /** Kept up to date with how far down this section is. */
  offsetY?: SharedValue<number>;
  /** True while this section sits in its pull strip (a pull held open): the pager holds still then. */
  inStrip?: SharedValue<boolean>;
  /** On a computer: the width the section's content keeps to, centred in a scroller as wide as the window. */
  column?: number;
  /**
   * Drawn behind the section's content, scrolling with it (Community's light, CommunityGlow). Handed
   * where the section's top sits in it: below a phone's pull strip, 0 elsewhere. Kept to the content's
   * column on a computer and to the content's length, so it never makes a page longer.
   */
  backdrop?: (top: number) => ReactNode;
  children: ReactNode;
}

/**
 * One section's own vertical page, for a tab whose sections slide side by
 * side under a row that stays put (Community: Find Players | Discussions).
 * Each section scrolls on its own and keeps its own place, so a swipe or a
 * tab tap between them moves nothing but the panes sideways: nothing to hold,
 * clamp or move on landing (Oct 22, owner: "It should be a smooth swipe.
 * Nothing framing in or out").
 *
 * The scroller is Screen's own, section by section: the pull-to-refresh strip
 * and disc, the "Updated" note, the browser's pull, the keyboard's room and
 * the reveal of a focused box, and the bottom bar's tuck. What differs:
 *  - only the section on show, in the tab on show, tucks the bar, and never
 *    mid section swipe;
 *  - every move made by code (putting it back where it was left, a scroll to
 *    the top, the tutorial's nudge, the end of a pull's way back) is quiet:
 *    it never tucks the bar, until the page has actually got there;
 *  - a section not on show only obeys a jump to its top (the tab being left,
 *    or the bar bringing you to the map), never a glide meant for the other.
 */
export function PaneScroller({ memoryKey, active, onRefresh, scrollRef, offsetY, inStrip, column, backdrop, children }: PaneScrollerProps) {
  const styles = useThemedStyles(styleDefinitions);
  const barInset = useBarInset();
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const tabActive = useTabActive();
  // While a sideways swipe is under way, this scroller stands down.
  const swiping = useSyncExternalStore(subscribePageDragging, isPageDragging, () => false);
  const scroller = useRef<ScrollView | null>(null);
  // Captured once, so the starting place is set before the first paint rather than scrolled to after.
  const initial = useRef(scrollMemory.get(memoryKey) ?? 0);
  const here = useRef(initial.current);
  // The strip only exists on the phone, and only while the page can refresh.
  const strip = !WEB && onRefresh ? PULL_GAP : 0;
  const restored = useRef(initial.current === 0);
  const [viewH, setViewH] = useState(0);
  // With the keys up an iPhone lets a page scroll past its end, so the stop at the top stands down meanwhile (as Screen).
  const [keysUp, setKeysUp] = useState(false);
  useEffect(() => {
    if (!IOS || strip <= 0) return undefined;
    setKeysUp(Keyboard.isVisible());
    const up = Keyboard.addListener('keyboardWillShow', () => setKeysUp(true));
    const down = Keyboard.addListener('keyboardWillHide', () => setKeysUp(false));
    return () => { up.remove(); down.remove(); setKeysUp(false); };
  }, [strip]);
  const wideNative = !isPhone && !WEB;
  const room = !isPhone ? (wideNative ? insets.bottom : 0) : barInset;
  // Android only: the keyboard's room, past what the page already keeps.
  const keyboardRoom = useKeyboardRoom(room);
  const updated = useRef(new Animated.Value(0)).current;
  const refreshNowRef = useRef<() => Promise<void>>(async () => undefined);
  const busy = useRef(false);
  const gap = useSharedValue(0);
  const disc = usePullDisc();
  const canRefresh = useRef(false);
  canRefresh.current = Boolean(onRefresh);

  // Whether this section's scrolls count for the bar's tuck: on show, in the tab on show.
  const live = useSharedValue(active && tabActive);
  useEffect(() => { live.value = active && tabActive; }, [active, tabActive, live]);
  const activeRef = useRef(active);
  activeRef.current = active;

  const lastY = useSharedValue(-1);
  const scrollY = useSharedValue(initial.current + strip);
  const list = useAnimatedRef<Reanimated.ScrollView>();
  const dragging = useSharedValue(false);
  const armed = useSharedValue(false);
  const holding = useSharedValue(false);
  const settling = useSharedValue(false);
  const glide = useSharedValue(0);
  const gliding = useSharedValue(false);
  // A move made by code is under way to here (-1: none), since this moment.
  const quietTo = useSharedValue(-1);
  const quietSince = useSharedValue(0);
  // Where the page was when a section swipe took the finger (-1: no swipe): it is held there.
  const panY = useSharedValue(-1);
  useAnimatedReaction(() => sectionPan.value, (on, was) => {
    if (on && !was) panY.value = scrollY.value;
    else if (!on) panY.value = -1;
  });
  /** Marks the next move as made by code. Not when the page is already there (no scroll would report it). */
  const hush = useCallback((y: number) => {
    if (Math.abs(scrollY.value - y) < 1) return;
    quietTo.value = y;
    quietSince.value = Date.now();
  }, [scrollY, quietTo, quietSince]);

  const webPull = useCallback((node: ScrollView | null) => {
    if (!WEB || !node) return;
    const el = ((node as unknown as { getScrollableNode?: () => unknown }).getScrollableNode?.() ?? node) as unknown as HTMLElement;
    if (!el || typeof el.addEventListener !== 'function' || (el as unknown as { __pullWired?: boolean }).__pullWired) return;
    (el as unknown as { __pullWired?: boolean }).__pullWired = true;
    let finger = 0;
    let isArmed = false;
    let idle: ReturnType<typeof setTimeout> | null = null;
    let touchStart: number | null = null;
    const space = () => el.clientHeight || 800;
    const follow = (amount: number) => {
      finger = Math.max(0, amount);
      gap.value = rubberBand(finger, space());
      if (!isArmed && gap.value >= WEB_PULL_LINE) { isArmed = true; disc.arm(); haptics.tap(); }
      else if (isArmed && gap.value < WEB_PULL_LINE - PULL_DISARM) { isArmed = false; disc.disarm(); }
    };
    const pickUp = () => { cancelAnimation(gap); finger = fingerFor(gap.value, space()); if (!busy.current) disc.rest(); };
    const letGo = () => {
      if (idle) { clearTimeout(idle); idle = null; }
      if (isArmed) {
        isArmed = false;
        disc.start();
        gap.value = withSpring(PULL_GAP, PULL_RETURN);
        void refreshNowRef.current();
      } else if (gap.value > 0) gap.value = withSpring(0, PULL_RETURN);
      finger = 0;
    };
    el.addEventListener('wheel', (e: WheelEvent) => {
      if (!canRefresh.current || busy.current || el.scrollTop > 0 || (e.deltaY >= 0 && finger <= 0)) return;
      if (finger <= 0 && gap.value > 0) pickUp();
      follow(finger - e.deltaY);
      if (idle) clearTimeout(idle);
      idle = setTimeout(letGo, 220);
    }, { passive: true });
    el.addEventListener('touchstart', (e: TouchEvent) => {
      touchStart = canRefresh.current && el.scrollTop <= 0 && !busy.current ? e.touches[0].clientY : null;
      if (touchStart !== null) { pickUp(); touchStart -= finger; }
    }, { passive: true });
    el.addEventListener('touchmove', (e: TouchEvent) => { if (touchStart !== null) follow(e.touches[0].clientY - touchStart); }, { passive: true });
    const touchEnd = () => { if (touchStart === null) return; touchStart = null; letGo(); };
    el.addEventListener('touchend', touchEnd);
    el.addEventListener('touchcancel', touchEnd);
  }, [gap, disc]);
  const hasRefresh = Boolean(onRefresh);
  useEffect(() => { if (hasRefresh) webPull(scroller.current); }, [hasRefresh, webPull]);

  const tick = useCallback(() => haptics.tap(), []);
  const beginPull = useCallback(() => { void refreshNowRef.current(); }, []);
  const settleTo = useCallback((y: number) => {
    'worklet';
    if (settling.value) return;
    settling.value = true;
    requestAnimationFrame(() => { scrollTo(list, 0, y, true); });
  }, [list, settling]);
  useAnimatedReaction(() => glide.value, (v, prev) => { if (gliding.value && v !== prev) scrollTo(list, 0, v, false); }, []);
  const remember = useCallback((y: number) => {
    const at = Math.max(0, y - strip);
    here.current = at;
    scrollMemory.set(memoryKey, at);
  }, [memoryKey, strip]);
  const rowStyle = useAnimatedStyle(() => ({ opacity: pullRowOpacity(gap.value), transform: [{ translateY: pullRowLift(gap.value) }] }));
  const webDiscStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, (gap.value - 8) / 24)), transform: [{ translateY: -40 + 46 * Math.min(1, gap.value / PULL_GAP) }] }));
  const finish = useCallback(() => {
    'worklet';
    holding.value = false;
    if (dragging.value) { disc.rest(); return; }
    const y = scrollY.value;
    if (y < strip - 1) {
      gliding.value = true;
      glide.value = y;
      glide.value = withSpring(strip, PULL_RETURN, (done) => {
        gliding.value = false;
        if (done) {
          // The spring's last step, made here, is the page's own move: quiet.
          if (Math.abs(scrollY.value - strip) >= 1) { quietTo.value = strip; quietSince.value = Date.now(); }
          scrollTo(list, 0, strip, false);
          disc.rest();
          runOnJS(remember)(strip);
        }
      });
    } else disc.rest();
  }, [strip, scrollY, holding, dragging, gliding, glide, list, disc, remember, quietTo, quietSince]);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const onScrollAnimated = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      scrollY.value = y;
      if (offsetY) offsetY.value = y;
      if (inStrip) { const inside = strip > 0 && y < strip - 1; if (inStrip.value !== inside) inStrip.value = inside; }
      // A browser reports no lift of the finger: where the page is is kept as it scrolls.
      if (WEB) runOnJS(remember)(y);
      // A section swipe has the finger: the few points of up-and-down it carries before this
      // scroller stands down are put straight back, in the same frame, and never count.
      if (panY.value >= 0) {
        if (Math.abs(y - panY.value) > 0.5) scrollTo(list, 0, panY.value, false);
        lastY.value = panY.value;
        return;
      }
      if (strip > 0) {
        gap.value = strip - y;
        if (dragging.value && !holding.value) {
          if (!armed.value && gap.value >= PULL_LINE) { armed.value = true; disc.arm(); runOnJS(tick)(); }
          else if (armed.value && gap.value < PULL_LINE - PULL_DISARM) { armed.value = false; disc.disarm(); }
        }
        if (!dragging.value && !holding.value && !gliding.value && y < strip - 2 && lastY.value >= 0 && y < lastY.value && quietTo.value < 0) settleTo(strip);
        if (y >= strip - 0.5) settling.value = false;
      }
      // The first report is just where the page already sat.
      if (lastY.value < 0) { lastY.value = y; return; }
      // A move made by code: never a scroll for the bar, until it has arrived.
      if (quietTo.value >= 0) {
        lastY.value = y;
        if (Math.abs(y - quietTo.value) < 1 || Date.now() - quietSince.value > QUIET_MS) { quietTo.value = -1; runOnJS(remember)(y); }
        return;
      }
      const dy = y - lastY.value;
      lastY.value = y;
      // Only the section on show, by a finger of its own, moves the bar.
      if (!live.value || sectionPan.value) return;
      if (Math.abs(dy) > 0.3 && y >= strip) barCompact.value = Math.max(0, Math.min(1, barCompact.value + dy / 150));
    },
    onBeginDrag: () => {
      dragging.value = true;
      settling.value = false;
      // A finger on the page: whatever code was moving it, this is now a real scroll.
      quietTo.value = -1;
      if (gliding.value) { cancelAnimation(glide); gliding.value = false; }
      if (!holding.value) { armed.value = false; disc.rest(); }
    },
    onEndDrag: (event) => {
      dragging.value = false;
      const y = event.contentOffset.y;
      runOnJS(remember)(y);
      if (strip <= 0) return;
      const goal = event.targetContentOffset?.y ?? y + (IOS ? event.velocity?.y ?? 0 : 0) * COAST;
      if (armed.value && !holding.value) {
        armed.value = false;
        holding.value = true;
        disc.start();
        runOnJS(beginPull)();
        if (goal > PULL_LAND_SLACK) settleTo(0);
      } else if (y < strip && goal < strip - 0.5) {
        if (!holding.value) settleTo(strip);
        else if (goal > PULL_LAND_SLACK) settleTo(0);
      }
    },
    onMomentumEnd: (event) => { settling.value = false; if (!gliding.value) runOnJS(remember)(event.contentOffset.y); },
  });

  const refreshNow = useCallback(async () => {
    if (busy.current) return;
    if (!onRefresh) {
      if (!WEB) runOnUI(finishRef.current)();
      else gap.value = withSpring(0, PULL_RETURN, (done) => { if (done) disc.rest(); });
      return;
    }
    busy.current = true;
    const began = Date.now();
    // The other section's pull already fetching: this one waits on that same fetch.
    const run = (inflight ??= pullFetch(onRefresh).finally(() => { inflight = null; }));
    const ok = (await run) !== false;
    const left = PULL_MIN_SPIN - (Date.now() - began);
    if (left > 0) await new Promise<void>((resolve) => setTimeout(resolve, left));
    busy.current = false;
    if (!WEB) runOnUI(finishRef.current)();
    else gap.value = withSpring(0, PULL_RETURN, (done) => { if (done) disc.rest(); });
    if (!ok) return;
    updated.setValue(0);
    Animated.sequence([
      Animated.delay(180),
      Animated.spring(updated, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 320, overshootClamping: true }),
      Animated.delay(900),
      Animated.timing(updated, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [onRefresh, updated, gap, disc]);
  refreshNowRef.current = refreshNow;

  // A text box asks for this when it gains focus: just enough scroll to clear the keyboard.
  const reveal = useCallback((node: Measurable | null) => {
    if (!node?.measureInWindow || !scroller.current) return;
    afterKeyboard(() => {
      node.measureInWindow?.((_x, y, _w, h) => {
        const overflow = y + h - (visibleAboveKeyboard() - 24);
        if (overflow <= 0) return;
        scroller.current?.scrollTo({ y: strip + here.current + overflow, animated: true });
      });
    });
  }, [strip]);

  // "Top" is just under the strip. The section on show does as Screen does; the other only jumps,
  // and only when asked to jump (its tab being left, the bar bringing you to the map), so a glide
  // meant for the section on show never loses the other one its place.
  useEffect(() => subscribeScrollToTop((tab, instant, below = 0) => {
    if (TAB_FOR_KEY[memoryKey] !== tab && memoryKey !== tab) return;
    if (!activeRef.current && !instant) return;
    const to = activeRef.current ? below : 0;
    hush(strip + to);
    if (!instant) glideBar(false);
    scroller.current?.scrollTo({ y: strip + to, animated: !instant });
    if (!instant) return;
    here.current = to;
    scrollMemory.set(memoryKey, to);
  }), [memoryKey, strip, hush]);

  return (
    <KeyboardScrollContext.Provider value={reveal}>
      <View style={styles.flex}>
        <Reanimated.ScrollView
          ref={(node: unknown) => { list(node as never); scroller.current = node as unknown as ScrollView | null; if (scrollRef) scrollRef.current = node as unknown as ScrollView | null; }}
          style={styles.flex}
          // The auto-tester finds each section's scroller by this (scripts/smoke.mjs, community-swipe-still).
          testID={`pane-${memoryKey}`}
          contentContainerStyle={[styles.content, verticalOnlyTouch, strip > 0 && viewH > 0 ? { minHeight: viewH + strip } : null]}
          onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h > 0 && h !== viewH) setViewH(h); }}
          scrollEnabled={!swiping}
          // A tap on an iPhone's clock takes the section on show to its top; only one scroller may say yes.
          scrollsToTop={active && tabActive}
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={IOS}
          keyboardDismissMode={Platform.OS === 'android' ? 'on-drag' : 'interactive'}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          snapToOffsets={strip > 0 && !keysUp ? [strip] : undefined}
          snapToStart={false}
          snapToEnd={false}
          contentOffset={{ x: 0, y: strip + initial.current }}
          onScroll={onScrollAnimated}
          onContentSizeChange={(_width, height) => {
            // Too short to rest below the strip until now: settles below it, quietly.
            if (strip > 0 && !busy.current && !holding.value && !dragging.value && !gliding.value && scrollY.value < strip - 1 && viewH > 0 && height >= viewH + strip - 1) {
              hush(strip);
              scroller.current?.scrollTo({ y: strip, animated: false });
            }
            if (restored.current) return;
            // Put back where it was left once the content is tall enough to hold that place.
            if (height > initial.current) {
              restored.current = true;
              hush(strip + initial.current);
              scroller.current?.scrollTo({ y: strip + initial.current, animated: false });
            }
          }}
        >
          {backdrop ? (
            <View pointerEvents="none" style={styles.backdrop}>
              <View style={[styles.backdropColumn, column ? { maxWidth: column } : null]}>{backdrop(strip)}</View>
            </View>
          ) : null}
          {strip > 0 ? <View pointerEvents="none" style={{ height: strip }} /> : null}
          <View style={[styles.body, column ? { width: '100%', maxWidth: column, alignSelf: 'center' } : null, { paddingBottom: room + spacing.xxxl }]}>
            {children}
          </View>
          {KEYBOARD_ROOM ? <Reanimated.View pointerEvents="none" style={keyboardRoom} /> : null}
        </Reanimated.ScrollView>
        {strip > 0 ? (
          <Reanimated.View pointerEvents="none" style={[styles.pullRow, rowStyle]}>
            <PullDisc gap={gap} disc={disc} line={PULL_LINE} />
          </Reanimated.View>
        ) : null}
        {onRefresh && WEB ? (
          <Reanimated.View pointerEvents="none" style={[styles.webRefresh, webDiscStyle]}>
            <PullDisc gap={gap} disc={disc} line={WEB_PULL_LINE} />
          </Reanimated.View>
        ) : null}
        {onRefresh ? (
          <Animated.View pointerEvents="none" style={[styles.updated, { opacity: updated, transform: [{ translateY: updated.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }, { scale: updated.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
            <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
            <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.updatedText}>Updated</Text>
          </Animated.View>
        ) : null}
      </View>
    </KeyboardScrollContext.Provider>
  );
}

const styleDefinitions = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  // The page's side margins, and the gap under the section row, which scrolls away with the content.
  // 10 under the section row (Oct 24, owner: less space above the search so the map can be bigger).
  body: { paddingHorizontal: spacing.lg, paddingTop: 10 },
  // Behind the content, as long as it and no longer; what is drawn there is kept to the column across.
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  backdropColumn: { flex: 1, width: '100%', alignSelf: 'center' },
  pullRow: { position: 'absolute', top: 0, left: 0, right: 0, height: PULL_DISC, alignItems: 'center', justifyContent: 'center' },
  webRefresh: { position: 'absolute', alignSelf: 'center', top: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  updated: { position: 'absolute', alignSelf: 'center', top: 8, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  updatedText: { ...typography.smallStrong, color: colors.text },
});
