import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { runOnJS, useAnimatedScrollHandler, useSharedValue, withTiming } from 'react-native-reanimated';
import { barCompact } from '@/features/navigation/barShrink';

/**
 * Full-height pages that snap one at a time. The active page changes the
 * moment a swipe crosses the midpoint — not when the scroll settles — so a
 * clip stops the instant it is on its way out and the next one starts early.
 */
export interface VerticalPagerHandle { scrollToTop: () => void }

export const VerticalPager = forwardRef<VerticalPagerHandle, { children: React.ReactNode[]; onIndex: (index: number) => void; /** The page the scroll came to rest on. */ onSettled?: (index: number) => void; initialIndex?: number }>(function VerticalPager({ children, onIndex, onSettled, initialIndex = 0 }, ref) {
  const [height, setHeight] = useState(0);
  const list = useRef<ScrollView | null>(null);
  useImperativeHandle(ref, () => ({ scrollToTop: () => list.current?.scrollTo({ y: 0, animated: true }) }), []);
  const last = useRef(initialIndex);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The starting page is read once. The page reports its position as you
  // scroll, and feeding that straight back in as the offset yanked the list
  // to a page edge mid-swipe — the "lands half and half" bug.
  const startIndex = useRef(initialIndex);
  const report = useCallback((y: number) => {
    const index = Math.max(0, Math.min(children.length - 1, Math.round(y / height)));
    if (index !== last.current) { last.current = index; onIndex(index); }
  }, [children.length, height, onIndex]);
  // The bottom bar follows the swipe, frame for frame, the way it follows a
  // page's scroll elsewhere: moving on tucks it, coming back lifts it.
  // Position as a fraction of a page. The bar ducking changes the pager's
  // height, which shifts the pixel position on its own; fractions stay put,
  // so that shift never reads as a swipe (which would lift the bar again).
  const lastFrac = useSharedValue(-1);
  const lastH = useSharedValue(0);
  const hush = useCallback(() => { lastFrac.value = -1; }, [lastFrac]);
  const settled = useCallback((y: number) => {
    report(y);
    onSettled?.(last.current);
    // Land exactly on the page edge, whatever the bar did to the height mid-flick.
    const target = last.current * height;
    if (Math.abs(y - target) > 1) { hush(); list.current?.scrollTo({ y: target, animated: false }); }
  }, [report, onSettled, height]);
  const dragEnded = useCallback((y: number) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => { settleTimer.current = null; settled(y); }, 140);
  }, [settled]);
  const cancelSettle = useCallback(() => { if (settleTimer.current) { clearTimeout(settleTimer.current); settleTimer.current = null; } }, []);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const h = e.layoutMeasurement.height || 1;
      const frac = y / h;
      const resized = lastH.value !== 0 && lastH.value !== h;
      lastH.value = h;
      if (lastFrac.value < 0 || resized) { lastFrac.value = frac; runOnJS(report)(y); return; }
      const dy = (frac - lastFrac.value) * h;
      lastFrac.value = frac;
      // A small move follows the finger; a jump of most of a page is a whole page change, which counts fully.
      if (Math.abs(dy) >= height * 0.6) barCompact.value = withTiming(dy > 0 ? 1 : 0, { duration: 200 });
      else if (Math.abs(dy) > 0.3 && y >= 0) barCompact.value = Math.max(0, Math.min(1, barCompact.value + dy / 150));
      runOnJS(report)(y);
    },
    onMomentumEnd: (e) => { runOnJS(settled)(e.contentOffset.y); },
    onEndDrag: (e) => { runOnJS(dragEnded)(e.contentOffset.y); },
    onMomentumBegin: () => { runOnJS(cancelSettle)(); },
  });
  return (
    <View style={{ flex: 1 }} onLayout={(e) => {
      // The bar ducking changes this height by a few points; the pages take
      // the new size and the list is put back on the same page at once.
      const h = e.nativeEvent.layout.height;
      if (h <= 0) return;
      setHeight((prev) => {
        if (prev !== 0 && prev !== h) { hush(); requestAnimationFrame(() => list.current?.scrollTo({ y: last.current * h, animated: false })); }
        return h;
      });
    }}>
      {height > 0 && (
        <Animated.ScrollView
          ref={list as never}
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          disableIntervalMomentum
          contentOffset={{ x: 0, y: startIndex.current * height }}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
        >
          {children.map((child, index) => <View key={index} style={{ height }}>{child}</View>)}
        </Animated.ScrollView>
      )}
    </View>
  );
});
