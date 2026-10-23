import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { HeightGlide } from '@/components/ui/HeightGlide';
import { SwipeArea } from '@/features/navigation/swipePress';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { colors } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { SHEET_CLOSE_CURVE, SHEET_CLOSE_MS, SHEET_DIM_IN_MS, SHEET_DIM_OUT_MS, SHEET_SPRING } from '@/theme/motion';

const CLOSE_EASE = Easing.bezier(...SHEET_CLOSE_CURVE);

/**
 * The one motion every small "•••" sheet shares (Oct 22 sweep, item 10): a
 * player's profile menu, a group's and a coach's menu, Messages' hold menu
 * and its Mute durations. The page behind dims in while the sheet rises from
 * the bottom on the sheet spring, and on close the sheet drops away on a quick
 * ease-in as the dim lifts — the same numbers as every other sheet
 * (theme/motion). They used to fade in where they sat.
 *
 * The Modal stays up until the sheet has left, so a close is seen, not cut.
 * When the sheet's rows change while it is open (the hold menu turning into
 * Mute's durations), its top edge glides to the new height.
 *
 * With Reduce Motion the sheet only fades. Nothing here is glass.
 */
export function RisingSheet({ visible, onClose, onBackdropPress, closeLabel = 'Close', sheetStyle, children }: {
  visible: boolean;
  /** Android's Back. */
  onClose: () => void;
  /** A tap on the dimmed page (defaults to onClose). */
  onBackdropPress?: () => void;
  /** What a screen reader calls the dimmed page. */
  closeLabel?: string;
  /** The card's own look (colour, corners, padding). */
  sheetStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  useTheme();
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  // Up and still: the sheet's and the dim's resting look is then said by plain styles as well
  // (AT_REST below), so an iPhone that drops the settled animation values (Reanimated keeps the
  // first frame's, off screen and clear) can never send an open sheet away on a later re-render.
  const [up, setUp] = useState(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // (A close that landed just as it was opened again leaves it up.)
  const gone = useCallback(() => { if (visibleRef.current) return; setMounted(false); setUp(false); }, []);
  const rise = useSharedValue(0);
  const dim = useSharedValue(0);
  const height = useSharedValue(Dimensions.get('window').height);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      dim.value = withTiming(1, { duration: SHEET_DIM_IN_MS });
      const done = (finished?: boolean) => { 'worklet'; if (finished) runOnJS(setUp)(true); };
      rise.value = reduce ? withTiming(1, { duration: SHEET_DIM_IN_MS }, done) : withSpring(1, SHEET_SPRING, done);
      return;
    }
    // Gone once it has left, and only then not at rest: the draw that starts a close keeps the plain
    // resting look (the close's own values win over it as they run), so it never blinks to the first
    // frame's look (off screen, clear) for a moment before dropping away.
    dim.value = withTiming(0, { duration: SHEET_DIM_OUT_MS });
    rise.value = withTiming(0, { duration: SHEET_CLOSE_MS, easing: CLOSE_EASE }, (finished) => {
      if (finished) runOnJS(gone)();
    });
  }, [visible, reduce, rise, dim, gone]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  // Phones only: Reanimated's settled-value handling is native-only, and in a browser a resting style
  // dropped on close would be written for a frame before the close animation's first.
  const atRest = up && Platform.OS !== 'web';
  const sheetMotion = useAnimatedStyle(() => (reduce
    ? { opacity: rise.value }
    // Never above where it rests: the spring's faint settle would lift its bottom edge off the screen's.
    : { transform: [{ translateY: Math.max(0, (1 - rise.value) * (height.value + 24)) }] }));
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}><SwipeArea on={false}>
      {/* A sheet opened from a tab presses at once: the tab's swipe press wait stops at the sheet (swipePress). */}
      <View style={styles.page}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, dimStyle, atRest && DIM_AT_REST]} />
        {/* The dimmed page is its own surface beside the sheet, not around it: a
            button may not hold the sheet's buttons in a browser. */}
        <Pressable accessibilityLabel={closeLabel} onPress={onBackdropPress ?? onClose} style={StyleSheet.absoluteFill} />
        <Animated.View
          pointerEvents={visible ? 'auto' : 'none'}
          onLayout={(e) => { height.value = e.nativeEvent.layout.height; }}
          style={[styles.sheet, sheetStyle, sheetMotion, atRest && (reduce ? FADE_AT_REST : SHEET_AT_REST)]}
        >
          <HeightGlide duration={220}>{children}</HeightGlide>
        </Animated.View>
      </View>
    </SwipeArea></Modal>
  );
}

/** Where the sheet and the dim rest once up: placed after the animated styles, so they win at rest. */
const DIM_AT_REST = { opacity: 1 } as const;
const SHEET_AT_REST = { transform: [{ translateY: 0 }] };
const FADE_AT_REST = { opacity: 1 } as const;

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxWidth: 520, width: '100%', alignSelf: 'center' },
});
