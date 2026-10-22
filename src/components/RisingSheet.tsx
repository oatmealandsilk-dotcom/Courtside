import React, { useEffect, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { HeightGlide } from '@/components/ui/HeightGlide';
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
  const rise = useSharedValue(0);
  const dim = useSharedValue(0);
  const height = useSharedValue(Dimensions.get('window').height * 0.6);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      dim.value = withTiming(1, { duration: SHEET_DIM_IN_MS });
      rise.value = reduce ? withTiming(1, { duration: SHEET_DIM_IN_MS }) : withSpring(1, SHEET_SPRING);
      return;
    }
    dim.value = withTiming(0, { duration: SHEET_DIM_OUT_MS });
    rise.value = withTiming(0, { duration: SHEET_CLOSE_MS, easing: CLOSE_EASE }, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    });
  }, [visible, reduce, rise, dim]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const sheetMotion = useAnimatedStyle(() => (reduce
    ? { opacity: rise.value }
    // Never above where it rests: the spring's faint settle would lift its bottom edge off the screen's.
    : { transform: [{ translateY: Math.max(0, (1 - rise.value) * (height.value + 24)) }] }));
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.page}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, dimStyle]} />
        {/* The dimmed page is its own surface beside the sheet, not around it: a
            button may not hold the sheet's buttons in a browser. */}
        <Pressable accessibilityLabel={closeLabel} onPress={onBackdropPress ?? onClose} style={StyleSheet.absoluteFill} />
        <Animated.View
          pointerEvents={visible ? 'auto' : 'none'}
          onLayout={(e) => { height.value = e.nativeEvent.layout.height; }}
          style={[styles.sheet, sheetStyle, sheetMotion]}
        >
          <HeightGlide duration={220}>{children}</HeightGlide>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxWidth: 520, width: '100%', alignSelf: 'center' },
});
