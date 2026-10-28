import React, { useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { CourtMapSnapshots, CourtMapThumb } from '@/components/map/CourtMapThumb';
import { ordinal } from '@/features/courtUnlocks/DesignParts';
import { NEW_COURT_FACTS } from '@/features/courtUnlocks/designDemo';
import { centreLatFor, pxPerMetre } from '@/features/courtUnlocks/mapMath';
import { CloseButton, CourtsFromAbove, UnlockActions, UnlockRows, footprintSize, useUnlock } from '@/features/courtUnlocks/UnlockParts';
import * as haptics from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography, wordmarkFont } from '@/theme';
import { TextScale } from '@/theme/textScale';

/** Close enough that the courts themselves show at their real size. */
const ZOOM = 17.4;
/** Where the courts sit down the map, so the words below never cover them. */
const AT = 0.4;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * DESIGN BRANCH ONLY. Court unlocked, option A, "Traced" (round 3; owner:
 * not the stamp at the bottom right, not the court mark on top). The
 * court's own block of map, close in, with the courts drawn on it from
 * above at their real size: the fence traces itself round once in your
 * colour and the lines come in. Under it the words do the shouting:
 * "6th court" big in the wordmark's type, then the court's name.
 * All on the UI thread; Reduce Motion: drawn already.
 */
export function UnlockTraced() {
  const styles = useThemedStyles(styleDefinitions);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const { court, nth } = useUnlock();
  const W = Math.min(width, 560);
  const MAP_H = Math.round(Math.min(Math.max(height * 0.56, 360), 540));
  const k = pxPerMetre(ZOOM, court.lat);
  const foot = footprintSize(NEW_COURT_FACTS.courts, k);
  const centreLat = centreLatFor(court.lat, ZOOM, MAP_H, AT);

  const settle = useSharedValue(still ? 1 : 0);
  const draw = useSharedValue(still ? 1 : 0);
  const lines = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (still) return undefined;
    settle.value = withTiming(1, { duration: 1500, easing: Easing.out(Easing.cubic) });
    draw.value = withDelay(320, withTiming(1, { duration: 1050, easing: EASE }));
    lines.value = withDelay(1050, withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) }));
    const t = setTimeout(() => haptics.reward(), 1250);
    return () => clearTimeout(t);
  }, [still, settle, draw, lines]);
  const mapIn = useAnimatedStyle(() => ({ transform: [{ scale: 1.08 - 0.08 * settle.value }] }));

  return (
    <View style={styles.page}>
      <View style={[styles.mapBox, { width: W, height: MAP_H }]}>
        <CourtMapSnapshots />
        <Animated.View style={[StyleSheet.absoluteFill, mapIn]}>
          <CourtMapThumb lat={centreLat} lng={court.lng} width={W} height={MAP_H} zoom={ZOOM} />
          <View pointerEvents="none" style={[styles.foot, { left: W / 2 - foot.width / 2 - 3, top: MAP_H * AT - foot.height / 2 - 3 }]}>
            <CourtsFromAbove courts={NEW_COURT_FACTS.courts} pxPerM={k} draw={draw} lines={lines} />
          </View>
        </Animated.View>
        {/* The map runs into the page: a plain fade to the page's colour, under the words. */}
        <Svg pointerEvents="none" width={W} height={MAP_H} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="tracedFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.bg} stopOpacity={0.3} />
              <Stop offset="0.16" stopColor={colors.bg} stopOpacity={0} />
              <Stop offset="0.6" stopColor={colors.bg} stopOpacity={0} />
              <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={W} height={MAP_H} fill="url(#tracedFade)" />
        </Svg>
        <CloseButton top={insets.top + 10} />
      </View>

      <View style={[styles.body, { marginTop: -84, paddingBottom: insets.bottom + spacing.lg }]}>
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.nth}>
          <Text style={styles.nthStrong}>{ordinal(nth)} court</Text>
          <Text style={styles.nthSoft}> unlocked</Text>
        </Text>
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.name} numberOfLines={3}>{court.name}</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}>{NEW_COURT_FACTS.surface} · {NEW_COURT_FACTS.courts} courts · {NEW_COURT_FACTS.fromHome} from home</Text>
        <View style={styles.rows}><UnlockRows /></View>
        <View style={styles.bottom}><UnlockActions /></View>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg, alignItems: 'center' },
  mapBox: { overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  foot: { position: 'absolute', transform: [{ rotate: '-20deg' }] },
  body: { width: '100%', maxWidth: 560, flex: 1, paddingHorizontal: spacing.lg + 4 },
  nth: { fontSize: 34, lineHeight: 38 },
  nthStrong: { ...wordmarkFont('900'), fontSize: 34, letterSpacing: -1.4, color: colors.brand },
  nthSoft: { ...font('600'), fontSize: 34, letterSpacing: -1.2, color: colors.textFaint },
  name: { ...font('700'), fontSize: 40, lineHeight: 42, letterSpacing: -1.5, color: colors.text, marginTop: 4 },
  meta: { ...typography.small, color: colors.textMuted, marginTop: 10 },
  rows: { marginTop: spacing.xl },
  bottom: { marginTop: 'auto' },
});
