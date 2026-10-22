import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MatchSet } from '@/data/types';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { DrawnTick } from './DrawnTick';

/*
 * The ScoreBoard (design preview, Oct 22, ?sig=1 on the web only): a match's
 * score drawn the way a club's scoreboard draws it, two rows (you, then them)
 * and a column per set, so the score is CourtSide's own object rather than a
 * line of text. On a feed card it is the hero: big games, the set's winner in
 * ink and the loser faint. No fill, no box, no vertical rules: one hairline
 * over it, one under it, one between the rows. Whoever won the match has
 * their name in bold; a small tick in the court's colour marks only your
 * own win, never the other player's. A set's tiebreak points are a small
 * raised number in a slot of its own after the loser's games, so the games
 * stay in a straight column; a deciding match tiebreak (10-7) is the last
 * column in smaller numbers ("1 2 TB" over the columns on the post page).
 */

/** A deciding match tiebreak: the last of two or more sets, played to 10 or more. */
export const isMatchTiebreak = (s: MatchSet, i: number, all: MatchSet[]) => all.length >= 2 && i === all.length - 1 && Math.max(s[0], s[1]) >= 10;

/** What a screen reader says: "Won 7-6, tiebreak 7-5; 3-6; match tiebreak 10-7". */
export function spokenBoard(sets: MatchSet[], youWon?: boolean): string {
  const parts = sets.map((s, i) => {
    if (isMatchTiebreak(s, i, sets)) return `match tiebreak ${s[0]}-${s[1]}`;
    const tb = s[2] != null ? `, tiebreak ${s[0] > s[1] ? `${Math.max(7, s[2] + 2)}-${s[2]}` : `${s[2]}-${Math.max(7, s[2] + 2)}`}` : '';
    return `${s[0]}-${s[1]}${tb}`;
  });
  const lead = youWon === undefined ? '' : youWon ? 'Won ' : 'Lost ';
  return `${lead}${parts.join('; ')}`;
}

/** Each size's numbers: games, the match tiebreak, the raised tiebreak points, a row's height, a column's width and the gap between columns. */
const SIZES = {
  card: { games: 30, mtb: 20, tb: 11, row: 42, col: 22, mtbCol: 26, slot: 10, gap: 14, name: 15 },
  page: { games: 22, mtb: 17, tb: 10, row: 34, col: 18, mtbCol: 22, slot: 9, gap: 12, name: 15 },
  mini: { games: 15, mtb: 12, tb: 8, row: 19, col: 11, mtbCol: 15, slot: 6, gap: 7, name: 0 },
} as const;

export function ScoreBoard({ sets, you, them, youWon, size = 'card', headers = false }: {
  sets: MatchSet[];
  you: string;
  /** The other side's name; empty when it is not known, which draws a quiet dash rather than a made-up "Opponent". */
  them?: string;
  youWon?: boolean;
  /** card: a feed post's hero. page: the post page, with headers. mini: two small rows with no names, for a list row. */
  size?: 'card' | 'page' | 'mini';
  /** The set numbers over the columns ("1 2 TB"); the post page only. */
  headers?: boolean;
}) {
  useTheme();
  if (!sets.length) return null;
  const z = SIZES[size];
  const named = size !== 'mini';
  const hair = StyleSheet.hairlineWidth;
  const spoken = spokenBoard(sets, youWon);
  const hasTb = (i: number) => sets[i][2] != null;
  const colWidth = (s: MatchSet, i: number) => (isMatchTiebreak(s, i, sets) ? z.mtbCol : z.col) + (hasTb(i) ? z.slot : 0);
  const rows: { name: string; side: 0 | 1; wonMatch: boolean }[] = [
    { name: you, side: 0, wonMatch: youWon === true },
    { name: them ?? '', side: 1, wonMatch: youWon === false },
  ];
  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={named ? { borderTopWidth: hair, borderBottomWidth: hair, borderColor: colors.border } : null}
    >
      {headers && named ? (
        <View style={[styles.line, { height: 20, paddingTop: 4 }]}>
          <View style={styles.name} />
          {sets.map((s, i) => (
            <Text key={i} maxFontSizeMultiplier={TextScale.CARD} style={[typography.caption, styles.tab, { width: colWidth(s, i), paddingRight: hasTb(i) ? z.slot : 0, marginLeft: z.gap, textAlign: 'right', color: colors.textFaint }]}>
              {isMatchTiebreak(s, i, sets) ? 'TB' : String(i + 1)}
            </Text>
          ))}
        </View>
      ) : null}
      {rows.map((p) => (
        <View key={p.side} style={[styles.line, { height: z.row }, p.side === 1 && named && { borderTopWidth: hair, borderColor: colors.border }]}>
          {named ? (
            <View style={styles.name}>
              <Text
                maxFontSizeMultiplier={TextScale.CARD}
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[{ fontSize: z.name, letterSpacing: -0.15, flexShrink: 1 }, font(p.wonMatch ? '600' : '400'), { color: p.name ? (p.wonMatch ? colors.text : colors.textMuted) : colors.textFaint }]}
              >
                {p.name || '—'}
              </Text>
              {p.wonMatch && p.side === 0 ? <View style={styles.tick}><DrawnTick size={15} color={colors.brand} /></View> : null}
            </View>
          ) : null}
          {sets.map((s, i) => {
            const mine = s[p.side];
            const tookSet = mine > s[p.side === 0 ? 1 : 0];
            const mtb = isMatchTiebreak(s, i, sets);
            const games = mtb ? z.mtb : z.games;
            return (
              <View key={i} style={[styles.cell, { width: colWidth(s, i), marginLeft: i === 0 && !named ? 0 : z.gap }]}>
                <Text
                  maxFontSizeMultiplier={TextScale.CARD}
                  style={[styles.tab, { fontSize: games, lineHeight: Math.round(games * 1.15), letterSpacing: 0, width: mtb ? z.mtbCol : z.col, textAlign: 'right' }, font(tookSet ? '600' : '400'), { color: tookSet ? colors.text : colors.textFaint }]}
                >
                  {mine}
                </Text>
                {hasTb(i) ? (
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.tab, { width: z.slot, fontSize: z.tb, lineHeight: z.tb + 2, paddingLeft: 1, alignSelf: 'flex-start', marginTop: Math.round((z.row - games * 1.15) / 2) - 1 }, font('500'), { color: colors.textMuted }]}>
                    {tookSet ? '' : s[2]}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { fontVariant: ['tabular-nums'] },
  line: { flexDirection: 'row', alignItems: 'center' },
  name: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: spacing.sm },
  tick: { marginTop: 1 },
  cell: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
});
