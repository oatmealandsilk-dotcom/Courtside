import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

/**
 * Full-height pages that snap one at a time. The active page changes the
 * moment a swipe crosses the midpoint — not when the scroll settles — so a
 * clip stops the instant it is on its way out and the next one starts early.
 */
export interface VerticalPagerHandle { scrollToTop: () => void }

export const VerticalPager = forwardRef<VerticalPagerHandle, { children: React.ReactNode[]; onIndex: (index: number) => void; initialIndex?: number }>(function VerticalPager({ children, onIndex, initialIndex = 0 }, ref) {
  const [height, setHeight] = useState(0);
  const list = useRef<ScrollView | null>(null);
  useImperativeHandle(ref, () => ({ scrollToTop: () => list.current?.scrollTo({ y: 0, animated: true }) }), []);
  const last = useRef(initialIndex);
  // The starting page is read once. The page reports its position as you
  // scroll, and feeding that straight back in as the offset yanked the list
  // to a page edge mid-swipe — the "lands half and half" bug.
  const startIndex = useRef(initialIndex);
  const report = (y: number) => {
    const index = Math.max(0, Math.min(children.length - 1, Math.round(y / height)));
    if (index !== last.current) { last.current = index; onIndex(index); }
  };
  return (
    <View style={{ flex: 1 }} onLayout={(e) => { const h = e.nativeEvent.layout.height; setHeight((prev) => (prev === 0 || Math.abs(prev - h) > 40 ? h : prev)); }}>
      {height > 0 && (
        <ScrollView
          ref={list}
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          disableIntervalMomentum
          contentOffset={{ x: 0, y: startIndex.current * height }}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(e) => report(e.nativeEvent.contentOffset.y)}
          onMomentumScrollEnd={(e) => report(e.nativeEvent.contentOffset.y)}
        >
          {children.map((child, index) => <View key={index} style={{ height }}>{child}</View>)}
        </ScrollView>
      )}
    </View>
  );
});
