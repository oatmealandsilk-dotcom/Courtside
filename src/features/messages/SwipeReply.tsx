import React, { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import * as haptics from '@/lib/haptics';
import { colors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { EDGE, REPLY_AT, REPLY_SLOP, arrowShow, replyTravel } from './replySwipe';

/** Back into place: quick and soft, without passing it. */
const SPRING_BACK = { stiffness: 380, damping: 34, mass: 0.9, overshootClamping: true };

/**
 * Around one message's row: a drag that starts mostly to the right moves the
 * message with the finger and shows the reply arrow behind it; letting go
 * past REPLY_AT answers it (see replySwipe.ts). A drag to the left is the
 * times' swipe (MessageTimes), up or down scrolls, and one that starts at
 * the screen's left edge is the page's own Back swipe. The browser's version
 * is SwipeReply.web.tsx.
 */
export function SwipeReply({ enabled = true, onReply, children }: { enabled?: boolean; onReply: () => void; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  const x = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const edge = useSharedValue(false);
  const armed = useSharedValue(false);
  // The latest reply action, so the gesture (made once) always calls the current one.
  const latest = useRef(onReply);
  latest.current = onReply;
  const pan = useMemo(() => {
    const reply = () => latest.current();
    const tick = () => haptics.tap();
    return Gesture.Pan()
      .enabled(enabled)
      .manualActivation(true)
      .onTouchesDown((e) => {
        'worklet';
        const touch = e.allTouches[0];
        if (!touch) return;
        startX.value = touch.absoluteX;
        startY.value = touch.absoluteY;
        edge.value = touch.absoluteX < EDGE;
        armed.value = false;
      })
      .onTouchesMove((e, state) => {
        'worklet';
        const touch = e.allTouches[0];
        if (!touch) return;
        if (edge.value || e.numberOfTouches > 1) { state.fail(); return; }
        const dx = touch.absoluteX - startX.value;
        const dy = touch.absoluteY - startY.value;
        if (dx > REPLY_SLOP && dx > Math.abs(dy) * 1.4) state.activate();
        else if (dx < -REPLY_SLOP || Math.abs(dy) > REPLY_SLOP) state.fail();
      })
      .onUpdate((e) => {
        'worklet';
        x.value = replyTravel(e.translationX - REPLY_SLOP);
        const past = x.value >= REPLY_AT;
        if (past !== armed.value) {
          armed.value = past;
          if (past) runOnJS(tick)();
        }
      })
      .onEnd(() => {
        'worklet';
        if (armed.value) runOnJS(reply)();
      })
      .onFinalize(() => {
        'worklet';
        armed.value = false;
        if (x.value !== 0) x.value = withSpring(0, SPRING_BACK);
      });
  // The shared values are the same objects for the life of the row.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const arrow = useAnimatedStyle(() => {
    const show = arrowShow(x.value);
    return { opacity: show, transform: [{ scale: 0.55 + 0.45 * show + (x.value >= REPLY_AT ? 0.08 : 0) }] };
  });
  if (!enabled) return <>{children}</>;
  return (
    <GestureDetector gesture={pan}>
      <View style={styles.wrap} collapsable={false}>
        <Animated.View pointerEvents="none" style={[styles.arrow, arrow]}>
          <View style={styles.arrowDisc}><Ionicons name="arrow-undo" size={15} color={colors.textMuted} /></View>
        </Animated.View>
        <Animated.View style={moved}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { width: '100%' },
  arrow: { position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center' },
  arrowDisc: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
