import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { runOnJS, runOnUI, scrollTo, useAnimatedRef, useAnimatedScrollHandler, useSharedValue, withTiming } from 'react-native-reanimated';
import { barCompact } from '@/features/navigation/barShrink';

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

export const VerticalPager = forwardRef<VerticalPagerHandle, { children: React.ReactNode[]; onIndex: (index: number) => void; /** The page the scroll came to rest on. */ onSettled?: (index: number) => void; initialIndex?: number }>(function VerticalPager({ children, onIndex, onSettled, initialIndex = 0 }, ref) {
  const [height, setHeight] = useState(0);
  const list = useAnimatedRef<Animated.ScrollView>();
  // Scrolling is asked for on the UI thread, where the list lives.
  const jump = useCallback((y: number, animated: boolean) => { runOnUI(() => { 'worklet'; scrollTo(list, 0, y, animated); })(); }, [list]);
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
    onEndDrag: (e) => { runOnJS(dragEnded)(e.contentOffset.y); },
    onMomentumBegin: () => { runOnJS(cancelSettle)(); },
  });

  return (
    <View style={{ flex: 1 }} onLayout={(e) => {
      const h = e.nativeEvent.layout.height;
      if (h <= 0) return;
      setHeight((prev) => {
        if (prev !== 0 && Math.abs(prev - h) < RESIZE_MIN) return prev;
        if (prev !== 0) requestAnimationFrame(() => jump(last.current * h, false));
        return h;
      });
    }}>
      {height > 0 && (
        <Animated.ScrollView
          ref={list}
          style={{ height }}
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
