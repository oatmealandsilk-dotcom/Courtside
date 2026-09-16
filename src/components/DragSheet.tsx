import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radius } from '@/theme';

const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
const FLICK_PX_PER_S = 700;

/**
 * A card sheet with exactly two places the drag handle can leave it: open
 * all the way (near the top of the screen, the page behind still peeking
 * above it) or closed. It rises to a middle height on its own when it
 * appears — that opening height is never a place a drag settles back onto,
 * only a starting point; every drag on the handle resolves to fully open or
 * fully gone.
 */
export function DragSheet({
  header,
  children,
  onDismissed,
  peekFraction = 0.66,
  closeSignal = 0,
}: {
  /** Rendered inside the draggable strip, above `children` — a title row, usually. */
  header: React.ReactNode;
  children: React.ReactNode;
  /** Called once the close animation has finished; the screen does the actual navigation back. */
  onDismissed: () => void;
  /** How tall the sheet opens at first, as a fraction of the screen. */
  peekFraction?: number;
  /** Bump this number to close the sheet from outside (a Close button, a finished send). */
  closeSignal?: number;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // A sliver of the page behind stays visible even fully "open" — the depth
  // cue Apple's own card sheets use instead of ever truly covering the screen.
  const fullHeight = Math.max(1, windowHeight - insets.top - 20);
  const peekHeight = Math.min(fullHeight, Math.round(windowHeight * peekFraction));
  const openOffset = fullHeight - peekHeight;

  // Distance the sheet's TOP edge sits below where "fully open" would put it:
  // 0 = open all the way, openOffset = the height it starts at, fullHeight = gone.
  // The sheet is drawn as a card of height (fullHeight − translateY) pinned to
  // the bottom edge, rather than a full-height card slid down — so the bottom
  // of its body (a comment box, a send button) is always on screen.
  const translateY = useSharedValue(fullHeight);
  const backdropOpacity = useSharedValue(0);
  const dismissedRef = useRef(false);

  useEffect(() => {
    translateY.value = withTiming(openOffset, { duration: 320, easing: EASE });
    backdropOpacity.value = withTiming(1, { duration: 320, easing: EASE });
    // Only the opening height depends on these; re-running on resize would
    // fight a drag in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDismissed();
  };
  const dismiss = () => {
    translateY.value = withTiming(fullHeight, { duration: 220, easing: EASE }, (done) => {
      if (done) runOnJS(finish)();
    });
    backdropOpacity.value = withTiming(0, { duration: 200, easing: EASE });
  };
  const openFull = () => {
    translateY.value = withTiming(0, { duration: 260, easing: EASE });
    backdropOpacity.value = withTiming(1, { duration: 260, easing: EASE });
  };
  const returnTo = (origin: number) => {
    translateY.value = withTiming(origin, { duration: 220, easing: EASE });
    backdropOpacity.value = withTiming(1 - origin / fullHeight, { duration: 220, easing: EASE });
  };
  // The keyboard: the sheet opens all the way and lifts its bottom edge to
  // sit on top of the keyboard, so a box at the bottom of it stays in view.
  const sheetRef = useRef<View>(null);
  const [keyboardPad, setKeyboardPad] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      openFull();
      const keyboardTop = windowHeight - e.endCoordinates.height;
      sheetRef.current?.measureInWindow((_x, y, _w, h) => {
        // The sheet is measured while it may still be rising; its bottom edge does not move, which is all this needs.
        setKeyboardPad(Math.max(0, y + h - keyboardTop));
      });
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardPad(0));
    return () => { show.remove(); hide.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowHeight]);

  const closeCount = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal === closeCount.current) return;
    closeCount.current = closeSignal;
    dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);

  const startY = useSharedValue(0);
  const pan = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      'worklet';
      const next = Math.max(0, Math.min(fullHeight, startY.value + e.translationY));
      translateY.value = next;
      backdropOpacity.value = 1 - next / fullHeight;
    })
    .onEnd((e) => {
      'worklet';
      const origin = startY.value;
      const travelled = translateY.value - origin;
      if (e.velocityY > FLICK_PX_PER_S || (travelled > 0 && travelled > (fullHeight - origin) * 0.32)) {
        runOnJS(dismiss)();
      } else if (e.velocityY < -FLICK_PX_PER_S || (travelled < 0 && Math.abs(travelled) > origin * 0.32)) {
        runOnJS(openFull)();
      } else {
        runOnJS(returnTo)(origin);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ height: Math.max(0, fullHeight - translateY.value) }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={dismiss} />
      <Animated.View ref={sheetRef} style={[styles.sheet, sheetStyle]}>
        <GestureDetector gesture={pan}>
          <View style={styles.handle}>
            <View style={styles.grabber} />
            {header}
          </View>
        </GestureDetector>
        <View style={[styles.body, { paddingBottom: keyboardPad }]}>{children}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 28, shadowOffset: { width: 0, height: -10 }, elevation: 16,
  },
  handle: { paddingTop: 10, gap: 10 },
  grabber: { width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong, alignSelf: 'center' },
  body: { flex: 1, minHeight: 0 },
});
