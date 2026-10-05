import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import type { MapLoadStatus } from '@/components/map/useMapLoad';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography, withAlpha } from '@/theme';

/*
 * What a map shows until it has drawn, on the phone and in the browser alike
 * (Oct 5, owner: the card's city name and player counts over a blank map,
 * with "Map couldn't load" on top of them, looked unprofessional). Nothing
 * about the town is drawn until the map is: the card shows only these.
 */

/** How light a palette colour is, 0 to 255. */
const lightness = (hex: string) => {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000;
};

/** A soft band of light sweeping across, in the card's own colours: whichever of the theme's two surface tones is lighter. */
function Shimmer() {
  useTheme();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(x);
  }, [x]);
  const band = Math.max(120, width * 0.5);
  const move = useAnimatedStyle(() => ({ transform: [{ translateX: -band + x.value * (width + band) }] }));
  const shine = lightness(colors.surface) >= lightness(colors.surfaceAlt) ? colors.surface : colors.surfaceAlt;
  return (
    <View style={still.fill} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width ? (
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: band }, move]}>
          <LinearGradient
            colors={[withAlpha(shine, 0), withAlpha(shine, 0.7), withAlpha(shine, 0)]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The still card while its map is on its way, however long that takes: the shimmer, the app's spinner and "Loading map…". */
export function MapCardLoading() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.fill} accessible accessibilityRole="progressbar" accessibilityLabel="Loading map">
      <Shimmer />
      <CourtSpinner size={22} />
      <Text style={styles.loading}>Loading map…</Text>
    </View>
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
  return (
    <View style={styles.pillSpot}>
      {status === 'failed' ? (
        <Pressable accessibilityRole="button" accessibilityLabel="The map didn't load. Tap to try again" onPress={onRetry} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]}>
          <Text style={styles.pillText}>Map didn’t load · <Text style={styles.pillAgain}>Tap to try again</Text></Text>
        </Pressable>
      ) : (
        <View style={[styles.pill, styles.pillRow, still.noTaps]} accessible accessibilityRole="progressbar" accessibilityLabel="Loading map">
          <CourtSpinner size={14} />
          <Text style={styles.pillText}>Loading map…</Text>
        </View>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl, overflow: 'hidden' },
  loading: { ...typography.small, color: colors.textMuted },
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
