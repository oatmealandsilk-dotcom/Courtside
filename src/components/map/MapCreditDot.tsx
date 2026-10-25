import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { OSM_COPYRIGHT } from '@/components/map/credits';
import { colors, withAlpha } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';

/** How long the credit stays out before it folds back on its own. */
const SHOWN_MS = 5000;
/** How far the ⓘ's press reaches past the glyph, all round, where a phone's hitSlop cannot (a browser). */
const REACH = 4;

/**
 * OpenStreetMap's credit on a small map picture (the chat's court card, a
 * Courts near you card, the court page's map, Start a session's map), as one
 * tiny ⓘ in the corner the words used to sit in (Oct 25, owner: "For open
 * street map can you just put a small dot instead of the full word").
 *
 * The map's licence asks for its credit where the map shows, so it is never
 * gone, only folded: a tap on the ⓘ lays the credit out beside it in the
 * same small type, a tap on those words opens OpenStreetMap's copyright page,
 * and a second tap on the ⓘ (or five seconds) folds it back. The ⓘ never
 * moves: the words grow away from the corner (`align` names the side it is
 * pinned to), over the map, so nothing around it shifts.
 *
 * The ⓘ and the words are the page's own quiet ink with a soft edge in the
 * page's surface colour, so they read on a light map and a dark one alike.
 * The ⓘ is its own press: on a card that opens the court, a tap on it shows
 * the credit and does not open the court.
 */
export function MapCreditDot({ style, align = 'right', label = '© OpenStreetMap contributors', size = 11, fontSize = 8 }: {
  /** Where it sits on the map: `position: 'absolute'` and the corner's two offsets. */
  style?: StyleProp<ViewStyle>;
  /** The side the ⓘ is pinned to; the words open away from it. */
  align?: 'left' | 'right';
  /** The credit, as it reads once opened. */
  label?: string;
  /** The ⓘ's size. */
  size?: number;
  /** The words' size, the old credit's own. */
  fontSize?: number;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => setOpen(false), SHOWN_MS);
    return () => clearTimeout(t);
  }, [open]);
  // The soft edge: the page's surface, blurred round the ink (a light map's white, a dark map's night).
  const edge = { textShadowColor: withAlpha(colors.surface, 0.95), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 };
  const words = open ? (
    <Animated.View key="words" entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)}>
      <Pressable accessibilityRole="link" accessibilityLabel={`${label}. Opens OpenStreetMap's copyright page`} hitSlop={6}
        onPress={() => { setOpen(false); void Linking.openURL(OSM_COPYRIGHT); }}>
        <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1}
          style={[styles.words, { fontSize, lineHeight: Math.round(fontSize * 1.25) }, edge, align === 'right' ? styles.wordsBefore : styles.wordsAfter]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  ) : null;
  const dot = (
    <Pressable key="dot" accessibilityRole="button" accessibilityLabel={open ? 'Hide map credits' : 'Map credits'} hitSlop={8}
      onPress={() => setOpen((v) => !v)} style={styles.dot}>
      <Ionicons name="information-circle-outline" size={size} color={colors.textMuted} style={[styles.glyph, edge]} />
    </Pressable>
  );
  return (
    <View pointerEvents="box-none" style={[styles.wrap, style]}>
      {align === 'right' ? [words, dot] : [dot, words]}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { position: 'absolute', zIndex: 5, flexDirection: 'row', alignItems: 'center' },
  // The press reaches a little past the glyph on every side, the glyph itself staying in the corner.
  dot: { padding: REACH, margin: -REACH },
  glyph: { opacity: 0.8 },
  words: { color: colors.textFaint, letterSpacing: 0 },
  wordsBefore: { marginRight: 3 },
  wordsAfter: { marginLeft: 3 },
});
