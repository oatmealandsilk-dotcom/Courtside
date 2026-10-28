import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { isHot } from './mock';

/**
 * DESIGN MOCK (design/city-board). The board's two small marks, shared by
 * Find Players, the full board and a city's page.
 *
 * Movement since a week ago, the way a standings table says it: a small
 * caret and a number, green up, red down, nothing when it stayed put (a
 * column of dashes is noise). A city on a run (up 3 or more this week) gets
 * the one filled mark on the board, in the court's own colour, so "moving
 * up fast" is seen from across the table without a flame or an emoji.
 */
export function Movement({ moved, long = false }: { moved: number; long?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!moved) return null;
  if (isHot({ moved })) {
    return (
      <View style={styles.hot} accessibilityLabel={`Up ${moved} places this week`}>
        <Ionicons name="caret-up" size={10} color={colors.brandInk} style={styles.caret} />
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.hotText}>{moved}{long ? ' this week' : ''}</Text>
      </View>
    );
  }
  const up = moved > 0;
  return (
    <View style={styles.move} accessibilityLabel={`${up ? 'Up' : 'Down'} ${Math.abs(moved)} this week`}>
      <Ionicons name={up ? 'caret-up' : 'caret-down'} size={10} color={up ? colors.success : colors.danger} style={styles.caret} />
      <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.moveText, { color: up ? colors.success : colors.danger }]}>{Math.abs(moved)}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  move: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  moveText: { ...font('700'), fontSize: 12, fontVariant: ['tabular-nums'] },
  caret: { marginTop: 1 },
  hot: { flexDirection: 'row', alignItems: 'center', gap: 1, backgroundColor: colors.brand, borderRadius: 999, paddingLeft: 5, paddingRight: 7, height: 20 },
  hotText: { ...font('700'), fontSize: 12, color: colors.brandInk, fontVariant: ['tabular-nums'] },
});
