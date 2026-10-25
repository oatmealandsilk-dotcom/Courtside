import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { surfaceKind, surfaceLabel, surfaceAdjective, type SurfaceKind } from '@/features/places/courtSurface';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/**
 * A court's surface wherever a court is listed (Oct 24, owner: "But also the
 * courts near me hard grass clay"): a dot in the surface's colour and its word,
 * the same dot and colours as Courts near you's tag. Nothing at all when the
 * map does not say what the court is played on (about 9 courts in 10).
 */

/** A surface's colour, from the theme's surface slots. Turf, carpet and synthetic share the neutral grey. */
export function surfaceTint(kind: SurfaceKind | null): string {
  return kind === 'hard' ? colors.surfaceHard : kind === 'clay' ? colors.surfaceClay : kind === 'grass' ? colors.surfaceGrass : colors.surfaceOther;
}

/** "hard courts", "clay court": the surface said aloud, or null when unknown. */
export function surfaceSaid(surface: string | null | undefined, count = 1): string | null {
  const kind = surfaceKind(surface);
  return kind ? `${surfaceAdjective[kind]} court${count === 1 ? '' : 's'}` : null;
}

/**
 * A row's detail line led by the surface: "● Hard · 1.1 mi · lights". With no
 * known surface it is the detail line alone, exactly as before.
 */
export function SurfaceLine({ surface, rest, style, lines = 1 }: { surface: string | null | undefined; rest: string; style: StyleProp<TextStyle>; lines?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const kind = surfaceKind(surface);
  if (!kind) return rest ? <Text style={style} numberOfLines={lines}>{rest}</Text> : null;
  return (
    <View style={styles.line}>
      <View style={[styles.dot, { backgroundColor: surfaceTint(kind) }]} />
      <Text style={[style, styles.text]} numberOfLines={lines}>{surfaceLabel[kind]}{rest ? ` · ${rest}` : ''}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  dot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  text: { flexShrink: 1 },
});
