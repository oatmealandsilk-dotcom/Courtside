import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { colors } from '@/theme';
import { SHEET_DIM_IN_MS, SHEET_DIM_OUT_MS } from '@/theme/motion';

/**
 * The dimmed page behind a bottom sheet. Fades in on its own rather than
 * sliding up with the sheet, so the sheet reads as sitting on top of the page
 * instead of slicing across it. `leaving` fades it back out with the sheet's
 * exit, so the page brightens the moment you tap away, not after.
 * `shown` starts it already dim: a sheet handed over from the one before
 * (the Session sheet growing into a session's "Log it" page, Oct 16), whose
 * dim was there all along, so the page behind never brightens in between.
 */
export function SheetBackdrop({ leaving = false, shown = false }: { leaving?: boolean; shown?: boolean }) {
  useTheme();
  const opacity = useRef(new Animated.Value(shown ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: leaving ? 0 : 1, duration: leaving ? SHEET_DIM_OUT_MS : SHEET_DIM_IN_MS, useNativeDriver: true }).start();
  }, [opacity, leaving]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity }]} />;
}
