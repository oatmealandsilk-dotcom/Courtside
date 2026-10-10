import { useTheme } from '@/theme/ThemeProvider';
import React, { createContext, useContext } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

import { colors } from '@/theme';

/**
 * Put the glass inside up afresh: each new value makes the iPhone build its
 * glass again. For glass that first appears inside something still fading
 * in (the full map's buttons, riding on a card or the bare map as it
 * arrives: CardStage), given a new value once that has finished.
 *
 * Why (Oct 10, owner: the players pill was "white around the font" on
 * opening the map, and see-through only after a filter was tapped): iOS
 * draws Apple's glass as a flat white plate when it is put up while
 * something round it is fading in, and keeps it that way however solid
 * that later becomes (expo/expo#41024, iOS 26.1 on), seemingly until the
 * glass itself changes (the pill's words changing length, on a filter).
 * Glass put up once everything round it is still is real glass (the city
 * chip, which comes later, always was), so that is when it is put up
 * again. Android and the browser draw theirs another way and never need it.
 */
export const GlassRenew = createContext(0);

/**
 * Liquid glass, where the phone has it: on iOS 26 the surface is Apple's
 * own — it refracts what scrolls beneath and catches the light. Older
 * iPhones get a frosted blur; Android and the browser a translucent tint.
 * Reserved for chrome that floats over content: the tab bar, map controls.
 *
 * Android (Oct 5): the theme's own colour, nearly solid. Its blur needs the
 * page wrapped in a blur target, and without one it fell back to a flat
 * white or near-black film that is no theme's colour (a pale wash on New
 * York's navy), with two warnings each time; nearly solid also keeps the
 * labels readable over a busy clip.
 */
export function Glass({ children, style, radius = 999, interactive = false, tint, clear = false }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number; interactive?: boolean; /** A hint of colour in the glass; the theme's ground by default. */ tint?: string; /** More glass, less tint: what is beneath shows through (the tab bar, Oct 4). */ clear?: boolean }) {
  // Dark glass on a dark page (Night, and New York's navy).
  const { dark } = useTheme();
  // A new value builds the iPhone's glass again (GlassRenew, above).
  const renew = useContext(GlassRenew);
  const rounded = { borderRadius: radius, overflow: 'hidden' as const };
  // Read at draw time, so the veil is the court you are on, not the one the file loaded with.
  const veil = { backgroundColor: `${(tint ?? colors.surface).slice(0, 7)}${clear ? 'B3' : 'CC'}` };
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return <GlassView key={renew} glassEffectStyle="regular" isInteractive={interactive || clear} tintColor={clear && tint ? `${tint.slice(0, 7)}BF` : tint} colorScheme={dark ? 'dark' : 'light'} style={[rounded, style]}>{children}</GlassView>;
  }
  if (Platform.OS === 'ios') {
    return <BlurView key={renew} intensity={clear ? 80 : 55} tint={dark ? 'dark' : 'light'} style={[rounded, veil, style]}>{children}</BlurView>;
  }
  if (Platform.OS === 'android') {
    return <View style={[rounded, { backgroundColor: `${(tint ?? colors.surface).slice(0, 7)}${clear ? 'E6' : 'F2'}` }, style]}>{children}</View>;
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
