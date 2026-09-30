import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { colors, radius } from '@/theme';
import { Wash } from '@/components/Wash';

const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
/** Out of the way fast: a quick ease-in, the way a card is tossed down. */
const EASE_OUT_OF_VIEW = Easing.bezier(0.4, 0, 1, 1);
/** Apple's sheets rise on a spring: quick, with the faintest settle at the top. */
const SPRING = { damping: 24, stiffness: 240, mass: 0.9, overshootClamping: false } as const;
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
  /** On a computer the sheet is a box sized to its contents (see the .web twin); a phone ignores it. */
  fitContent?: boolean;
  /** On a wide computer screen the sheet docks to the right (see the .web twin); a phone ignores it. */
  side?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
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
    translateY.value = withSpring(openOffset, SPRING);
    backdropOpacity.value = withTiming(1, { duration: 260, easing: EASE });
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
    translateY.value = withTiming(fullHeight, { duration: 230, easing: EASE_OUT_OF_VIEW }, (done) => {
      if (done) runOnJS(finish)();
    });
    backdropOpacity.value = withTiming(0, { duration: 210, easing: EASE });
  };
  const openFull = () => {
    translateY.value = withSpring(0, SPRING);
    backdropOpacity.value = withTiming(1, { duration: 240, easing: EASE });
  };
  const returnTo = (origin: number) => {
    translateY.value = withSpring(origin, SPRING);
    backdropOpacity.value = withTiming(1 - origin / fullHeight, { duration: 220, easing: EASE });
  };
  // The keyboard: the sheet opens all the way, and its bottom rides up with
  // the keyboard frame by frame (the phone reports its height as it moves),
  // so a box at the bottom stays right on top of it, never jumping after it.
  const keyboard = useAnimatedKeyboard();
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const show = Keyboard.addListener(showEvent, () => openFull());
    return () => { show.remove(); };
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
  // Clear of the home bar when the keyboard is down; on top of the keyboard when it is up.
  const bodyStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(keyboard.height.value, insets.bottom) }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={dismiss} />
      <Animated.View style={[styles.sheet, sheetStyle]}>
        {/* The same warm glow the pages open with, so a sheet reads as part of the app. */}
        <Wash height={300} strength={0.85} />
        <GestureDetector gesture={pan}>
          <View style={styles.handle}>
            <View style={styles.grabber} />
            {header}
          </View>
        </GestureDetector>
        <Animated.View style={[styles.body, bodyStyle]}>{children}</Animated.View>
      </Animated.View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
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
