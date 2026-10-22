import { useTheme } from '@/theme/ThemeProvider';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type GestureResponderEvent, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useNavigation } from 'expo-router';
import { LayoutAnimationConfig } from 'react-native-reanimated';

import { colors } from '@/theme';

/** Apple's Liquid Glass is on this phone (iOS 26). */
export const liquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

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
 * The same goes for glass put up under a finger: a pressed button is
 * dimmed, and glass put up dimmed is the same white plate (Oct 11), so a
 * renewal always waits for the finger to lift (useGlassRenewal's `hold`).
 *
 * Glass under it never takes a touch itself (the button round it does): a
 * finger down on glass that is put up again under it would lose its tap. So
 * only for glass whose button is round it, with nothing to tap inside.
 * Outside it (null) glass is never rebuilt and takes touches as ever.
 */
export const GlassRenew = createContext<number | null>(null);

/** How long glass waits once what was moving round it has stopped, before it is put up again: the move's last frame drawn first. */
const SETTLE_MS = 120;
/** A finger "on the glass" for longer than this is taken as gone, so one whose lift was never heard never holds the glass back for good. */
const HOLD_MAX_MS = 4000;
/**
 * How long glass that came due under a finger waits once it lifts. A button
 * stays dimmed for up to 130 ms after a quick tap (the phone's shortest
 * press), and glass put up dimmed is the white plate (Oct 11), so it waits
 * that out, and a frame or two for the button to be drawn bright again.
 */
const LIFT_MS = 200;

/**
 * Glass that is clear every time (Oct 11, owner: "The island in the bottom
 * sometimes it's clear sometimes it's not"): what puts it up again once
 * everything round it is still (GlassRenew, above). Whatever fades it, the
 * moment it has finished calls `settle`; a moment later `renew` changes, and
 * the glass given it is built afresh, as real glass. Once per finish, never
 * on a loop, and never while a finger is on it or its button (`hold`,
 * spread on a view round both; once the finger lifts, not until the button
 * has stopped looking pressed) nor while `blocked` (the search bar while
 * you type in it): then it waits for that to end. On an iPhone without
 * Apple's glass, Android and the browser it does nothing at all.
 */
export interface GlassRenewal {
  /** For the glass: Glass's or GlassFill's `renew`, or a GlassRenew value. */
  renew: number;
  /** What was moving round the glass has finished: put it up again once settled (a later call starts the wait over). */
  settle: (afterMs?: number) => void;
  /** It is on the move again (fading out, leaving): a renewal not yet made is dropped. */
  cancel: () => void;
  /** On a view round the glass and its button: never put up again under a finger. */
  hold: Pick<ViewProps, 'onTouchStart' | 'onTouchEnd' | 'onTouchCancel'>;
}

export function useGlassRenewal({ blocked = false }: { blocked?: boolean } = {}): GlassRenewal {
  const [renew, setRenew] = useState(0);
  const state = useRef({ timer: null as ReturnType<typeof setTimeout> | null, due: false, touchedAt: 0, blocked });
  state.current.blocked = blocked;
  // Due, and nothing in the way: the glass is put up again now.
  const pay = useCallback(() => {
    const s = state.current;
    if (!s.due || s.timer || s.blocked) return;
    if (s.touchedAt && Date.now() - s.touchedAt < HOLD_MAX_MS) return;
    s.due = false;
    setRenew((n) => n + 1);
  }, []);
  const cancel = useCallback(() => {
    const s = state.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    s.due = false;
  }, []);
  const settle = useCallback((afterMs: number = SETTLE_MS) => {
    if (!liquidGlass) return;
    const s = state.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => { s.timer = null; s.due = true; pay(); }, afterMs);
  }, [pay]);
  // No longer blocked: one that came due meanwhile is made now.
  useEffect(() => { if (!blocked) pay(); }, [blocked, pay]);
  useEffect(() => cancel, [cancel]);
  const hold = useMemo<GlassRenewal['hold']>(() => {
    if (!liquidGlass) return {};
    const lifted = (e: GestureResponderEvent) => {
      if (e.nativeEvent.touches?.length) return;
      const s = state.current;
      s.touchedAt = 0;
      // One that came due under the finger is put up a moment later, not now: the button it is on is still
      // dimmed just after a quick tap, and glass put up dimmed is the white plate (Oct 11; LIFT_MS).
      if (s.due && !s.timer) s.timer = setTimeout(() => { s.timer = null; pay(); }, LIFT_MS);
    };
    return { onTouchStart: () => { state.current.touchedAt = Date.now(); }, onTouchEnd: lifted, onTouchCancel: lifted };
  }, [pay]);
  return { renew, settle, cancel, hold };
}

/**
 * Calls `onArrive` each time the page this is on has finished coming in:
 * opened, or come back to from a page that was over it (a page that never
 * says so, opened without a slide, after 700 ms). For glass on that page to
 * be put up again then (useGlassRenewal). Only where Apple's glass is.
 */
export function useOnPageArrival(onArrive: () => void) {
  const navigation = useNavigation();
  const latest = useRef(onArrive);
  latest.current = onArrive;
  useEffect(() => {
    if (!liquidGlass) return undefined;
    let ended = false;
    const events = navigation as unknown as { addListener?: (name: string, fn: (e?: { data?: { closing?: boolean } }) => void) => () => void };
    const stop = events.addListener?.('transitionEnd', (e) => { if (!e?.data?.closing) { ended = true; latest.current(); } });
    const fallback = setTimeout(() => { if (!ended) latest.current(); }, 700);
    return () => { clearTimeout(fallback); stop?.(); };
  }, [navigation]);
}

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
export function Glass({ children, style, radius = 999, interactive = false, tint, clear = false, renew, behind = false }: {
  children?: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number; interactive?: boolean;
  /** A hint of colour in the glass; the theme's ground by default. */ tint?: string;
  /** More glass, less tint: what is beneath shows through (the tab bar, Oct 4). */ clear?: boolean;
  /** Each new value builds the iPhone's glass afresh (useGlassRenewal). What it holds is built again with it, so whoever changes it holds off while a finger is on it (the hook's `hold`); and anything inside with a fade out of its own would keep the old glass on screen over the new while it fades, so glass holding that, or a field you type in, is `behind`. */ renew?: number;
  /** The glass a layer of its own behind what it holds: put up again, only the glass is rebuilt, never what it holds (a toast's tick drawing itself in, the map search's field and weather). Not for glass that answers a touch (`clear`, `interactive`): that needs what it holds inside it. */ behind?: boolean;
}) {
  // Dark glass on a dark page (Night, and New York's navy).
  const { dark } = useTheme();
  // A new value builds the iPhone's glass again (GlassRenew, above); the button round it takes the touches.
  const outer = useContext(GlassRenew);
  const through = outer === null ? undefined : 'none' as const;
  const key = `${outer ?? 0}.${renew ?? 0}`;
  const rounded = { borderRadius: radius, overflow: 'hidden' as const };
  // Read at draw time, so the veil is the court you are on, not the one the file loaded with.
  const veil = { backgroundColor: `${(tint ?? colors.surface).slice(0, 7)}${clear ? 'B3' : 'CC'}` };
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    // Glass that will be put up again once all round it is still (inside GlassRenew) is not put up
    // at all until then: put up while the map's buttons fade in, it is the flat white plate that only
    // later turns clear (Oct 21, owner: the players pill "starts out as colored filled then goes to
    // clear after. Make it always clear"). Until its first renewal it is a light, see-through veil of
    // the same colour, which fades like any view, so it is clear from the first frame.
    if (outer === 0 && !renew) {
      return <View pointerEvents={through} style={[rounded, { backgroundColor: `${(tint ?? colors.surface).slice(0, 7)}${dark ? '8C' : '80'}` }, style]}>{children}</View>;
    }
    const look = { glassEffectStyle: 'regular' as const, isInteractive: interactive || clear, tintColor: clear && tint ? `${tint.slice(0, 7)}BF` : tint, colorScheme: dark ? 'dark' as const : 'light' as const };
    if (behind) {
      // Out under the hairline edge too, as when it held what it shows: no ring of bare page inside the edge.
      const edge = -(StyleSheet.flatten(style)?.borderWidth ?? 0);
      return (
        <View style={[rounded, style]}>
          <GlassView key={key} pointerEvents="none" {...look} style={{ position: 'absolute', top: edge, left: edge, right: edge, bottom: edge, borderRadius: radius }} />
          {children}
        </View>
      );
    }
    // Built again, what it holds comes back as it was, never playing an entrance of its own over.
    const again = !!outer || !!renew;
    return <GlassView key={key} pointerEvents={through} {...look} style={[rounded, style]}>{again ? <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig> : children}</GlassView>;
  }
  if (Platform.OS === 'ios') {
    return <BlurView key={key} pointerEvents={through} intensity={clear ? 80 : 55} tint={dark ? 'dark' : 'light'} style={[rounded, veil, style]}>{children}</BlurView>;
  }
  if (Platform.OS === 'android') {
    return <View style={[rounded, { backgroundColor: `${(tint ?? colors.surface).slice(0, 7)}${clear ? 'E6' : 'F2'}` }, style]}>{children}</View>;
  }
  return <View style={[rounded, veil, clear ? styles.webClear : styles.web, style]}>{children}</View>;
}

/**
 * A control's own glass, filling it from behind, for buttons that float over
 * a clip (sound, back, the stats pill): on iOS 26 Apple's glass, dark and
 * carrying a hint of the theme's colour, so it refracts the video and still
 * reads as CourtSide; elsewhere nothing, and the control keeps its own
 * see-through fill (Oct 4, owner: "make it our theme, our own"). Each new
 * `renew` builds it afresh (useGlassRenewal): it holds nothing, so nothing
 * else is touched.
 */
export function GlassFill({ radius, tint, strength = 0.35, renew }: { radius: number; tint: string; strength?: number; renew?: number }) {
  if (!liquidGlass) return null;
  const hex = Math.round(Math.max(0, Math.min(1, strength)) * 255).toString(16).padStart(2, '0');
  return <GlassView key={renew ?? 0} pointerEvents="none" glassEffectStyle="clear" tintColor={`${tint.slice(0, 7)}${hex}`} colorScheme="dark" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} />;
}

const styles = StyleSheet.create({
  // The browser's own frosted glass; ignored by engines without it.
  web: { backdropFilter: 'blur(18px) saturate(1.4)', WebkitBackdropFilter: 'blur(18px) saturate(1.4)' } as unknown as ViewStyle,
  webClear: { backdropFilter: 'blur(24px) saturate(1.8)', WebkitBackdropFilter: 'blur(24px) saturate(1.8)' } as unknown as ViewStyle,
});
