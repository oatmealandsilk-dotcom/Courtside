import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { Question } from '@/data/types';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

/**
 * A thread's poll. Before you vote: the options as plain rows to tap. After:
 * each row fills to its share, with the percentage, and yours has a tick.
 * Tap another to change your mind. Nobody sees who voted for what.
 */
export function PollView({ question, compact = false }: { question: Question; compact?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, currentUserId } = useApp();
  const poll = question.poll;
  if (!poll) return null;
  const total = poll.counts.reduce((a, b) => a + b, 0);
  const voted = poll.myVote !== undefined;
  return (
    <View style={styles.wrap}>
      {poll.options.map((option, i) => {
        const share = total ? Math.round((poll.counts[i] ?? 0) / total * 100) : 0;
        const mine = poll.myVote === i;
        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={voted ? `${option}, ${share} percent${mine ? ', your vote' : ''}` : `Vote for ${option}`}
            disabled={!currentUserId}
            onPress={(e) => { e.stopPropagation?.(); actions.votePoll(question.id, i); }}
            style={({ pressed }) => [styles.option, compact && styles.optionCompact, pressed && { opacity: 0.8 }]}
          >
            {voted ? <View style={[styles.fill, mine && styles.fillMine, { width: `${share}%` }]} /> : null}
            <Text style={[styles.label, mine && styles.labelMine]} numberOfLines={2}>{option}</Text>
            {mine ? <Ionicons name="checkmark-circle" size={16} color={colors.brand} /> : null}
            {voted ? <Text style={[styles.share, mine && styles.labelMine]}>{share}%</Text> : null}
          </Pressable>
        );
      })}
      <Text style={styles.meta}>{total === 1 ? '1 vote' : `${total} votes`}{voted ? ' · tap another to change' : ''}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: 8 },
  option: { minHeight: 44, borderRadius: radius.md, backgroundColor: colors.bgElevated, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 14, overflow: 'hidden' },
  optionCompact: { minHeight: 40 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.surfaceAlt },
  fillMine: { backgroundColor: colors.brandDim },
  label: { flex: 1, ...typography.body, fontSize: 15, color: colors.text, paddingVertical: 10 },
  labelMine: { ...font('600'), color: colors.text },
  share: { ...typography.smallStrong, color: colors.textMuted, fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'right' },
  meta: { ...typography.small, color: colors.textFaint },
});
