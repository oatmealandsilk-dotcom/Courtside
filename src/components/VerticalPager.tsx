import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { CourtSpinner } from '@/components/CourtSpinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, runOnJS, runOnUI, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { BAR_DUCK_PX, barCompact } from '@/features/navigation/barShrink';
import * as haptics from '@/lib/haptics';
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

// Pull-to-refresh. A blank strip this tall sits above the first page, and
// the feed normally rests scrolled just past it. Pulling down scrolls the
// strip into view — an ordinary scroll, nothing bounced or faked — with the
// disc waiting behind it. Let go past the line and the feed glides to the
// strip's top and stays there while the fetch runs; when the new pages are
// in, it glides back. Every move is the scroller's own, so nothing jumps.
const HOLD = 132;
// Past halfway the scroller's own snap settles at the strip's top; that is the line.
const PULL_LINE = HOLD / 2;

export const VerticalPager = forwardRef<VerticalPagerHandle, { children: React.ReactNode[]; onIndex: (index: number) => void; /** The page the scroll came to rest on. */ onSettled?: (index: number) => void; initialIndex?: number; /** Pulling down past the first page fetches what is new. */ onRefresh?: () => Promise<void>; /** Shown in the gap the pull opens, beside the disc. */ pullHeader?: React.ReactNode }>(function VerticalPager({ children, onIndex, onSettled, initialIndex = 0, onRefresh, pullHeader }, ref) {
  const [height, setHeight] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [scrollLocked, setScrollLocked] = useState(false);
  const insets = useSafeAreaInsets();
  // Where the first page starts: past the pull strip when there is one.
  const top = onRefresh ? HOLD : 0;
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

  const pullY = useSharedValue(0);
  const refreshingRef = useRef(false);
  // The glide back after a refresh is driven frame by frame on the animation
  // thread — one long ease-out, rather than the scroller's own short hop.
  const glide = useSharedValue(0);
  const gliding = useSharedValue(false);
  useAnimatedReaction(() => glide.value, (v, prev) => { if (gliding.value && v !== prev) scrollTo(list, 0, v, false); }, []);
  const refreshNow = useCallback(async () => {
    if (!onRefresh || refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setScrollLocked(true);
    // The snap is already carrying the feed to the strip's top; it stays there.
    try { await onRefresh(); } finally {
      // Back to the first page in one glide. The finger is free again the
      // moment the glide starts — a swipe mid-glide just carries on from it —
      // and the disc goes once the page is home.
      haptics.tap();
      setScrollLocked(false);
      runOnUI(() => {
        'worklet';
        gliding.value = true;
        glide.value = 0;
        glide.value = withTiming(HOLD, { duration: 760, easing: Easing.out(Easing.poly(4)) }, () => { gliding.value = false; });
      })();
      // Nothing re-draws until the glide has landed.
      setTimeout(() => { refreshingRef.current = false; setRefreshing(false); }, 800);
    }
  }, [onRefresh, list]);
  // Whether the strip is in view. While it is, the first page's top corners
  // look rounded — drawn as caps laid over the corners, never by clipping the
  // page: a clipped box around a native video froze the picture while the
  // sound ran on.
  const [pulled, setPulled] = useState(false);
  useAnimatedReaction(() => pullY.value > 2, (now, before) => { if (now !== before) runOnJS(setPulled)(now); }, []);
  const gapStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, pullY.value / 40) }));

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
  const dragEnded = useCallback((y: number) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => { settleTimer.current = null; settled(y); }, 140);
  }, [settled]);
  const cancelSettle = useCallback(() => { if (settleTimer.current) { clearTimeout(settleTimer.current); settleTimer.current = null; } }, []);
  // A small tick the moment the pull crosses the line.
  const armed = useSharedValue(false);
  const tick = useCallback(() => haptics.tap(), []);

  // Everything per frame stays on the UI thread: the bar follows the swipe
  // (moving on tucks it, coming back lifts it), and only a change of page
  // crosses to the JavaScript side.
  const lastY = useSharedValue(-1);
  const lastIndex = useSharedValue(initialIndex);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const h = e.layoutMeasurement.height || 1;
      pullY.value = y < top ? top - y : 0;
      if (top > 0) {
        const past = pullY.value >= PULL_LINE;
        if (past && !armed.value) { armed.value = true; runOnJS(tick)(); }
        else if (!past && armed.value) armed.value = false;
      }
      if (lastY.value >= 0) {
        const dy = y - lastY.value;
        // A small move follows the finger; a jump of most of a page is a whole page change, which counts fully.
        if (Math.abs(dy) >= h * 0.6) barCompact.value = withTiming(dy > 0 ? 1 : 0, { duration: 200 });
        else if (Math.abs(dy) > 0.3 && y >= top) barCompact.value = Math.max(0, Math.min(1, barCompact.value + dy / 150));
      }
      lastY.value = y;
      const index = Math.max(0, Math.min(count - 1, Math.round((y - top) / h)));
      if (index !== lastIndex.value) { lastIndex.value = index; runOnJS(changed)(index); }
    },
    onMomentumEnd: (e) => { runOnJS(settled)(e.contentOffset.y); },
    onEndDrag: (e) => {
      const y = e.contentOffset.y;
      if (top > 0 && y < top - PULL_LINE) runOnJS(refreshNow)();
      runOnJS(dragEnded)(y);
    },
    onMomentumBegin: () => { runOnJS(cancelSettle)(); },
  });

  // The places the scroller may rest: each page's top, measured past the strip.
  const snapOffsets = useMemo(() => [...(top > 0 ? [0] : []), ...children.map((_, i) => top + i * height)], [children, top, height]);

  return (
    <View style={{ flex: 1 }} onLayout={(e) => {
      // Pages are sized for the bar at its smallest, whatever the bar is
      // doing at this moment. A page is then always at least as tall as the
      // room, so the next page never peeks in at the bottom; with the bar
      // at full size the last few points sit under it, and pages keep that
      // much clear.
      const h = e.nativeEvent.layout.height + BAR_DUCK_PX * (1 - barCompact.value);
      if (h <= 0) return;
      setHeight((prev) => {
        if (prev !== 0 && Math.abs(prev - h) < RESIZE_MIN) return prev;
        if (prev !== 0) requestAnimationFrame(() => jump(last.current * h, false));
        return h;
      });
    }}>
      {/* Behind the feed, in the strip the pull reveals (below the status bar, above where the
          held page starts): the arc as you pull, the disc while it fetches. */}
      {onRefresh ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: insets.top, height: HOLD - insets.top, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 48, paddingBottom: 10 }, gapStyle]}>
          {pullHeader}
          {pulled || refreshing ? <CourtSpinner size={28} /> : null}
        </Animated.View>
      ) : null}
      {height > 0 && (
        <Animated.ScrollView
          ref={list}
          style={{ height }}
          snapToOffsets={snapOffsets}
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
          {top > 0 ? <View pointerEvents="none" style={{ height: HOLD }} /> : null}
          {children.map((child, index) => (
            <View key={index} style={{ height }}>
              {child}
              {index === 0 && pulled ? <View pointerEvents="none" style={{ position: 'absolute', top: -22, left: -22, right: -22, height: 70, borderTopWidth: 22, borderLeftWidth: 22, borderRightWidth: 22, borderColor: colors.bg, borderTopLeftRadius: 44, borderTopRightRadius: 44 }} /> : null}
            </View>
          ))}
        </Animated.ScrollView>
      )}
    </View>
  );
});
