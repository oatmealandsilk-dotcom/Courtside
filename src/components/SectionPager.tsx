import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { activationDistance, claimedDepth, waitsForDeeper } from '@/features/navigation/gestureClaim';
import { isPageSwipeLocked, setPageDragging, subscribePageSwipeLock } from '@/features/navigation/swipeLock';
import { useResponsive } from '@/lib/useResponsive';
import { useTabActive } from '@/features/navigation/tabFocus';

const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);

/**
 * Sections inside a tab (Discussions / Find Players, Posts / Clips / Tagged),
 * kept mounted side by side and slid between on the animation thread — the
 * same idea as the tab row, one level down. Nothing is built mid-drag, so
 * there is nothing to hitch on landing.
 *
 * The pane on show sets the height; the neighbours ride alongside it, clipped
 * to that height until they land. A swipe past the first or last pane is
 * handed up to the tab row when `delegateLeft` / `delegateRight` say so,
 * otherwise the row gives a little and springs back.
 */
export function SectionPager({ index, panes, onIndex, progress, depth = 1, delegateLeft = false, delegateRight = false }: {
  index: number;
  panes: React.ReactNode[];
  onIndex: (next: number) => void;
  /** Written as the finger moves: -1..1 toward the next pane, for an underline to follow. */
  progress?: SharedValue<number>;
  depth?: 1 | 2;
  delegateLeft?: boolean;
  delegateRight?: boolean;
}) {
  const { isPhone } = useResponsive();
  const count = panes.length;
  const last = count - 1;
  const [width, setWidth] = useState(0);
  const widthValue = useSharedValue(1);
  const position = useSharedValue(index);
  const [shown, setShown] = useState(index);
  const shownRef = useRef(index);
  const locked = useSharedValue(false);
  const config = useSharedValue({ enabled: isPhone, delegateLeft, delegateRight, depth, last });
  useEffect(() => { config.value = { enabled: isPhone, delegateLeft, delegateRight, depth, last }; }, [isPhone, delegateLeft, delegateRight, depth, last, config]);
  useEffect(() => {
    locked.value = isPageSwipeLocked();
    return subscribePageSwipeLock(() => { locked.value = isPageSwipeLocked(); });
  }, [locked]);

  // A tap on a tab glides the row; a swipe that already landed there does
  // nothing more; a change while this tab is off screen just jumps.
  const tabActive = useTabActive();
  useEffect(() => {
    if (index === shownRef.current) return;
    shownRef.current = index;
    setShown(index);
    if (Math.abs(position.value - index) <= 0.01) return;
    if (tabActive) position.value = withTiming(index, { duration: 240, easing: EASE });
    else { position.value = index; if (progress) progress.value = 0; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, position]);

  const latest = useRef(onIndex);
  latest.current = onIndex;
  const land = (dest: number) => {
    shownRef.current = dest;
    setShown(dest);
    latest.current(dest);
  };

  const startX = useSharedValue(0);
  const armed = useSharedValue(false);
  const settled = useSharedValue(true);
  const startY = useSharedValue(0);
  const startPosition = useSharedValue(0);
  const pan = useMemo(() => Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e) => {
      'worklet';
      const t = e.allTouches[0];
      if (!t) return;
      startX.value = t.x;
      armed.value = false;
      startY.value = t.y;
    })
    .onTouchesMove((e, state) => {
      'worklet';
      const t = e.allTouches[0];
      if (!t) return;
      const dx = t.x - startX.value;
      const dy = t.y - startY.value;
      const c = config.value;
      if (Math.abs(dx) > activationDistance(c.depth) && Math.abs(dx) > Math.abs(dy) * 1.4) {
        const at = Math.round(position.value);
        const handedOff = (c.delegateRight && dx > 0 && at <= 0) || (c.delegateLeft && dx < 0 && at >= c.last);
        if (!c.enabled || locked.value || handedOff || claimedDepth.value > c.depth + 1) state.fail();
        else if (waitsForDeeper(c.depth) && !armed.value) armed.value = true;
        else { claimedDepth.value = c.depth + 1; state.activate(); }
      } else if (Math.abs(dy) > 12) {
        state.fail();
      }
    })
    .onStart(() => {
      'worklet';
      startPosition.value = position.value;
      settled.value = false;
      runOnJS(setPageDragging)(true);
    })
    .onUpdate((e) => {
      'worklet';
      const c = config.value;
      let next = startPosition.value - e.translationX / widthValue.value;
      if (next < 0) next = next * 0.25;
      if (next > c.last) next = c.last + (next - c.last) * 0.25;
      position.value = next;
      if (progress) progress.value = next - Math.round(startPosition.value);
    })
    .onEnd((e) => {
      'worklet';
      const c = config.value;
      const from = startPosition.value;
      const moved = -e.translationX / widthValue.value;
      const flick = Math.abs(e.translationX) > 28 && Math.abs(e.velocityX) > 350 && Math.sign(e.velocityX) === Math.sign(e.translationX);
      let dest: number;
      if (flick) dest = e.velocityX < 0 ? Math.ceil(from + 0.001) : Math.floor(from - 0.001);
      else if (Math.abs(moved) > 0.28) dest = moved > 0 ? Math.ceil(from + 0.001) : Math.floor(from - 0.001);
      else dest = Math.round(from);
      dest = Math.max(0, Math.min(c.last, dest));
      settled.value = true;
      runOnJS(setPageDragging)(false);
      const duration = 120 + Math.min(160, Math.abs(position.value - dest) * 220);
      if (progress) progress.value = withTiming(dest - Math.round(from), { duration, easing: EASE });
      position.value = withTiming(dest, { duration, easing: EASE }, (finished) => {
        if (finished) runOnJS(land)(dest);
      });
    })
    .onFinalize(() => {
      'worklet';
      if (claimedDepth.value === config.value.depth + 1) claimedDepth.value = 0;
      if (!settled.value) {
        // Cancelled mid-drag: no end came, so settle to the nearest pane here.
        settled.value = true;
        const dest = Math.max(0, Math.min(config.value.last, Math.round(position.value)));
        runOnJS(setPageDragging)(false);
        if (progress) progress.value = withTiming(dest - Math.round(startPosition.value), { duration: 160, easing: EASE });
        position.value = withTiming(dest, { duration: 160, easing: EASE }, (finished) => {
          if (finished) runOnJS(land)(dest);
        });
      }
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: -position.value * widthValue.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e) => { const w = e.nativeEvent.layout.width; setWidth(w); widthValue.value = w || 1; }} style={{ overflow: 'hidden' }}>
        <Animated.View style={[{ flexDirection: 'row', width: width ? width * count : undefined }, row]}>
          {panes.map((pane, i) => (
            // All panes stay in the row at their own height: the strip is as
            // tall as the tallest, and landing never re-lays the page out —
            // which is what made fast back-and-forth swiping hitch.
            <View key={i} style={{ width: width || undefined }} pointerEvents={i === shown ? 'auto' : 'none'}>
              {pane}
            </View>
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
