import { useTheme } from '@/theme/ThemeProvider';
import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

import { colors } from '@/theme';

/**
 * Liquid glass, where the phone has it: on iOS 26 the surface is Apple's
 * own — it refracts what scrolls beneath and catches the light. Older
 * iPhones get a frosted blur; Android and the browser a translucent tint.
 * Reserved for chrome that floats over content: the tab bar, map controls.
 */
export function Glass({ children, style, radius = 999, interactive = false, tint, clear = false }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number; interactive?: boolean; /** A hint of colour in the glass; the theme's ground by default. */ tint?: string; /** More glass, less tint: what is beneath shows through (the tab bar, Oct 4). */ clear?: boolean }) {
  const { night } = useTheme();
  const rounded = { borderRadius: radius, overflow: 'hidden' as const };
  // Read at draw time, so the veil is the court you are on, not the one the file loaded with.
  const veil = { backgroundColor: `${(tint ?? colors.surface).slice(0, 7)}${clear ? 'B3' : 'CC'}` };
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return <GlassView glassEffectStyle="regular" isInteractive={interactive || clear} tintColor={clear && tint ? `${tint.slice(0, 7)}BF` : tint} colorScheme={night ? 'dark' : 'light'} style={[rounded, style]}>{children}</GlassView>;
  }
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return <BlurView intensity={clear ? 80 : 55} tint={night ? 'dark' : 'light'} experimentalBlurMethod="dimezisBlurView" style={[rounded, veil, style]}>{children}</BlurView>;
  }
  return <View style={[rounded, veil, clear ? styles.webClear : styles.web, style]}>{children}</View>;
}

/** Apple's Liquid Glass is on this phone (iOS 26). */
export const liquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * A control's own glass, filling it from behind, for buttons that float over
 * a clip (sound, back, the stats pill): on iOS 26 Apple's glass, dark and
 * carrying a hint of the theme's colour, so it refracts the video and still
 * reads as CourtSide; elsewhere nothing, and the control keeps its own
 * see-through fill (Oct 4, owner: "make it our theme, our own").
 */
export function GlassFill({ radius, tint, strength = 0.35 }: { radius: number; tint: string; strength?: number }) {
  if (!liquidGlass) return null;
  const hex = Math.round(Math.max(0, Math.min(1, strength)) * 255).toString(16).padStart(2, '0');
  return <GlassView pointerEvents="none" glassEffectStyle="clear" tintColor={`${tint.slice(0, 7)}${hex}`} colorScheme="dark" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} />;
}

const styles = StyleSheet.create({
  // The browser's own frosted glass; ignored by engines without it.
  web: { backdropFilter: 'blur(18px) saturate(1.4)', WebkitBackdropFilter: 'blur(18px) saturate(1.4)' } as unknown as ViewStyle,
  webClear: { backdropFilter: 'blur(24px) saturate(1.8)', WebkitBackdropFilter: 'blur(24px) saturate(1.8)' } as unknown as ViewStyle,
});
