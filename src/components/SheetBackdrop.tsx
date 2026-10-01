import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { colors } from '@/theme';

/**
 * The dimmed page behind a bottom sheet. Fades in on its own rather than
 * sliding up with the sheet, so the sheet reads as sitting on top of the page
 * instead of slicing across it. `leaving` fades it back out with the sheet's
 * exit, so the page brightens the moment you tap away, not after.
 */
export function SheetBackdrop({ leaving = false }: { leaving?: boolean }) {
  useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: leaving ? 0 : 1, duration: leaving ? 180 : 220, useNativeDriver: true }).start();
  }, [opacity, leaving]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity }]} />;
}
