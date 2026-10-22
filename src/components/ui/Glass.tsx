import { useTheme } from '@/theme/ThemeProvider';
import React, { createContext, useContext, useMemo, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { runOnJS, useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

import { colors } from '@/theme';

/** Apple's Liquid Glass is on this phone (iOS 26). */
export const liquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * Liquid glass, where the phone has it: on iOS 26 the surface is Apple's
 * own — it refracts what scrolls beneath and catches the light. Older
 * iPhones get a frosted blur; Android and the browser a translucent tint.
 * Reserved for chrome that floats over content: the tab bar, banners. (The
 * full map's controls have their own fixed fill instead: MapGlass.)
 *
 * Android (Oct 5): the theme's own colour, nearly solid. Its blur needs the
 * page wrapped in a blur target, and without one it fell back to a flat
 * white or near-black film that is no theme's colour (a pale wash on New
 * York's navy), with two warnings each time; nearly solid also keeps the
 * labels readable over a busy clip.
 */
export function Glass({ children, style, radius = 999, interactive = false, tint, clear = false, behind = false }: {
  children?: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number; interactive?: boolean;
  /** A hint of colour in the glass; the theme's ground by default. */ tint?: string;
  /** More glass, less tint: what is beneath shows through (the tab bar, Oct 4). */ clear?: boolean;
  /** The glass a layer of its own behind what it holds (a toast's tick drawing itself in). Not for glass that answers a touch (`clear`, `interactive`): that needs what it holds inside it. */ behind?: boolean;
}) {
  // Dark glass on a dark page (Night, and New York's navy).
  const { dark } = useTheme();
  const rounded = { borderRadius: radius, overflow: 'hidden' as const };
  // Read at draw time, so the veil is the court you are on, not the one the file loaded with.
  const veil = { backgroundColor: `${(tint ?? colors.surface).slice(0, 7)}${clear ? 'B3' : 'CC'}` };
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    const look = { glassEffectStyle: 'regular' as const, isInteractive: interactive || clear, tintColor: clear && tint ? `${tint.slice(0, 7)}BF` : tint, colorScheme: dark ? 'dark' as const : 'light' as const };
    if (behind) {
      // Out under the hairline edge too, as when it held what it shows: no ring of bare page inside the edge.
      const edge = -(StyleSheet.flatten(style)?.borderWidth ?? 0);
      return (
        <View style={[rounded, style]}>
          <GlassView pointerEvents="none" {...look} style={{ position: 'absolute', top: edge, left: edge, right: edge, bottom: edge, borderRadius: radius }} />
          {children}
        </View>
      );
    }
    return <GlassView {...look} style={[rounded, style]}>{children}</GlassView>;
  }
  if (Platform.OS === 'ios') {
    return <BlurView intensity={clear ? 80 : 55} tint={dark ? 'dark' : 'light'} style={[rounded, veil, style]}>{children}</BlurView>;
  }
  if (Platform.OS === 'android') {
    return <View style={[rounded, { backgroundColor: `${(tint ?? colors.surface).slice(0, 7)}${clear ? 'E6' : 'F2'}` }, style]}>{children}</View>;
  }
  return <View style={[rounded, veil, clear ? styles.webClear : styles.web, style]}>{children}</View>;
}

/**
 * The fades a piece of glass sits under (1 shown, 0 gone): a clip's words
 * fading as its comments open or a pinch takes them away, a group's feed
 * cross-fading in. iOS glass and blur under a parent whose opacity is below 1
 * can turn see-through and stay that way (Oct 17), so while any of these is
 * part-way, glass under them stands down for a plain fill of about its look,
 * and comes back once everything over it is whole again (Oct 22 sweep, item 5).
 */
const GlassFadeContext = createContext<SharedValue<number>[]>([]);

/** Everything inside fades with `value`: the glass in it steps aside for a plain fill while it does. */
export function GlassFadeScope({ value, children }: { value: SharedValue<number> | null | undefined; children: React.ReactNode }) {
  const outer = useContext(GlassFadeContext);
  const list = useMemo(() => (value ? [...outer, value] : outer), [outer, value]);
  return <GlassFadeContext.Provider value={list}>{children}</GlassFadeContext.Provider>;
}

/**
 * Whether glass may draw here now: every fade over it (and `extra`, one of
 * its own) is whole. Only an iPhone asks; elsewhere there is no glass to break.
 */
export function useGlassSteady(extra?: SharedValue<number> | null): boolean {
  const fades = useContext(GlassFadeContext);
  const all = useMemo(() => (extra ? [...fades, extra] : fades), [fades, extra]);
  const ios = Platform.OS === 'ios';
  const [steady, setSteady] = useState(() => !ios || wholeNow(all));
  useAnimatedReaction(() => {
    if (!ios) return true;
    let p = 1;
    for (const v of all) p *= v.value;
    return p > 0.995;
  }, (now, was) => {
    if (now !== was) runOnJS(setSteady)(now);
  }, [all, ios]);
  return steady;
}

function wholeNow(all: SharedValue<number>[]) {
  let p = 1;
  for (const v of all) p *= v.value;
  return p > 0.995;
}

/** Whether a control shown by growing is there at all (any size above nothing). */
function usePresent(present: SharedValue<number> | undefined): boolean {
  const [on, setOn] = useState(() => !present || present.value > 0.01);
  useAnimatedReaction(() => (present ? present.value > 0.01 : true), (now, was) => {
    if (now !== was) runOnJS(setOn)(now);
  }, [present]);
  return on;
}

/**
 * A control's own glass, filling it from behind, for buttons that float over
 * a clip (sound, back, the stats pill): on iOS 26 Apple's glass, dark and
 * carrying a hint of the theme's colour, so it refracts the video and still
 * reads as CourtSide; elsewhere nothing, and the control keeps its own
 * see-through fill (Oct 4, owner: "make it our theme, our own").
 *
 * While a fade over it is part-way (GlassFadeScope, or `fade`), the glass is a
 * plain `fill` instead, so it fades like everything else and never goes
 * see-through. `present`: a control shown by growing rather than fading (the
 * sound disc); shrunk away to nothing, its glass is not drawn at all.
 */
export function GlassFill({ radius, tint, strength = 0.35, fill = 'rgba(16,18,17,0.34)', fade, present }: {
  radius: number; tint: string; strength?: number;
  /** What stands in for the glass while it fades: the control's own see-through fill elsewhere. */
  fill?: string;
  fade?: SharedValue<number> | null;
  present?: SharedValue<number>;
}) {
  const steady = useGlassSteady(fade);
  const shown = usePresent(present);
  if (!liquidGlass || !shown) return null;
  if (!steady) return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden', backgroundColor: fill }]} />;
  const hex = Math.round(Math.max(0, Math.min(1, strength)) * 255).toString(16).padStart(2, '0');
  return <GlassView pointerEvents="none" glassEffectStyle="clear" tintColor={`${tint.slice(0, 7)}${hex}`} colorScheme="dark" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} />;
}

const styles = StyleSheet.create({
  // The browser's own frosted glass; ignored by engines without it.
  web: { backdropFilter: 'blur(18px) saturate(1.4)', WebkitBackdropFilter: 'blur(18px) saturate(1.4)' } as unknown as ViewStyle,
  webClear: { backdropFilter: 'blur(24px) saturate(1.8)', WebkitBackdropFilter: 'blur(24px) saturate(1.8)' } as unknown as ViewStyle,
});
