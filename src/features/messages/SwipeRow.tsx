import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import * as haptics from '@/lib/haptics';
import { ACTION_W, FIRE_AT, ROW_EDGE, ROW_SLOP, rowTravel } from './rowSwipe';

const SPRING = { stiffness: 420, damping: 38, mass: 0.9, overshootClamping: true };

/**
 * An inbox row that slides (see rowSwipe.ts). `actions` sit under its right
 * end (Mute, Delete), uncovered by a drag to the left; `mark` sits under its
 * left end, and a drag to the right past FIRE_AT runs `onMark` (read or
 * unread) as the row springs back. Only one row is open at a time: `open`
 * says whether this one is, `onOpen` tells the list. The browser's version
 * is SwipeRow.web.tsx.
 */
export function SwipeRow({ actions, actionCount, mark, onMark, open, onOpen, children }: {
  actions: React.ReactNode; actionCount: number; mark: React.ReactNode; onMark: () => void;
  open: boolean; onOpen: (open: boolean) => void; children: React.ReactNode;
}) {
  const x = useSharedValue(0);
  const from = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const edge = useSharedValue(false);
  const armed = useSharedValue(false);
  const width = actionCount * ACTION_W;
  const latest = useRef({ onMark, onOpen });
  latest.current = { onMark, onOpen };
  // Another row opened (or the list scrolled): this one closes.
  useEffect(() => { if (!open && x.value !== 0) x.value = withSpring(0, SPRING); }, [open, x]);
  const pan = useMemo(() => {
    const fire = () => latest.current.onMark();
    const opened = (o: boolean) => latest.current.onOpen(o);
    const tick = () => haptics.tap();
    return Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((e) => {
        'worklet';
        const t = e.allTouches[0];
        if (!t) return;
        sx.value = t.absoluteX; sy.value = t.absoluteY;
        edge.value = t.absoluteX < ROW_EDGE && x.value === 0;
      })
      .onTouchesMove((e, state) => {
        'worklet';
        const t = e.allTouches[0];
        if (!t) return;
        const dx = t.absoluteX - sx.value;
        const dy = t.absoluteY - sy.value;
        if (Math.abs(dx) > ROW_SLOP && Math.abs(dx) > Math.abs(dy) * 1.4) {
          if (edge.value && dx > 0) { state.fail(); return; }
          state.activate();
        } else if (Math.abs(dy) > ROW_SLOP) state.fail();
      })
      .onStart(() => { 'worklet'; from.value = x.value; armed.value = false; })
      .onUpdate((e) => {
        'worklet';
        x.value = rowTravel(from.value + e.translationX, width, FIRE_AT + 30);
        const past = x.value >= FIRE_AT;
        if (past !== armed.value) { armed.value = past; if (past) runOnJS(tick)(); }
      })
      .onEnd((e) => {
        'worklet';
        if (armed.value) { runOnJS(fire)(); x.value = withSpring(0, SPRING); runOnJS(opened)(false); return; }
        const openIt = x.value < -width / 2 || (e.velocityX < -500 && x.value < 0);
        x.value = withSpring(openIt ? -width : 0, SPRING);
        runOnJS(opened)(openIt);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);
  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const markLook = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, x.value / FIRE_AT)), transform: [{ scale: x.value >= FIRE_AT ? 1.08 : 0.85 + 0.15 * Math.min(1, x.value / FIRE_AT) }] }));
  const actionsLook = useAnimatedStyle(() => ({ opacity: x.value < -4 ? 1 : 0 }));
  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={styles.wrap}>
        <Animated.View pointerEvents="none" style={[styles.mark, markLook]}>{mark}</Animated.View>
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
  mark: { position: 'absolute', left: 0, top: 0, bottom: 0, width: FIRE_AT + 30, alignItems: 'center', justifyContent: 'center' },
  actions: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
});
