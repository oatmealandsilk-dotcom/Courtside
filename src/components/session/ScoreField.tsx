import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/ui';
import { readScore, setsWinner, spokenScore } from '@/features/activity/score';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, typography } from '@/theme';

/**
 * A match's score, typed as one line the way players say it ("6-4 3-6
 * 10-7"), your games first (Oct 4, owner: save the score on matches). Under
 * it, what the app read: who won and by how many sets, or why it isn't a
 * score yet. Left empty, the match keeps working as before (Won or Lost
 * only). The caller keeps the text and reads it with readScore.
 */
export function ScoreField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const read = readScore(value);
  const winner = setsWinner(read.sets);
  const mine = read.sets?.filter(([a, b]) => a > b).length ?? 0;
  const theirs = (read.sets?.length ?? 0) - mine;
  const line = read.problem
    ? read.problem
    : read.sets
      ? winner === undefined ? `Level at ${mine} set${mine === 1 ? '' : 's'} each: the result is the one you pick.` : `You ${winner ? 'won' : 'lost'}, ${Math.max(mine, theirs)} set${Math.max(mine, theirs) === 1 ? '' : 's'} to ${Math.min(mine, theirs)}.`
      : 'Your games first, like 6-4 3-6 10-7.';
  return (
    <View style={styles.wrap}>
      <Field
        soft
        value={value}
        onChangeText={(t) => onChange(t.slice(0, 40))}
        placeholder="6-4 3-6 10-7"
        accessibilityLabel={`Score, your games first${read.sets ? `: ${spokenScore(read.sets)}` : ''}`}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
      />
      <Text accessibilityLiveRegion="polite" style={[styles.line, read.problem ? styles.problem : null]}>{line}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: 6 },
  line: { ...typography.small, color: colors.textFaint },
  problem: { color: colors.danger },
});
