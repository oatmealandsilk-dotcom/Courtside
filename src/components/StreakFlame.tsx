import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { streakLabel } from '@/features/practice/streakFlame';
import { themes, useTheme } from '@/theme/ThemeProvider';
import { font } from '@/theme';

/** Flame and number for each place a name sits: a comment's line, a post's or chat's name, a profile's big name. */
const SIZES = {
  small: { icon: 11, text: 12, gap: 2 },
  medium: { icon: 13, text: 14, gap: 2 },
  large: { icon: 17, text: 18, gap: 3 },
} as const;

/**
 * The streak beside a player's name: the app's own flame (the one on the
 * "6-day streak" pill) in the court's clay, and the number. The owner's
 * pick, style 1 (Oct 5). Pass the days from `shownStreak`; under 3 it draws
 * nothing. The number wears the clay too where clay reads at 4.5:1 on the
 * court's page and cards (Night); elsewhere it takes the text colour and the
 * flame keeps the clay. Over a picture the number is white and the flame a
 * lighter clay, the way the level pill lightens its colour over a clip.
 * A screen reader hears "12-day streak".
 */
export function StreakFlame({ days, size = 'medium', onMedia = false, style, textStyle, maxFontSizeMultiplier }: {
  days: number;
  size?: keyof typeof SIZES;
  /** Over a clip: a white number. */
  onMedia?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Laid on the flame and the number both (a clip's text shadow). */
  textStyle?: StyleProp<TextStyle>;
  maxFontSizeMultiplier?: number;
}) {
  const { theme } = useTheme();
  const palette = themes[theme];
  const { flameInk, numberInk } = useMemo(() => {
    if (onMedia) return { flameInk: mix(palette.clay, palette.onMedia, 0.4), numberInk: palette.onMedia };
    const reads = [palette.bg, palette.surface, palette.bgElevated].every((ground) => contrast(palette.clay, ground) >= 4.5);
    return { flameInk: palette.clay, numberInk: reads ? palette.clay : palette.text };
  }, [onMedia, palette]);
  if (!days) return null;
  const s = SIZES[size];
  return (
    <View
      accessible
      accessibilityLabel={streakLabel(days)}
      // A browser reads a labelled group only as an image; a phone reads the label as it is.
      role={Platform.OS === 'web' ? 'img' : undefined}
      style={[styles.wrap, { gap: s.gap }, style]}
    >
      <Ionicons name="flame" size={s.icon} color={flameInk} style={textStyle} />
      <Text style={[styles.number, { fontSize: s.text, lineHeight: Math.round(s.text * 1.25), color: numberInk }, textStyle]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {days}
      </Text>
    </View>
  );
}

/** `a` moved `t` of the way toward `b` (both #RRGGBB). */
function mix(a: string, b: string, t: number): string {
  const ok = (hex: string) => /^#[0-9a-f]{6}$/i.test(hex);
  if (!ok(a) || !ok(b)) return a;
  const at = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(at(a, i) + (at(b, i) - at(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** The contrast between two #RRGGBB colours, as WCAG counts it (1 to 21). */
function contrast(a: string, b: string): number {
  const light = (hex: string) => {
    const h = hex.replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(h)) return 0;
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const styles = StyleSheet.create({
  // Never squeezed: the name beside it gives way first.
  wrap: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  number: { ...font('600'), letterSpacing: 0 },
});
