import { useTheme } from '@/theme/ThemeProvider';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { PullDisc, usePullDisc } from '@/components/PullDisc';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, runOnJS, runOnUI, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { barCompact, glideBar } from '@/features/navigation/barShrink';
import { setPageScrolling } from '@/features/navigation/swipeLock';
import * as haptics from '@/lib/haptics';
import { PULL_DISARM, PULL_DISC, PULL_GAP, PULL_LAND_SLACK, PULL_LINE, PULL_MIN_SPIN, PULL_RETURN, pullFetch, pullRowLift, pullRowOpacity } from '@/lib/pullRefresh';
import { colors } from '@/theme';

/**
 * Full-height pages that snap one at a time. The active page changes the
 * moment a swipe crosses the midpoint — not when the scroll settles — so a
 * clip stops the instant it is on its way out and the next one starts early.
 */
export interface VerticalPagerHandle { scrollToTop: () => void }

// The bar ducking changes the room here by a few points. Pages keep their
// size through that: rebuilding every page and re-snapping mid-swipe made the
// feed fight the finger. Only a real change of room (turning the phone, the
// keyboard) re-sizes the pages.
const RESIZE_MIN = 40;

// Pull-to-refresh (the numbers are shared with every other page, in
// lib/pullRefresh). A blank strip sits above the first page: the room under
// the clock plus the gap held open while it fetches. The feed rests scrolled
// just past it. Pulling down scrolls the strip into view, then the phone's
// own stretch takes over, so the feed gives less than the finger; the line
// is part way into that stretch. Let go past it and the phone's own bounce
// lands the feed on the strip's top, where it holds while the fetch runs,
// then springs back. Let go short of it and the feed goes straight back.
const IOS = Platform.OS === 'ios';
// Roughly how far the feed coasts after letting go, per point-per-millisecond
// of speed, at this scroller's quick slowing ("fast").
const COAST = 99;

/** A page's own key when it has one, otherwise its place. */
function pageKey(child: React.ReactNode, index: number) {
  return React.isValidElement(child) && child.key != null ? `k:${child.key}` : `i:${index}`;
}

export const VerticalPager = forwardRef<VerticalPagerHandle, { children: React.ReactNode[]; onIndex: (index: number) => void; /** The page the scroll came to rest on. */ onSettled?: (index: number) => void; initialIndex?: number; /** Pulling down past the first page fetches what is new. */ onRefresh?: () => Promise<void>; /** Shown in the gap the pull opens, beside the disc. */ pullHeader?: React.ReactNode; /** How far below the clock the pull row sits (clear of a band laid over the top). */ pullTop?: number }>(function VerticalPager({ children, onIndex, onSettled, initialIndex = 0, onRefresh, pullHeader, pullTop = 0 }, ref) {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  const [height, setHeight] = useState(0);
  // The feed holds still while the fetch runs: a refresh re-deals the pages under it.
  const [scrollLocked, setScrollLocked] = useState(false);
  const insets = useSafeAreaInsets();
  // Where the first page starts: past the pull strip when there is one.
  const top = onRefresh ? insets.top + PULL_GAP : 0;
  const list = useAnimatedRef<Animated.ScrollView>();
  // Scrolling is asked for on the UI thread, where the list lives. `y` is
  // measured from the first page's top.
  const jump = useCallback((y: number, animated: boolean) => {
    const target = top + y;
    const node = list.current as unknown as { scrollTo?: (o: { x: number; y: number; animated: boolean }) => void } | null;
    if (node?.scrollTo) { node.scrollTo({ x: 0, y: target, animated }); return; }
    runOnUI(() => { 'worklet'; scrollTo(list, 0, target, animated); })();
  }, [list, top]);
  useImperativeHandle(ref, () => ({ scrollToTop: () => jump(0, true) }), [jump]);

  // How far the strip is pulled into view (the first page's corners round
  // while it is), and how open the gap under the clock is, which is what the
  // disc and greeting follow.
  const pullY = useSharedValue(0);
  const gap = useSharedValue(-PULL_GAP);
  const disc = usePullDisc();
  // A finger is down; the line has been crossed; the fetch is running (the
  // feed holds at the strip's top); a move back to the page is under way.
  const dragging = useSharedValue(false);
  const armed = useSharedValue(false);
  const holding = useSharedValue(false);
  const settling = useSharedValue(false);
  const refreshingRef = useRef(false);
  // The way back after a refresh is driven frame by frame on the animation
  // thread: a spring from wherever the feed is, which a finger can catch.
  const glide = useSharedValue(0);
  const gliding = useSharedValue(false);
  useAnimatedReaction(() => glide.value, (v, prev) => { if (gliding.value && v !== prev) scrollTo(list, 0, v, false); }, []);
  // A move the scroller is asked for when a pull lets go. It waits one frame:
  // asked for in the same moment as letting go, the phone's own coasting,
  // which starts just after, would undo it.
  const settleTo = useCallback((y: number) => {
    'worklet';
    if (settling.value) return;
    settling.value = true;
    requestAnimationFrame(() => { scrollTo(list, 0, y, true); });
  }, [list, settling]);
  const tick = useCallback(() => haptics.tap(), []);
  const settledRef = useRef<(y: number) => void>(() => undefined);
  const afterGlide = useCallback((y: number) => settledRef.current(y), []);
  // Back to the first page, from wherever the feed is now. Already there (or
  // past it), there is nothing to move.
  const finish = useCallback(() => {
    'worklet';
    holding.value = false;
    // A finger already on the feed keeps it; letting go settles it like any pull.
    if (dragging.value) { disc.rest(); return; }
    const y = top - pullY.value;
    if (pullY.value > 1) {
      gliding.value = true;
      glide.value = y;
      glide.value = withSpring(top, PULL_RETURN, (done) => {
        gliding.value = false;
        // The spring's last step lands after it stops driving the scroller, so that step is made here.
        if (done) { scrollTo(list, 0, top, false); disc.rest(); runOnJS(afterGlide)(top); }
      });
    } else disc.rest();
  }, [top, pullY, holding, dragging, gliding, glide, list, disc, afterGlide]);
  // The way back is always the current one: the strip can change size (or go)
  // while a fetch runs, and the one from when it started would aim for the old top.
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const refreshNow = useCallback(async () => {
    if (refreshingRef.current) return;
    // Nothing to fetch after all: straight back to the first page.
    if (!onRefresh) { runOnUI(finishRef.current)(); return; }
    refreshingRef.current = true;
    const began = Date.now();
    setScrollLocked(true);
    // The bounce is already carrying the feed to the strip's top; it holds
    // there. A fetch that fails leaves the feed as it was; one that hangs is
    // let go of after a few seconds and finishes behind.
    await pullFetch(onRefresh);
    // A quick fetch still shows the disc turning for a moment, so the pull reads as having done something.
    const left = PULL_MIN_SPIN - (Date.now() - began);
    if (left > 0) await new Promise<void>((resolve) => setTimeout(resolve, left));
    // The finger is free again the moment the feed starts back, and a new
    // pull can begin straight away.
    refreshingRef.current = false;
    setScrollLocked(false);
    runOnUI(finishRef.current)();
  }, [onRefresh]);
  // The disc and greeting ride in the middle of the open gap, fading in as it opens and out as it closes.
  const rowStyle = useAnimatedStyle(() => ({ opacity: pullRowOpacity(gap.value), transform: [{ translateY: pullRowLift(gap.value) }] }));
  // While the strip is in view, the first page's top corners look rounded —
  // drawn as caps laid over the corners, never by clipping the page: a
  // clipped box around a native video froze the picture while the sound ran on.
  const capsStyle = useAnimatedStyle(() => ({ opacity: pullY.value > 1 ? 1 : 0 }));

  const last = useRef(initialIndex);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The starting page is read once. The page reports its position as you
  // scroll, and feeding that straight back in as the offset yanked the list
  // to a page edge mid-swipe — the "lands half and half" bug.
  const startIndex = useRef(initialIndex);
  const count = children.length;
  const pageOf = useCallback((y: number) => Math.max(0, Math.min(count - 1, Math.round((y - top) / Math.max(1, height)))), [count, height, top]);
  const changed = useCallback((index: number) => {
    if (index !== last.current) { last.current = index; onIndex(index); }
  }, [onIndex]);
  const settled = useCallback((y: number) => {
    changed(pageOf(y));
    onSettled?.(last.current);
  }, [changed, pageOf, onSettled]);
  settledRef.current = settled;
  const dragEnded = useCallback((y: number) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => { settleTimer.current = null; settled(y); }, 140);
  }, [settled]);
  const cancelSettle = useCallback(() => { if (settleTimer.current) { clearTimeout(settleTimer.current); settleTimer.current = null; } }, []);

  // Everything per frame stays on the UI thread: the bar follows the swipe
  // (moving on tucks it, coming back lifts it), and only a change of page
  // crosses to the JavaScript side.
  const lastY = useSharedValue(-1);
  // Which way the bar was last sent this swipe (1 tucked, -1 up, 0 not yet); cleared as each swipe begins.
  const barDir = useSharedValue(0);
  const lastIndex = useSharedValue(initialIndex);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const h = e.layoutMeasurement.height || 1;
      pullY.value = y < top ? top - y : 0;
      if (top > 0) {
        gap.value = PULL_GAP - y;
        // The line counts only under a finger: a fling or a bounce never ticks.
        // Crossing it closes the disc's ring and ticks in the same moment.
        if (dragging.value && !holding.value) {
          if (!armed.value && gap.value >= PULL_LINE) { armed.value = true; disc.arm(); runOnJS(tick)(); }
          else if (armed.value && gap.value < PULL_LINE - PULL_DISARM) { armed.value = false; disc.disarm(); }
        }
        // Heading for the top on its own (a hard flick back, a tap on the
        // clock), the feed stops at the first page rather than in the strip.
        if (!dragging.value && !holding.value && !gliding.value && y < top - 2 && lastY.value >= 0 && y < lastY.value) settleTo(top);
        if (y >= top - 0.5) settling.value = false;
      }
      if (lastY.value >= 0) {
        const dy = y - lastY.value;
        // On to the next clip tucks the bar, back up lifts it: one glide per
        // swipe and direction (barDir), however fast the finger went.
        const dir = Math.abs(dy) > 0.3 && y >= top ? (dy > 0 ? 1 : -1) : 0;
        if (dir !== 0 && dir !== barDir.value) { barDir.value = dir; glideBar(dir > 0); }
      }
      lastY.value = y;
      const index = Math.max(0, Math.min(count - 1, Math.round((y - top) / h)));
      if (index !== lastIndex.value) { lastIndex.value = index; runOnJS(changed)(index); }
    },
    onBeginDrag: () => {
      barDir.value = 0;
      dragging.value = true;
      // The tutorial waits for this finger to lift before it starts.
      runOnJS(setPageScrolling)(true);
      settling.value = false;
      // A finger on the feed while it springs back catches it where it is.
      if (gliding.value) { cancelAnimation(glide); gliding.value = false; }
      if (!holding.value) { armed.value = false; disc.rest(); }
    },
    // Each frame of the spring back reports as a scroll that has come to
    // rest; only the real end of a move counts.
    onMomentumEnd: (e) => { settling.value = false; if (!gliding.value) runOnJS(settled)(e.contentOffset.y); },
    onEndDrag: (e) => {
      dragging.value = false;
      runOnJS(setPageScrolling)(false);
      const y = e.contentOffset.y;
      if (top > 0 && !holding.value) {
        // Where the feed would coast to on its own, from its speed alone,
        // before the page stops have their say.
        const ahead = y + (IOS ? e.velocity?.y ?? 0 : 0) * COAST;
        if (armed.value) {
          // Let go past the line: it refreshes, and the disc starts turning.
          armed.value = false;
          holding.value = true;
          disc.start();
          runOnJS(refreshNow)();
          // Where the phone says it will stop. Let go still moving down (the
          // usual, even with the lift of a finger in it), its own bounce lands
          // the feed on the strip's top: that is left alone. Heading anywhere
          // else (a flick back up), it is sent there.
          const goal = e.targetContentOffset?.y ?? ahead;
          if (goal > PULL_LAND_SLACK) settleTo(0);
        } else if (y < top && ahead < top + height / 2) {
          // Short of the line it goes back to the first page, never resting in
          // the strip. A flick back up out of the strip lands there too, not a
          // page on; only a real fling carries on to the next clip.
          settleTo(top);
        }
      }
      runOnJS(dragEnded)(y);
    },
    onMomentumBegin: () => { runOnJS(cancelSettle)(); },
  });

  // The places the scroller may rest: each page's top, measured past the
  // strip. The strip's own top is not one of them: the snap picks by the
  // finger's direction, so a quick tug down that never reached the line
  // used to land there with nothing loading. Where a pull ends is decided
  // above instead.
  const snapOffsets = useMemo(() => children.map((_, i) => top + i * height), [children, top, height]);
  // The strip follows the room under the clock; if that ever changes, the page in view stays put.
  const placedTop = useRef(top);
  useEffect(() => {
    if (placedTop.current === top || height <= 0) return;
    placedTop.current = top;
    if (!refreshingRef.current) requestAnimationFrame(() => jump(last.current * height, false));
  }, [top, height, jump]);
  // Gone mid-drag (the feed rebuilt under the finger): the drag can't still be on.
  useEffect(() => () => setPageScrolling(false), []);

  return (
    <View style={{ flex: 1 }} onLayout={(e) => {
      // A page is the room, exactly: the bar floats over the page rather
      // than taking room from it, so nothing about the bar can leave a gap.
      const room = e.nativeEvent.layout.height;
      const h = room;
      if (h <= 0) return;
      setHeight((prev) => {
        // A page shorter than the room shows the next page's top above the
        // bar, so more room than the page is always taken, however small the
        // change; less room (the bar at full size) is only the few points
        // that sit under it, and is ignored as before.
        if (prev !== 0 && room <= prev + 1 && Math.abs(prev - h) < RESIZE_MIN) return prev;
        if (prev !== 0) requestAnimationFrame(() => jump(last.current * h, false));
        return h;
      });
    }}>
      {height > 0 && (
        <Animated.ScrollView
          ref={list}
          style={{ height }}
          snapToOffsets={snapOffsets}
          snapToStart={false}
          snapToAlignment="start"
          disableIntervalMomentum
          contentOffset={{ x: 0, y: top + startIndex.current * height }}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          scrollEnabled={!scrollLocked}
          bounces={!!onRefresh}
        >
          {top > 0 ? <View pointerEvents="none" style={{ height: top }} /> : null}
          {children.map((child, index) => (
            // Each page is wrapped under its own key, not its place: when a
            // refresh reorders the feed, a page that moves keeps everything it
            // has built, its buffered video included, instead of starting over.
            <View key={pageKey(child, index)} style={{ height }}>
              {child}
              {index === 0 && top > 0 ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -22, left: -22, right: -22, height: 70, borderTopWidth: 22, borderLeftWidth: 22, borderRightWidth: 22, borderColor: colors.bg, borderTopLeftRadius: 44, borderTopRightRadius: 44 }, capsStyle]} /> : null}
            </View>
          ))}
        </Animated.ScrollView>
      )}
      {/* In the gap the pull opens, under the clock and in front of the feed (the caps above
          the first page would hide anything behind it): the greeting and the disc, which
          draws round as you pull, closes at the line, and turns while it fetches. */}
      {onRefresh ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: insets.top + pullTop, height: PULL_DISC, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 48 }, rowStyle]}>
          {pullHeader}
          <PullDisc gap={gap} disc={disc} line={PULL_LINE} />
        </Animated.View>
      ) : null}
    </View>
  );
});
