import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { MatchSet } from '@/data/types';
import { matchTiebreakAt, spokenScore } from '@/features/activity/score';
import { numFont, numberFace } from '@/theme';

/** The number face's figures are all this wide, bold, as a share of the size (Barlow Semi Condensed's 0.521). */
const DIGIT = 0.521;
/** A tiebreak's points, as a share of the games' size. */
const POINTS = 0.46;
/** The room between two sets, as a share of the games' size: a tiebreak's points hang into it. */
const GAP = 0.62;
/** A match tiebreak played instead of a deciding set, as a share of the games' size. */
const DECIDER = 0.8;

const digits = (n: number) => String(n).length;

/**
 * How wide a score laid out by SetScores is at `size`, so a card can keep room
 * for it beside the time.
 */
export function setScoresWidth(sets: MatchSet[], size: number): number {
  const columns = sets.reduce((sum, [a, b], i) => sum + Math.max(digits(a), digits(b)) * DIGIT * size * (matchTiebreakAt(sets, i) ? DECIDER : 1), 0);
  const last = sets[sets.length - 1];
  const hanging = last && last[2] !== undefined ? 2 + digits(last[2]) * DIGIT * POINTS * size : 0;
  return Math.ceil(columns + GAP * size * (sets.length - 1) + hanging);
}

/**
 * A score laid out like a scoreboard (Oct 12, owner, of the audit's "scores
 * like a scoreboard": "ship 8 as well"): a column for each set, the logger's
 * games over the other side's, in the number face. Whoever took the set has
 * their games bolder and in the full ink, the other side's lighter and
 * quieter. A tiebreak's points sit small and raised after the loser's games,
 * the way a scoreboard writes 7–6(5); a match tiebreak played instead of a
 * deciding set (10–7) is the last column, a size smaller, as the brackets
 * set it apart in "7–6(5) 3–6 (10–7)". The same score and the same words as
 * before; only the layout is new. Where a score must stay on one line it
 * stays the text (scoreText), in the number face.
 */
export function SetScores({ sets, size, ink, quiet, style, accessible = true, maxGrow = 1.2 }: {
  sets: MatchSet[];
  /** The games' size. */
  size: number;
  /** The set winner's games. */
  ink: string;
  /** The set loser's games and a tiebreak's points. */
  quiet: string;
  style?: StyleProp<ViewStyle>;
  /** Off inside something that already says the score to a screen reader (a card read as one). */
  accessible?: boolean;
  maxGrow?: number;
}) {
  const line = Math.round(size * 1.12);
  const last = sets[sets.length - 1];
  const hanging = last && last[2] !== undefined ? setScoresWidth([last], size) - setScoresWidth([[last[0], last[1]]], size) : 0;
  return (
    <View
      accessible={accessible}
      accessibilityRole={accessible ? 'text' : undefined}
      accessibilityLabel={accessible ? `Score ${spokenScore(sets)}` : undefined}
      style={[styles.board, { columnGap: Math.round(GAP * size), paddingRight: hanging }, style]}
    >
      {sets.map(([a, b, points], i) => {
        const games = matchTiebreakAt(sets, i) ? Math.round(size * DECIDER) : size;
        const small = Math.round(size * POINTS);
        const smallLine = Math.round(small * 1.2);
        // The points' figures' tops level with the games' (both centred in their line boxes).
        const top = Math.round((line / 2 + numberFace.centre * games - numberFace.cap * games) - (smallLine / 2 + numberFace.centre * small - numberFace.cap * small));
        const cell = (n: number, won: boolean, tiebreak: number | undefined) => (
          <View style={styles.cell}>
            <Text maxFontSizeMultiplier={maxGrow} style={{ ...numFont(won ? '700' : '500'), fontSize: games, lineHeight: line, letterSpacing: numberFace.tracking * games, color: won ? ink : quiet }}>{n}</Text>
            {tiebreak !== undefined ? (
              <Text maxFontSizeMultiplier={maxGrow} style={[styles.points, { ...numFont('600'), fontSize: small, lineHeight: smallLine, top, color: quiet }]}>{tiebreak}</Text>
            ) : null}
          </View>
        );
        return (
          <View key={i} style={styles.set}>
            {cell(a, a > b, a < b ? points : undefined)}
            {cell(b, b > a, b < a ? points : undefined)}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', alignItems: 'center' },
  set: { alignItems: 'center' },
  cell: { flexDirection: 'row' },
  // Hangs after the games, outside the column, so the sets stay centred over each other.
  points: { position: 'absolute', left: '100%', marginLeft: 1 },
});
