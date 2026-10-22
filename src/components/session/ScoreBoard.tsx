import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MatchSet } from '@/data/types';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

/*
 * The ScoreBoard (design preview, Oct 22, ?sig=1 on the web only): a match's
 * score drawn the way a broadcast or a club's paper scoresheet draws it, two
 * rows (you, then them) and a column per set, so the score is CourtSide's own
 * object rather than a line of text. No fill and no shadow: hairlines only,
 * the theme's ink, and one green dot for whoever won the match. A match
 * tiebreak (10-7) is a narrower column of its own under "TB"; a set's
 * tiebreak points are a small raised number after the loser's games.
 */

/** A deciding match tiebreak: the last of two or more sets, played to 10 or more. */
const isMatchTiebreak = (s: MatchSet, i: number, all: MatchSet[]) => all.length >= 2 && i === all.length - 1 && Math.max(s[0], s[1]) >= 10;

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

export function ScoreBoard({ sets, you, them, youWon, size = 'card', headers = false }: {
  sets: MatchSet[];
  you: string;
  them: string;
  youWon?: boolean;
  size?: 'card' | 'row';
  /** The set numbers over the columns (the post page); off on feed cards. */
  headers?: boolean;
}) {
  useTheme();
  if (!sets.length) return null;
  const spoken = spokenBoard(sets, youWon);

  if (size === 'row') {
    return (
      <View accessible accessibilityLabel={spoken} style={styles.rowLine}>
        {youWon !== undefined ? <Text maxFontSizeMultiplier={TextScale.CARD} style={[typography.caption, { color: colors.textMuted, marginRight: spacing.sm }]}>{youWon ? 'W' : 'L'}</Text> : null}
        {sets.map((s, i) => (
          <View key={i} style={[styles.rowSet, i > 0 && { marginLeft: spacing.md }]}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={[typography.bodyStrong, styles.tab, { color: colors.text }]}>
              {isMatchTiebreak(s, i, sets) ? `(${s[0]}-${s[1]})` : `${s[0]}-${s[1]}`}
            </Text>
            {s[2] != null ? <Text maxFontSizeMultiplier={TextScale.CARD} style={[typography.caption, styles.tab, styles.raise, { color: colors.textMuted }]}>{s[2]}</Text> : null}
          </View>
        ))}
      </View>
    );
  }

  const hair = StyleSheet.hairlineWidth;
  const line = colors.border;
  const players: { name: string; side: 0 | 1; won?: boolean }[] = [
    { name: you, side: 0, won: youWon === true },
    { name: them, side: 1, won: youWon === false },
  ];
  return (
    <View accessible accessibilityLabel={spoken} style={{ borderTopWidth: hair, borderBottomWidth: hair, borderColor: line, paddingVertical: spacing.sm }}>
      {headers ? (
        <View style={[styles.line, { height: 18 }]}>
          <View style={[styles.name, { borderRightWidth: hair, borderColor: 'transparent' }]} />
          {sets.map((s, i) => (
            <Text key={i} style={[typography.caption, styles.tab, { width: (isMatchTiebreak(s, i, sets) ? 30 : 24) + (s[2] != null ? 13 : 0), paddingRight: s[2] != null ? 13 : 0, textAlign: 'right', color: colors.textFaint, marginLeft: spacing.sm }]} maxFontSizeMultiplier={TextScale.CARD}>
              {isMatchTiebreak(s, i, sets) ? 'TB' : String(i + 1)}
            </Text>
          ))}
        </View>
      ) : sets.some(isMatchTiebreak) ? (
        <View style={[styles.line, { height: 14 }]}>
          <View style={styles.name} />
          {sets.map((s, i) => (
            <Text key={i} style={[typography.caption, { width: (isMatchTiebreak(s, i, sets) ? 30 : 24) + (s[2] != null ? 13 : 0), paddingRight: s[2] != null ? 13 : 0, textAlign: 'right', color: colors.textFaint, marginLeft: spacing.sm }]} maxFontSizeMultiplier={TextScale.CARD}>
              {isMatchTiebreak(s, i, sets) ? 'TB' : ''}
            </Text>
          ))}
        </View>
      ) : null}
      {players.map((p) => (
        <View key={p.side} style={[styles.line, { height: 32, paddingHorizontal: 0 }, p.side === 1 && { borderTopWidth: hair, borderColor: line }]}>
          <View style={[styles.name, { borderRightWidth: hair, borderColor: line, paddingRight: spacing.md }]}>
            {p.won ? <View style={[styles.dot, { backgroundColor: colors.brand }]} /> : <View style={styles.dotRoom} />}
            <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} ellipsizeMode="tail" style={[typography.smallStrong, { color: colors.text, flexShrink: 1 }]}>{p.name}</Text>
          </View>
          {sets.map((s, i) => {
            const mine = s[p.side];
            const theirs = s[p.side === 0 ? 1 : 0];
            const tookSet = mine > theirs;
            const mtb = isMatchTiebreak(s, i, sets);
            return (
              <View key={i} style={[styles.cell, { marginLeft: spacing.sm }]}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={[mtb ? typography.heading : typography.title, styles.tab, { width: mtb ? 30 : 24, textAlign: 'right', ...font(tookSet ? '600' : '400'), letterSpacing: 0, color: tookSet ? colors.text : colors.textFaint }]}>{mine}</Text>
                {s[2] != null ? <Text maxFontSizeMultiplier={TextScale.CARD} style={[typography.caption, styles.tab, styles.slot, { color: colors.textMuted }]}>{tookSet ? '' : s[2]}</Text> : null}
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
  raise: { position: 'relative', top: -6, marginLeft: 1 },
  slot: { width: 12, marginLeft: 1, alignSelf: 'flex-start', marginTop: 2 },
  rowLine: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'nowrap' },
  rowSet: { flexDirection: 'row', alignItems: 'flex-start' },
  line: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 },
  name: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  dotRoom: { width: 12 },
  cell: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', alignSelf: 'stretch' },
});
