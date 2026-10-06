import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';

import { Field } from '@/components/ui';
import type { PracticeSession } from '@/data/types';
import { readScore, setsWinner, spokenScore } from '@/features/activity/score';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, typography } from '@/theme';

/**
 * A session's score, typed as one line the way players say it ("6-4 3-6
 * 10-7"), your games first (Oct 4, owner: save the score on matches; Oct 6:
 * "well practices can have scores too"). Under it, what the app read: on a
 * match, who won and by how many sets; on a practice or drills, just the
 * sets, since only a match has a result; or why it isn't a score yet. Left
 * empty, the session keeps working as before. The caller keeps the text and
 * reads it with readScore.
 *
 * `focus` puts the caret in it once the sheet has slid up (Share's "Add
 * score" opens the session's edit this way).
 */
export function ScoreField({ value, onChange, kind = 'match', label, focus = false }: {
  value: string;
  onChange: (text: string) => void;
  /** What the session is: a match reads the result back; anything else only the sets. */
  kind?: PracticeSession['kind'];
  /** A label over the box, where there is no section title saying it already. */
  label?: string;
  focus?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const box = useRef<TextInput>(null);
  useEffect(() => {
    if (!focus) return undefined;
    // After the sheet's slide (about a third of a second), so the keyboard does not fight it.
    const t = setTimeout(() => box.current?.focus(), 420);
    return () => clearTimeout(t);
  }, [focus]);
  const match = kind === 'match';
  const read = readScore(value);
  // A set still being typed ("6", "6-4 3-") is not a mistake yet: no red until the rest
  // would be a score without it (Oct 5, review: it went red on the first key). Saving still says why.
  const typing = !!read.problem && !readScore(value.replace(/(^|[\s,;/])\d{1,2}\s*[-–—:]?\s*$/, '$1')).problem;
  const problem = typing ? undefined : read.problem;
  const winner = setsWinner(read.sets);
  const mine = read.sets?.filter(([a, b]) => a > b).length ?? 0;
  const theirs = (read.sets?.length ?? 0) - mine;
  const line = problem
    ? problem
    : !match
      // A practice's sets are only the sets: never a win or a loss, never in the win rate.
      ? read.sets ? `Sets ${mine}–${theirs}. Only matches count toward your win rate.` : 'Your games first, like 6-4 6-3. Only matches count toward your win rate.'
      : read.sets
        ? winner === undefined ? `Level at ${mine} set${mine === 1 ? '' : 's'} each: the result is the one you pick.` : `You ${winner ? 'won' : 'lost'}, ${Math.max(mine, theirs)} set${Math.max(mine, theirs) === 1 ? '' : 's'} to ${Math.min(mine, theirs)}.`
        : 'Your games first, like 6-4 3-6 10-7.';
  return (
    <View style={styles.wrap}>
      <Field
        inputRef={box}
        soft
        label={label}
        value={value}
        onChangeText={(t) => onChange(t.slice(0, 40))}
        placeholder={match ? '6-4 3-6 10-7' : '6-4 6-3'}
        accessibilityLabel={`Score, your games first${read.sets ? `: ${spokenScore(read.sets)}` : ''}`}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
      />
      <Text accessibilityLiveRegion="polite" style={[styles.line, problem ? styles.problem : null]}>{line}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: 6 },
  line: { ...typography.small, color: colors.textFaint },
  problem: { color: colors.danger },
});
