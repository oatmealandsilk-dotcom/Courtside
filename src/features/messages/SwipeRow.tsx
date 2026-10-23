import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { ACTION_W, ROW_SLOP, rowTravel } from './rowSwipe';

const SPRING = { stiffness: 420, damping: 38, mass: 0.9, overshootClamping: true };

/**
 * An inbox row that slides (see rowSwipe.ts). `actions` sit under its right
 * end (Mute, Delete), uncovered by a drag to the left. A drag to the right
 * on a closed row is let go at once, so the screen's own full-width back
 * swipe has it (iOS 26's, or PageSwipeBack's on older iPhones) and the whole
 * inbox follows the finger; on an open row it closes the row. Only one row is open at a time: `open` says whether this
 * one is, `onOpen` tells the list. The browser's version is SwipeRow.web.tsx.
 */
export function SwipeRow({ actions, actionCount, open, onOpen, children }: {
  actions: React.ReactNode; actionCount: number;
  open: boolean; onOpen: (open: boolean) => void; children: React.ReactNode;
}) {
  const x = useSharedValue(0);
  const from = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const width = actionCount * ACTION_W;
  const latest = useRef({ onOpen });
  latest.current = { onOpen };
  // Another row opened (or the list scrolled): this one closes.
  useEffect(() => { if (!open && x.value !== 0) x.value = withSpring(0, SPRING); }, [open, x]);
  const pan = useMemo(() => {
    const opened = (o: boolean) => latest.current.onOpen(o);
    return Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((e) => {
        'worklet';
        const t = e.allTouches[0];
        if (!t) return;
        sx.value = t.absoluteX; sy.value = t.absoluteY;
      })
      .onTouchesMove((e, state) => {
        'worklet';
        const t = e.allTouches[0];
        if (!t) return;
        const dx = t.absoluteX - sx.value;
        const dy = t.absoluteY - sy.value;
        if (Math.abs(dx) > ROW_SLOP && Math.abs(dx) > Math.abs(dy) * 1.4) {
          // Rightward on a closed row: the page's back swipe.
          if (dx > 0 && x.value === 0) { state.fail(); return; }
          state.activate();
        } else if (Math.abs(dy) > ROW_SLOP) state.fail();
      })
      .onStart(() => { 'worklet'; from.value = x.value; })
      .onUpdate((e) => {
        'worklet';
        x.value = rowTravel(from.value + e.translationX, width);
      })
      .onEnd((e) => {
        'worklet';
        const openIt = x.value < -width / 2 || (e.velocityX < -500 && x.value < 0);
        x.value = withSpring(openIt ? -width : 0, SPRING);
        runOnJS(opened)(openIt);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);
  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const actionsLook = useAnimatedStyle(() => ({ opacity: x.value < -4 ? 1 : 0 }));
  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={styles.wrap}>
        {/* Out of a screen reader's reach while the row covers them (the row's own actions offer the same). */}
        <Animated.View
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
          style={[styles.actions, { width }, actionsLook]}
        >
          {actions}
        </Animated.View>
        <Animated.View style={moved}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  actions: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
});
