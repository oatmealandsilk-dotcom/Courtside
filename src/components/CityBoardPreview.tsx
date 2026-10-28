import { PRESS_DIM } from '@/theme/press';
import React, { useId, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { BOARD_MONTH, MIN_PLAYERS, cityById, ordinal, rankCities, type RankedCity } from '@/features/cityBoard/mock';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { corner } from '@/theme/look';

/** One row's height: the fade is measured in rows. */
export const ROW_H = 46;

/**
 * DESIGN MOCK (design/city-board). Find Players, under the map, in place of
 * "You're early in …": this month's city board, a few rows of it, fading
 * into the page before the next section, with "See all cities" on the fade.
 * Your city is the tinted row. The whole thing is one tap to the full board.
 *
 * Which rows: the top of the board down past yours when you are near the
 * top; otherwise the top two, a gap, and the rows either side of yours, so
 * the race you are actually in is what you see.
 */
export function CityBoardPreview({ homeCityId }: { homeCityId: string | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const board = useMemo(() => rankCities('total'), []);
  const perBoard = useMemo(() => rankCities('per'), []);
  const mine = board.find((c) => c.id === homeCityId) ?? null;
  const unranked = !mine && homeCityId ? cityById(homeCityId) : null;

  type Item = RankedCity | 'gap';
  const items: Item[] = useMemo(() => {
    if (!mine || mine.rank <= 4) return board.slice(0, Math.max(5, (mine?.rank ?? 0) + 2));
    const near = board.slice(mine.rank - 2, mine.rank + 1);
    return [...board.slice(0, 2), 'gap', ...near];
  }, [board, mine]);

  // One line under the title: where your city stands, in words.
  const line = (() => {
    if (unranked) {
      const short = MIN_PLAYERS - unranked.players;
      return `${unranked.name} needs ${short} more ${short === 1 ? 'player' : 'players'} to make the board.`;
    }
    if (!mine) return 'Tennis logged this month, city by city.';
    const per = perBoard.find((c) => c.id === mine.id);
    if (per && per.rank <= 3 && per.rank < mine.rank) return `${mine.name} is ${ordinal(mine.rank)}, and ${ordinal(per.rank)} per player.`;
    if (mine.rank === 1) return `${mine.name} leads, ${mine.hits - board[1].hits} hits ahead of ${board[1].name}.`;
    const above = board[mine.rank - 2];
    return `${mine.name} is ${ordinal(mine.rank)}, ${above.hits - mine.hits} hits behind ${above.name}.`;
  })();

  // The last rows fade into the page; "See all cities" sits under them. Never into your own row:
  // with only one row after yours, only that one fades.
  const mineAt = mine ? items.indexOf(mine) : -1;
  const after = mineAt >= 0 ? items.length - 1 - mineAt : 2;
  const fadeRows = Math.min(1.7, Math.max(1, after));
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Cities this month. ${line} See all cities`}
      onPress={() => router.push('/city-board')}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: PRESS_DIM }]}
    >
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>Cities this month</Text>
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.month}>{BOARD_MONTH}</Text>
      </View>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.line}>{line}</Text>
      <View style={styles.rows}>
        {items.map((c, i) => (c === 'gap'
          ? <View key="gap" style={styles.gap}><Text style={styles.gapDots}>⋮</Text></View>
          : <BoardRow key={c.id} city={c} mine={c.id === mine?.id} first={i === 0 || items[i - 1] === 'gap' || items[i - 1] === mine || c.id === mine?.id} />))}
        <Fade height={ROW_H * fadeRows} />
      </View>
      {/* Under the faded rows, pulled up into the last of them: "towards the bottom it says, tap to see more". */}
      <View style={styles.more}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.moreText}>See all cities</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </View>
      {/* Not on the board yet: the one ask that gets it there. */}
      {unranked ? (
        <Pressable accessibilityRole="link" accessibilityLabel={`Invite a hitting partner to put ${unranked.name} on the board`} hitSlop={8} onPress={() => router.push('/invite')} style={({ pressed }) => [styles.invite, pressed && { opacity: PRESS_DIM }]}>
          <Ionicons name="paper-plane-outline" size={14} color={colors.brand} />
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.inviteText}>Invite a hitting partner</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** A city's row: its place, its name, its hits. Yours is tinted, nothing else about it shouts. */
export function BoardRow({ city, mine, first, unit = 'hits', value, sub }: { city: RankedCity; mine: boolean; first?: boolean; unit?: string; value?: string; sub?: string | null }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.row, mine ? styles.rowMine : !first && styles.rowLine]}>
      <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.rank, mine && styles.rankMine]}>{city.rank}</Text>
      <View style={styles.nameCol}>
        <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[styles.name, mine && styles.nameMine]}>{city.name}</Text>
        {sub ? <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={styles.sub}>{sub}</Text> : null}
      </View>
      <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.value}>
        <Text style={[styles.valueNum, mine && styles.nameMine]}>{value ?? city.hits}</Text>
        {unit ? <Text style={styles.valueUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

/** The page's own colour, from nothing to solid: the list dissolves into the page rather than ending on a line. */
function Fade({ height }: { height: number }) {
  useTheme();
  const id = useId().replace(/:/g, '');
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} stopOpacity={0} />
            <Stop offset="0.6" stopColor={colors.bg} stopOpacity={0.85} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#f${id})`} />
      </Svg>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: 2 },
  // The section head, as "Open to hit" below it: the title, and a quiet word on the right.
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.xs },
  title: { ...typography.title, color: colors.text },
  month: { ...typography.small, color: colors.textMuted },
  line: { ...typography.small, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.sm },
  rows: {},
  row: { flexDirection: 'row', alignItems: 'center', minHeight: ROW_H, paddingHorizontal: spacing.md, gap: spacing.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  // Yours: the quiet green tint the app uses behind a chosen thing, not a box with a border.
  rowMine: { backgroundColor: colors.brandDim, borderRadius: corner(12) },
  rank: { ...typography.smallStrong, color: colors.textFaint, width: 18, textAlign: 'right', fontVariant: ['tabular-nums'] },
  rankMine: { color: colors.brand },
  nameCol: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text },
  nameMine: { ...font('600'), color: colors.brand },
  sub: { ...typography.small, color: colors.textFaint },
  value: { ...typography.small, color: colors.textFaint },
  valueNum: { ...typography.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  valueUnit: { ...typography.small, color: colors.textFaint },
  gap: { height: 24, justifyContent: 'center', paddingLeft: spacing.md },
  gapDots: { ...typography.bodyStrong, color: colors.textFaint, width: 18, textAlign: 'right', lineHeight: 20 },
  // On the fade, at the very bottom: what the owner asked for ("towards the bottom it says, tap to see more").
  more: { marginTop: -18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 32 },
  moreText: { ...typography.smallStrong, color: colors.textMuted },
  invite: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, alignSelf: 'center' },
  inviteText: { ...typography.smallStrong, color: colors.brand },
});
