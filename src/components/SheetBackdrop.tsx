import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { colors } from '@/theme';

/**
 * The dimmed page behind a bottom sheet. Fades in on its own rather than
 * sliding up with the sheet, so the sheet reads as sitting on top of the page
 * instead of slicing across it.
 */
export function SheetBackdrop() {
  useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity }]} />;
}
