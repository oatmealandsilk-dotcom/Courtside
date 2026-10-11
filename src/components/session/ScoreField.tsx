import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextInput, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { Field } from '@/components/ui';
import type { ID, PracticeSession } from '@/data/types';
import { readScore, scoreText, setsWinner, spokenScore } from '@/features/activity/score';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, typography } from '@/theme';

/**
 * A session's score, typed as one line the way players say it ("6-4 3-6
 * 10-7"), your games first (Oct 4, owner: save the score on matches; Oct 6:
 * "well practices can have scores too"), a tiebreak's points and a match
 * tiebreak in brackets ("7-6(5) 3-6 (10-7)", Oct 10). Under it, what the app read: on a
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
  // Nor are brackets still open ("7-6(", "6-4 3-6 (10-"): tiebreak points (Oct 10).
  const typing = !!read.problem && !readScore(value.replace(/(^|[\s,;/])\d{1,2}\s*[-–—:]?\s*$|\s*[([][^)\]]*$/, '$1')).problem;
  const problem = typing ? undefined : read.problem;
  const winner = setsWinner(read.sets);
  const mine = read.sets?.filter(([a, b]) => a > b).length ?? 0;
  const theirs = (read.sets?.length ?? 0) - mine;
  const line = problem
    ? problem
    : !match
      // A practice's sets are only the sets: never a win or a loss, never in the win rate.
      // Once it reads, just the score as it will show, kept short (Oct 6, review).
      ? read.sets ? scoreText(read.sets) : 'Your games first, like 6-4 7-6(5). Not counted in your win rate.'
      : read.sets
        ? winner === undefined ? `Level at ${mine} set${mine === 1 ? '' : 's'} each: the result is the one you pick.` : `You ${winner ? 'won' : 'lost'}, ${Math.max(mine, theirs)} set${Math.max(mine, theirs) === 1 ? '' : 's'} to ${Math.min(mine, theirs)}.`
        // A tiebreak's points and a match tiebreak, in brackets (Oct 10, owner: "You should be able to
        // use () in caption for match score", then "Or if you play a tiebreaker in liu of 3rd set").
        : 'Your games first, like 7-6(5) 3-6 (10-7).';
  return (
    <View style={styles.wrap}>
      <Field
        inputRef={box}
        soft
        label={label}
        value={value}
        // Room for five sets with their tiebreaks in brackets ("7-6 (10-8)").
        onChangeText={(t) => onChange(t.slice(0, 60))}
        placeholder={match ? '6-4 3-6 10-7' : '6-4 6-3'}
        accessibilityLabel={`Score, your games first${read.sets ? `: ${spokenScore(read.sets)}` : ''}`}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
        // No "AutoFill" bubble over the hint below: a score is never a saved password or address.
        autoComplete="off"
      />
      <Text accessibilityLiveRegion="polite" style={[styles.line, problem ? styles.problem : null]}>{line}</Text>
    </View>
  );
}

/**
 * The quiet "Add score" link (Oct 6) for a tennis session of yours that has
 * none yet, on Share and on the post being made from it: it opens the
 * session's edit with the caret in the score box, and Save comes back here
 * with the card showing it. A link, never a box: the score lives in the log.
 */
export function AddScore({ sessionId, style }: { sessionId: ID; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Add score to this session"
      hitSlop={8}
      onPress={() => router.push({ pathname: '/log-session', params: { edit: sessionId, focus: 'score' } })}
      style={({ pressed }) => [styles.addScore, style, pressed && styles.pressed]}
    >
      <Ionicons name="add" size={15} color={colors.textMuted} />
      <Text style={styles.addScoreText}>Add score</Text>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: 6 },
  addScore: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 3, paddingVertical: 2 },
  addScoreText: { ...typography.smallStrong, color: colors.textMuted },
  pressed: { opacity: 0.7 },
  line: { ...typography.small, color: colors.textFaint },
  problem: { color: colors.danger },
});
