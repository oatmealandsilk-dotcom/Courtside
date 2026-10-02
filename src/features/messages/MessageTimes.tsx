import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, ReduceMotion, cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/lib/useReducedMotion';
import { colors, font } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import {
  AnchorContext, RowTimeContext, TIME_COLUMN, TIME_SLOP, bothRefs, roomBeside, shiftFor, slideFor, timeOpacity, travelFor, type Spot,
} from './timeSwipe';

/*
 * Swipe a chat to the left to see when each message was sent (iMessage's
 * way): see timeSwipe.ts. On the phone the finger is followed on the
 * animation thread: the gesture writes one shared number, and nothing in
 * React draws again while the finger moves.
 *
 * Three looks are worked out from that number once per frame and shared by
 * every row that wears them: your messages (moved the whole way), the times
 * (moved and faded in), and, under Reduce Motion, the times beside the
 * bubbles. A long chat adds rows, not work per frame. A message from someone
 * else only follows the number itself when it is wide enough to need to.
 * The browser's version is MessageTimes.web.tsx.
 */

/** Letting go: back into place quickly and softly, without passing it. */
const SPRING_BACK = { stiffness: 320, damping: 36, mass: 1, overshootClamping: true };
/** Letting go under Reduce Motion: nothing moved, so the times just fade away (a fade is not motion). */
const FADE_BACK = { duration: 200, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never };

type SharedLook = ReturnType<typeof useAnimatedStyle<ViewStyle>>;

/** How far the chat is slid right now, the looks every row shares, and whether to fade the times in place instead (Reduce Motion). */
const Reveal = createContext<{
  slide: SharedValue<number>;
  /** Never changes: what a row that has no need to move listens to. */
  idle: SharedValue<number>;
  still: boolean;
  mineLook: SharedLook;
  timeLook: SharedLook;
  besideLook: SharedLook;
} | null>(null);

/**
 * Around the chat's scrolling list. A drag that starts mostly to the left
 * slides the messages; anything else (scrolling, a tap, a hold, the swipe
 * back from the screen's left edge, which goes right) is left alone. Off
 * (`enabled` false) while a message's menu or a photo is open over the chat,
 * so a finger still down from the hold that opened the menu cannot slide
 * the chat underneath it.
 */
export function TimeSwipeArea({ enabled = true, children }: { enabled?: boolean; children: React.ReactNode }) {
  const slide = useSharedValue(0);
  const idle = useSharedValue(0);
  const still = useReducedMotion();
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // Where the finger was when the slide took it, so the messages start from where they are, with no jump.
  const from = useSharedValue(0);
  const taken = useSharedValue(false);
  const pan = useMemo(() => Gesture.Pan()
    // Turning it off mid-slide cancels the slide, and the messages go back.
    .enabled(enabled)
    .manualActivation(true)
    .onTouchesDown((e) => {
      'worklet';
      const touch = e.allTouches[0];
      if (!touch) return;
      startX.value = touch.absoluteX;
      startY.value = touch.absoluteY;
      taken.value = false;
    })
    .onTouchesMove((e, state) => {
      'worklet';
      if (taken.value) return;
      const touch = e.allTouches[0];
      if (!touch) return;
      // Two fingers are a pinch or a zoom, never this.
      if (e.numberOfTouches > 1) { state.fail(); return; }
      const dx = touch.absoluteX - startX.value;
      const dy = touch.absoluteY - startY.value;
      // Mostly sideways, to the left: the slide takes it. Up, down or to the
      // right first: the list scrolls, or the page's back swipe has it.
      if (dx < -TIME_SLOP && -dx > Math.abs(dy) * 1.4) { taken.value = true; state.activate(); }
      else if (dx > TIME_SLOP || Math.abs(dy) > TIME_SLOP) state.fail();
    })
    .onStart((e) => {
      'worklet';
      cancelAnimation(slide);
      from.value = e.translationX + travelFor(slide.value);
    })
    .onUpdate((e) => {
      'worklet';
      slide.value = slideFor(from.value - e.translationX);
    })
    .onFinalize(() => {
      'worklet';
      taken.value = false;
      if (slide.value !== 0) slide.value = still ? withTiming(0, FADE_BACK) : withSpring(0, SPRING_BACK);
    }),
  // The shared values are the same objects for the life of the chat.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [enabled, still]);
  const mineLook = useAnimatedStyle(() => ({ transform: [{ translateX: still ? 0 : -slide.value }] }));
  const timeLook = useAnimatedStyle(() => ({ opacity: timeOpacity(slide.value), transform: [{ translateX: -slide.value }] }));
  const besideLook = useAnimatedStyle(() => ({ opacity: timeOpacity(slide.value) }));
  const reveal = useMemo(
    () => ({ slide, idle, still, mineLook, timeLook, besideLook }),
    [slide, idle, still, mineLook, timeLook, besideLook],
  );
  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }} collapsable={false}>
        <Reveal.Provider value={reveal}>{children}</Reveal.Provider>
      </View>
    </GestureDetector>
  );
}

/**
 * Whatever moves with the messages. With `time`, a message's row: its time
 * waits just past the row's right edge and comes into view as the chat
 * slides. Its parent must be the row's own full-width box, which the time
 * is placed against. Without, a part with no time of its own: "Not sent"
 * under yours moves with it; a sender's name or the typing dots, on the
 * other side, stay put.
 */
export function Slide({ time, mine = false, style, children }: {
  time?: string; mine?: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const reveal = useContext(Reveal);
  if (reveal && time) return <TimedRow reveal={reveal} time={time} mine={mine} style={style}>{children}</TimedRow>;
  if (reveal && mine) return <Animated.View style={[style, reveal.mineLook]}>{children}</Animated.View>;
  return <View style={style}>{children}</View>;
}

function TimedRow({ reveal, time, mine, style, children }: {
  reveal: NonNullable<React.ContextType<typeof Reveal>>; time: string; mine: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const rowRef = useRef<View>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  const report = useCallback((next: Spot) => setSpot((now) => (
    now && now.x === next.x && now.y === next.y && now.w === next.w && now.h === next.h ? now : next
  )), []);
  const anchor = useMemo(() => ({ row: rowRef, report }), [report]);
  const rowTime = useMemo(() => ({ time, mine }), [time, mine]);
  // Someone else's message moves only as far as its time needs; one with room to spare never listens to the slide at all.
  const free = mine ? 0 : roomBeside(spot, rowWidth);
  const source = !mine && !reveal.still && free < TIME_COLUMN ? reveal.slide : reveal.idle;
  const shifted = useAnimatedStyle(() => ({ transform: [{ translateX: -shiftFor(source.value, free) }] }));
  return (
    <>
      <Animated.View
        ref={rowRef}
        style={[style, mine ? reveal.mineLook : shifted]}
        onLayout={mine ? undefined : (e) => setRowWidth(e.nativeEvent.layout.width)}
      >
        <AnchorContext.Provider value={anchor}>
          <RowTimeContext.Provider value={rowTime}>{children}</RowTimeContext.Provider>
        </AnchorContext.Provider>
      </Animated.View>
      {reveal.still ? null : (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.column, spot ? { top: spot.y, height: spot.h } : styles.columnFill, reveal.timeLook]}
        >
          <Text style={styles.time} numberOfLines={1}>{time}</Text>
        </Animated.View>
      )}
    </>
  );
}

/**
 * The box a message's bubble (or photos, or card) sits in. It tells its row
 * where it is, so the time lines up with it. Under Reduce Motion nothing
 * slides: the time fades in beside the bubble instead, on its inner side.
 */
export function TimeAnchor({ ref, style, children }: { ref?: React.Ref<View>; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const anchor = useContext(AnchorContext);
  const row = useContext(RowTimeContext);
  const reveal = useContext(Reveal);
  const own = useRef<View>(null);
  const setRef = useMemo(() => bothRefs(ref, own), [ref]);
  const measure = anchor ? () => {
    const node = own.current;
    const base = anchor.row.current;
    if (!node || !base) return;
    node.measureLayout(base, (x, y, w, h) => anchor.report({ x, y, w, h }), () => undefined);
  } : undefined;
  return (
    <View ref={setRef} collapsable={false} style={style} onLayout={measure}>
      {children}
      {row && reveal?.still ? <Beside time={row.time} mine={row.mine} look={reveal.besideLook} /> : null}
    </View>
  );
}

function Beside({ time, mine, look }: { time: string; mine: boolean; look: SharedLook }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.beside, mine ? styles.besideMine : styles.besideTheirs, look]}>
      <Text style={[styles.time, !mine && styles.timeStart]} numberOfLines={1}>{time}</Text>
    </Animated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  // Just past the row's right edge, as wide as the slide: in view, right-aligned, once the chat has slid over.
  column: { position: 'absolute', left: '100%', width: TIME_COLUMN, justifyContent: 'center', alignItems: 'flex-end', paddingLeft: 6 },
  columnFill: { top: 0, bottom: 0 },
  time: { ...font('400'), fontSize: 12, lineHeight: 16, letterSpacing: 0, color: colors.textFaint, fontVariant: ['tabular-nums'], textAlign: 'right' },
  timeStart: { textAlign: 'left' },
  beside: { position: 'absolute', top: 0, bottom: 0, width: 72, justifyContent: 'center' },
  besideMine: { right: '100%', paddingRight: 8, alignItems: 'flex-end' },
  besideTheirs: { left: '100%', paddingLeft: 8, alignItems: 'flex-start' },
});
