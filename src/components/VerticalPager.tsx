import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, runOnJS, runOnUI, scrollTo, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { BAR_DUCK_PX, barCompact } from '@/features/navigation/barShrink';

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

export const VerticalPager = forwardRef<VerticalPagerHandle, { children: React.ReactNode[]; onIndex: (index: number) => void; /** The page the scroll came to rest on. */ onSettled?: (index: number) => void; initialIndex?: number; /** Pulling down past the first page fetches what is new. */ onRefresh?: () => Promise<void> }>(function VerticalPager({ children, onIndex, onSettled, initialIndex = 0, onRefresh }, ref) {
  const [height, setHeight] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  // Pull-to-refresh, the way Instagram's feels: the whole feed comes down
  // with the finger, its top corners rounding, the spinner waiting in the
  // gap above; past the line it is held there while the fetch runs, then
  // the feed settles back up with the new pages in place.
  const HOLD = 64;
  const PULL_LINE = 72;
  const pullY = useSharedValue(0);
  const held = useSharedValue(0);
  const refreshingRef = useRef(false);
  const refreshNow = useCallback(async () => {
    if (!onRefresh || refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    held.value = withTiming(HOLD, { duration: 180, easing: Easing.out(Easing.cubic) });
    try { await onRefresh(); } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      held.value = withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic) });
    }
  }, [onRefresh, held]);
  const feedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: held.value }] }));
  const firstPageStyle = useAnimatedStyle(() => {
    const down = pullY.value + held.value;
    return { borderTopLeftRadius: down > 2 ? 22 : 0, borderTopRightRadius: down > 2 ? 22 : 0, overflow: 'hidden' as const };
  });
  const gapStyle = useAnimatedStyle(() => {
    const down = pullY.value + held.value;
    return { opacity: Math.min(1, down / 40), transform: [{ translateY: Math.min(HOLD, down) / 2 - 14 }, { rotate: `${Math.min(360, pullY.value * 3)}deg` }] };
  });
  const list = useAnimatedRef<Animated.ScrollView>();
  // Scrolling is asked for on the UI thread, where the list lives.
  const jump = useCallback((y: number, animated: boolean) => {
    const node = list.current as unknown as { scrollTo?: (o: { x: number; y: number; animated: boolean }) => void } | null;
    if (node?.scrollTo) { node.scrollTo({ x: 0, y, animated }); return; }
    runOnUI(() => { 'worklet'; scrollTo(list, 0, y, animated); })();
  }, [list]);
  useImperativeHandle(ref, () => ({ scrollToTop: () => jump(0, true) }), [jump]);
  const last = useRef(initialIndex);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The starting page is read once. The page reports its position as you
  // scroll, and feeding that straight back in as the offset yanked the list
  // to a page edge mid-swipe — the "lands half and half" bug.
  const startIndex = useRef(initialIndex);
  const count = children.length;
  const pageOf = useCallback((y: number) => Math.max(0, Math.min(count - 1, Math.round(y / Math.max(1, height)))), [count, height]);
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

  // Everything per frame stays on the UI thread: the bar follows the swipe
  // (moving on tucks it, coming back lifts it), and only a change of page
  // crosses to the JavaScript side.
  const lastY = useSharedValue(-1);
  const lastIndex = useSharedValue(initialIndex);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const h = e.layoutMeasurement.height || 1;
      pullY.value = y < 0 ? -y : 0;
      if (lastY.value >= 0) {
        const dy = y - lastY.value;
        // A small move follows the finger; a jump of most of a page is a whole page change, which counts fully.
        if (Math.abs(dy) >= h * 0.6) barCompact.value = withTiming(dy > 0 ? 1 : 0, { duration: 200 });
        else if (Math.abs(dy) > 0.3 && y >= 0) barCompact.value = Math.max(0, Math.min(1, barCompact.value + dy / 150));
      }
      lastY.value = y;
      const index = Math.max(0, Math.min(count - 1, Math.round(y / h)));
      if (index !== lastIndex.value) { lastIndex.value = index; runOnJS(changed)(index); }
    },
    onMomentumEnd: (e) => { runOnJS(settled)(e.contentOffset.y); },
    onEndDrag: (e) => { if (e.contentOffset.y < -PULL_LINE) runOnJS(refreshNow)(); runOnJS(dragEnded)(e.contentOffset.y); },
    onMomentumBegin: () => { runOnJS(cancelSettle)(); },
  });

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
      {/* Behind the feed, in the gap it leaves when pulled: the arc as you pull, the spinner while it fetches. */}
      {onRefresh ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: insets.top + 24, left: 0, right: 0, alignItems: 'center' }, gapStyle]}>
          {refreshing ? <ActivityIndicator size="small" color={colors.textMuted} /> : <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2.5, borderColor: colors.textMuted, borderTopColor: 'transparent', opacity: 0.9 }} />}
        </Animated.View>
      ) : null}
      {height > 0 && (
        <Animated.ScrollView
          ref={list}
          style={[{ height }, feedStyle]}
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          disableIntervalMomentum
          contentOffset={{ x: 0, y: startIndex.current * height }}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          bounces={!!onRefresh}
        >
          {children.map((child, index) => index === 0 ? <Animated.View key={index} style={[{ height }, firstPageStyle]}>{child}</Animated.View> : <View key={index} style={{ height }}>{child}</View>)}
        </Animated.ScrollView>
      )}
    </View>
  );
});
