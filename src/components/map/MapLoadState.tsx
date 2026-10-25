import { PRESS_DIM } from '@/theme/press';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import Animated, { Easing, FadeIn, FadeOut, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { Image as PhotoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { MapSoftShot } from '@/components/map/MapSoftShot';
import { lookFor, mix } from '@/components/map/look';
import { ME_SIZE } from '@/components/map/pinList';
import { discSize } from '@/components/map/markers';
import type { MapLoadStatus } from '@/components/map/useMapLoad';
import type { User } from '@/data/types';
import { initials } from '@/lib/format';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { themes, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, surfaceColorFor, typography } from '@/theme';

/**
 * Which loading look the Find Players map card shows while its map is on its way (Oct 24, owner:
 * "I really don't like this as loading, what would best loading screen be", about the faint drawn
 * sketch of made-up roads, parks and water). Options to compare, one switch; 'now' is what ships:
 * - 'now': today's sketch (MapCardBase).
 * - 'A' Plain: only the map's own ground colour, the colour the real map paints first; nothing drawn, no words.
 * - 'B' Your spot: Plain, with your own face in the middle, perfectly still (with Location on; else Plain).
 * - 'C' Soft sweep: Plain, with one faint light band slowly crossing it (Reduce Motion: Plain).
 * - 'D' Last map, softened: any picture kept of this place's map (another size, look or theme), blurred; none kept, Plain.
 * Every one keeps the card's frame, its reveal, its failed state and the quiet "Loading map…" after a long wait.
 */
export const MAP_LOADING = 'now' as 'now' | 'A' | 'B' | 'C' | 'D';

/*
 * What a map shows until it has drawn, on the phone and in the browser alike
 * (Oct 5, owner: the card's city name and player counts over a blank map,
 * with "Map couldn't load" on top of them, looked unprofessional). Nothing
 * about the town is drawn until the map is: the card shows only these.
 */

/**
 * The still card while its map is on its way (Oct 21, owner: "make it
 * absolute peak"): never a grey box with a spinner, but the map's own
 * ground in the theme's colours, with a few soft main roads and a park
 * sketched on it, so the card already reads as a map the moment the page
 * shows. The real map then fades in over it inside the same frame. It is
 * still: no shimmer, no spinner. Only if the map is truly slow (SLOW_MS)
 * does a small quiet "Loading map…" appear in a corner, so a long wait
 * still says what is happening.
 */
const SLOW_MS = 4000;
/** How long the real map takes to fade in over the sketch, inside the card's frame (the frame itself never moves). */
export const MAP_IN_MS = 300;
/**
 * The one reveal a still card ever makes in view (Oct 22, owner: "The map blips in 50% of the time"):
 * only when there is no picture of it kept from before (a first open, a new theme, a new city), and
 * never under a lifting curtain. Slow and even at both ends, so it reads as the map settling in, not a cut.
 */
export const MAP_REVEAL_MS = 400;
/** The same easing in a browser (ease-in-out, quadratic), for a CSS transition. */
export const MAP_REVEAL_CSS = 'cubic-bezier(0.45, 0, 0.55, 1)';

/** The sketch itself, kept faint: the map's ground, two parks, a little water, two main roads and a few streets. Drawn once, never animated. */
export function MapCardBase() {
  const { theme } = useTheme();
  const look = useMemo(() => lookFor(themes[theme]), [theme]);
  const ground = look.background?.fill ?? colors.bgElevated;
  const built = look.landuse_residential?.fill ?? ground;
  const park = look.park?.fill ?? mix(ground, colors.grass, 0.3);
  const water = look.water?.fill ?? mix(ground, colors.hard, 0.3);
  const road = look.highway_major_inner?.line ?? colors.surface;
  const edge = look.highway_major_casing?.line ?? colors.border;
  return (
    <View style={still.fill}>
      <Svg width="100%" height="100%" viewBox="0 0 360 330" preserveAspectRatio="xMidYMid slice">
        <Rect x={0} y={0} width={360} height={330} fill={ground} />
        <Path d="M40 40 h120 v90 h-120 z M210 190 h110 v100 h-110 z" fill={built} />
        <Path d="M232 46 q40 -8 70 10 q18 30 2 58 q-36 14 -70 -2 q-14 -32 -2 -66 z" fill={park} opacity={0.55} />
        <Path d="M58 214 q30 -10 52 6 q8 24 -10 40 q-30 6 -46 -12 q-6 -18 4 -34 z" fill={park} opacity={0.55} />
        <Path d="M-10 318 q110 -26 200 -8 t190 -22 v60 h-390 z" fill={water} opacity={0.45} />
        <Path d="M-10 168 C90 150 200 186 370 150" stroke={edge} strokeWidth={6} fill="none" strokeLinecap="round" />
        <Path d="M-10 168 C90 150 200 186 370 150" stroke={road} strokeWidth={4} fill="none" strokeLinecap="round" />
        <Path d="M178 -10 C170 90 196 200 186 340" stroke={edge} strokeWidth={5} fill="none" strokeLinecap="round" />
        <Path d="M178 -10 C170 90 196 200 186 340" stroke={road} strokeWidth={3.2} fill="none" strokeLinecap="round" />
        <Path d="M-10 70 L370 96 M60 -10 L96 340 M290 -10 L262 340" stroke={road} strokeWidth={1.6} fill="none" opacity={0.8} />
      </Svg>
    </View>
  );
}

/**
 * The still card while its map is on its way, however long that takes: the look MAP_LOADING picks (the
 * sketch above today), and only after a long wait a quiet word in the corner.
 * `me`: you, for 'B' (given only with Location on). `soft`: a picture kept of this place's map, for 'D'.
 */
export function MapCardLoading({ me = null, soft = null }: { me?: User | null; soft?: string | null } = {}) {
  const styles = useThemedStyles(styleDefinitions);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={still.fill} accessible accessibilityRole="progressbar" accessibilityLabel="Loading map">
      {MAP_LOADING === 'now' ? <MapCardBase /> : <MapGround />}
      {MAP_LOADING === 'B' && me ? <YouDisc me={me} /> : null}
      {MAP_LOADING === 'C' ? <SoftSweep /> : null}
      {MAP_LOADING === 'D' && soft ? <View style={[still.fill, styles.clip]}><MapSoftShot uri={soft} /></View> : null}
      {slow ? <View style={styles.slowSpot}><Text style={styles.slowText}>Loading map…</Text></View> : null}
    </View>
  );
}

/** 'A' Plain: the map's own ground and nothing on it, the colour the real map paints before its streets (what Apple's and Google's maps show). */
function MapGround() {
  const { theme } = useTheme();
  const ground = useMemo(() => lookFor(themes[theme]).background?.fill ?? colors.bgElevated, [theme]);
  return <View style={[still.fill, { backgroundColor: ground }]} />;
}

/**
 * 'B' Your spot: your face as the map draws your pin (the same white-ringed disc, the same size, and its
 * "You" tag), still, in the middle. The card is centred on your town and never shows your own spot in it,
 * so the middle is the place it can go; the card's map then fades in over it with the rest of this look.
 */
function YouDisc({ me }: { me: User }) {
  const styles = useThemedStyles(styleDefinitions);
  const picture = me.avatarUrl && /^https:\/\//i.test(me.avatarUrl) ? me.avatarUrl : null;
  return (
    <View style={[still.fill, styles.centre, styles.youCol]}>
      <View style={styles.youBox}>
        <View style={styles.youRing}>
          <View style={[styles.youFace, { backgroundColor: surfaceColorFor(me.avatarSeed) }]}>
            {picture ? <PhotoImage source={{ uri: picture }} contentFit="cover" transition={0} cachePolicy="memory" style={StyleSheet.absoluteFill} /> : <Text style={styles.youInitials}>{initials(me.name)}</Text>}
          </View>
        </View>
      </View>
      <View style={styles.youTag}><Text style={styles.youTagText}>You</Text></View>
    </View>
  );
}

/** How long the light band takes to cross the card, and the rest before the next: one every ~1.8 s. */
const SWEEP_MS = 1400;
const SWEEP_REST_MS = 400;

/**
 * 'C' Soft sweep: one faint light band crossing the card now and then, moved only sideways (never faded:
 * its light is in its own colours). Gone with the rest of the loading look, its loop stopped as it goes;
 * with Reduce Motion on, Plain.
 */
function SoftSweep() {
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  if (reduce) return null;
  return (
    <View style={still.fill} onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w > 0 && w !== width) setWidth(w); }}>
      {width ? <SweepBand key={width} width={width} /> : null}
    </View>
  );
}

/** The band itself, made once the card's width is known (so nothing in its motion is guessed at first). */
function SweepBand({ width }: { width: number }) {
  const { theme } = useTheme();
  const light = useMemo(() => lookFor(themes[theme]).highway_major_inner?.line ?? colors.surface, [theme]);
  const band = Math.round(width * 0.55);
  const at = useSharedValue(0);
  useEffect(() => {
    at.value = withRepeat(withDelay(SWEEP_REST_MS, withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) })), -1, false);
    return () => cancelAnimation(at);
  }, [at]);
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: -band + at.value * (width + band) }] }));
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: band }, moving]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 10" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="cs-sweep" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={light} stopOpacity={0} />
            <Stop offset="0.5" stopColor={light} stopOpacity={0.4} />
            <Stop offset="1" stopColor={light} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={10} fill="url(#cs-sweep)" />
      </Svg>
    </Animated.View>
  );
}

/** The still card when its map did not come after every retry: one quiet message. The card itself takes the tap that tries again. */
export function MapCardFailed() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.fill, still.fill]}>
      <View style={styles.disc}><Ionicons name="refresh" size={18} color={colors.brand} /></View>
      <Text style={styles.title}>Map didn’t load</Text>
      <Text style={styles.again}>Tap to try again</Text>
    </View>
  );
}

/**
 * On the full map: "Loading map…" once it has taken longer than a normal
 * load (so a quick one shows nothing new), or "Map didn't load · Tap to try
 * again", which tries again. It goes in the column of bars along the top,
 * just under the filter chips (where "Zoom in to see courts" sits), not in
 * the middle of the map, where the pins around you gather (Oct 5 review).
 */
export function MapLoadPill({ status, onRetry }: { status: MapLoadStatus; onRetry: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (status !== 'loading') return undefined;
    const t = setTimeout(() => setSlow(true), 1500);
    return () => clearTimeout(t);
  }, [status]);
  if (status === 'painted' || (status === 'loading' && !slow)) return null;
  // Fades in and out (Oct 22 sweep: it popped), and from one wording to the other (keyed): a plain surface, never glass.
  return (
    <Animated.View key={status} entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={styles.pillSpot}>
      {status === 'failed' ? (
        <Pressable accessibilityRole="button" accessibilityLabel="The map didn't load. Tap to try again" onPress={onRetry} style={({ pressed }) => [styles.pill, pressed && { opacity: PRESS_DIM }]}>
          <Text style={styles.pillText}>Map didn’t load · <Text style={styles.pillAgain}>Tap to try again</Text></Text>
        </Pressable>
      ) : (
        <View style={[styles.pill, styles.pillRow, still.noTaps]} accessible accessibilityRole="progressbar" accessibilityLabel="Loading map">
          <CourtSpinner size={14} />
          <Text style={styles.pillText}>Loading map…</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl, overflow: 'hidden' },
  // A long wait only: a small quiet word in the card's corner, never over the middle.
  slowSpot: { position: 'absolute', left: 10, bottom: 10, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surface },
  slowText: { ...typography.small, color: colors.textMuted },
  clip: { overflow: 'hidden' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  // The tag's room (13 + 6 + 2) above too, so the face itself is in the middle, where the pin's spot would be.
  youCol: { paddingTop: 21 },
  // Your pin as the map draws it (markers' disc and mePinHtml): the face, a ring of the page colour round it, a soft shadow, and the "You" tag under it.
  youBox: { width: discSize(ME_SIZE), height: discSize(ME_SIZE), alignItems: 'center', justifyContent: 'center' },
  youRing: { width: ME_SIZE + 6, height: ME_SIZE + 6, borderRadius: radius.pill, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 10px rgba(0, 0, 0, 0.24)' },
  youFace: { width: ME_SIZE, height: ME_SIZE, borderRadius: radius.pill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  youInitials: { fontSize: 11, ...font('600'), color: colors.onMedia },
  youTag: { marginTop: 2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.bg, boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.16)' },
  youTagText: { fontSize: 11, lineHeight: 13, ...font('600'), color: colors.text },
  disc: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  title: { ...typography.bodyStrong, color: colors.text, textAlign: 'center', marginBottom: -4 },
  again: { ...typography.smallStrong, color: colors.brand, textAlign: 'center' },
  // Centred in the column of bars along the top of the full map, a little below the chips.
  pillSpot: { alignSelf: 'center', marginTop: spacing.xs, pointerEvents: 'box-none' },
  pill: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pillText: { ...typography.smallStrong, color: colors.textMuted },
  pillAgain: { color: colors.brand },
});

/** Seen, never tapped: the tap belongs to the card (or the map) underneath. In a style, which the browser also honours. */
const still = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
  // The same, for something that keeps its place (the "Loading map…" pill: a tap on it goes to the map).
  noTaps: { pointerEvents: 'none' },
});
