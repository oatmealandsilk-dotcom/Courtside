import { PRESS_DIM } from '@/theme/press';
import React, { useId } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Avatar } from '@/components/ui';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, typography, withAlpha } from '@/theme';
import { TextScale } from '@/theme/textScale';
import type { FillFace } from './fill';
import { MEDAL_LOOK, isHot } from './mock';

/** 1st, 2nd and 3rd: each one's metal, as [ink, coin], read from the live theme as it draws. */
const metalOf = (rank: number): [string, string] | null =>
  rank === 1 ? [colors.medalGold, colors.medalGoldFill]
    : rank === 2 ? [colors.medalSilver, colors.medalSilverFill]
      : rank === 3 ? [colors.medalBronze, colors.medalBronzeFill]
        : null;

/** Whether a place wears a coin (1st to 3rd, in the coin look). */
export const hasCoin = (rank: number) => MEDAL_LOOK === 'coin' && rank >= 1 && rank <= 3;

/** In the 'ink' look, a podium place's numeral colour (its metal); otherwise null and the numeral keeps its own. */
export const medalInk = (rank: number): string | null => (MEDAL_LOOK === 'ink' ? metalOf(rank)?.[0] ?? null : null);

/**
 * DESIGN MOCK (design/city-board), round 3. Owner, Oct 28: "have first
 * second third be gold silver bronze". The place's numeral on a small coin
 * of its metal: a pale disc (deep on a dark court), a fine rim in the
 * metal's ink with a second one just inside it (a coin's raised edge), the
 * faintest light across its top, and the numeral in the metal's ink. Flat
 * and small, so it reads as a medal table's 1-2-3, not a cartoon medal. The
 * coin is what makes silver read as silver: a grey numeral alone looks like
 * a place further down.
 */
export function Medal({ rank, size, fontSize }: { rank: number; size: number; fontSize: number }) {
  useTheme();
  const id = useId().replace(/:/g, '');
  const metal = metalOf(rank);
  if (!metal) return null;
  const [ink, fill] = metal;
  const dark = pageIsDark();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: fill, borderWidth: 1, borderColor: withAlpha(ink, dark ? 0.5 : 0.36), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={`m${id}`} x1="0.2" y1="0" x2="0.6" y2="1">
              <Stop offset="0" stopColor={colors.onMedia} stopOpacity={dark ? 0.1 : 0.55} />
              <Stop offset="0.55" stopColor={colors.onMedia} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#m${id})`} />
        </Svg>
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', top: 2.5, left: 2.5, right: 2.5, bottom: 2.5, borderRadius: size / 2, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ink, dark ? 0.3 : 0.22) }} />
      <Text maxFontSizeMultiplier={1} style={{ ...font('700'), fontSize, lineHeight: Math.round(fontSize * 1.15), letterSpacing: -0.3, color: ink, fontVariant: ['tabular-nums'], textAlign: 'center', includeFontPadding: false }}>{rank}</Text>
    </View>
  );
}

/**
 * DESIGN MOCK, round 3. A face after the ringed ones in Up to hit: a
 * regular here, a plain circle (no ring: the ring only ever means "up
 * today"), first name, and when they usually play. Opens their profile.
 * `size`: the face; the box round it is the ringed faces' box, so names
 * line up across the row.
 */
export function FilledFace({ face, size, width, top = 2, onPress }: { face: FillFace; size: number; width: number; /** Room above the face, so the names line up with the ringed faces' in the same row. */ top?: number; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const box = size + 13;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${face.user.name}, ${face.spoken}. Open profile`} onPress={onPress} style={({ pressed }) => [styles.fillItem, { width, paddingTop: top }, pressed && { opacity: PRESS_DIM }]}>
      <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
        <Avatar name={face.user.name} seed={face.user.avatarSeed} uri={face.user.avatarUrl} size={size} ring={face.user.isCoach} />
      </View>
      <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.fillName}>{face.user.name.split(' ')[0]}</Text>
      {/* Two short lines, each kept whole: "Usually" / "evenings". */}
      <View style={styles.fillLines}>
        <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.fillLine}>{face.lines[0]}</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.fillLine}>{face.lines[1]}</Text>
      </View>
    </Pressable>
  );
}

/** Between the ringed faces and the filled ones: a short hairline, the height of a face. */
export function FillDivider({ size }: { size: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return <View style={[styles.divider, { height: size - 8, marginTop: (size + 13 - (size - 8)) / 2 + 2 }]} />;
}

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
  fillItem: { alignItems: 'center', gap: 3, paddingBottom: 2 },
  fillLines: { alignSelf: 'stretch', alignItems: 'center' },
  fillName: { ...typography.smallStrong, color: colors.text, marginTop: 2 },
  fillLine: { ...typography.caption, ...font('500'), letterSpacing: 0, color: colors.textMuted, textAlign: 'center' },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginHorizontal: 6, alignSelf: 'flex-start' },
});
