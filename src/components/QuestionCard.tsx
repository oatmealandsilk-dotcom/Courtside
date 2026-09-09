import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card, Chip } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import type { Question, QuestionTopic, User } from '@/data/types';
import { colors, spacing, typography } from '@/theme';

export const TOPIC_META: Record<QuestionTopic, { label: string; tint: string; icon: keyof typeof Ionicons.glyphMap }> = {
  gear: { label: 'Gear', tint: colors.clay, icon: 'pricetag-outline' },
  technique: { label: 'Technique', tint: colors.hard, icon: 'hand-left-outline' },
  strategy: { label: 'Strategy', tint: colors.brand, icon: 'git-branch-outline' },
  injury: { label: 'Injury', tint: colors.danger, icon: 'medkit-outline' },
  fitness: { label: 'Fitness', tint: colors.court, icon: 'barbell-outline' },
  rules: { label: 'Rules', tint: colors.warning, icon: 'book-outline' },
  mental: { label: 'Mental', tint: '#8A6BE0', icon: 'bulb-outline' },
};

interface Props {
  question: Question;
  author: User | undefined;
  onPress: () => void;
  answered: boolean;
}

export function QuestionCard({ question, author, onPress, answered }: Props) {
  const meta = TOPIC_META[question.topic];

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.voteBox}>
          <Text style={styles.voteCount}>{question.votes}</Text>
          <Text style={styles.voteLabel}>VOTES</Text>
        </View>

        <View style={styles.main}>
          <Text style={styles.title}>{question.title}</Text>
          <Text style={styles.preview} numberOfLines={2}>
            {question.body}
          </Text>
          <View style={styles.metaRow}>
            <Chip label={meta.label} small selected tint={meta.tint} ink="#0A1120" />
            {question.tags.slice(0, 2).map((tag) => (
              <Chip key={tag} label={`#${tag}`} small />
            ))}
          </View>
          <View style={styles.footer}>
            <Ionicons
              name={answered ? 'checkmark-circle' : 'chatbubbles-outline'}
              size={14}
              color={answered ? colors.court : colors.textFaint}
            />
            <Text style={[styles.footerText, answered && { color: colors.court }]}>
              {question.answerIds.length} {question.answerIds.length === 1 ? 'answer' : 'answers'}
            </Text>
            <Text style={styles.footerText}>
              · {author ? `@${author.handle}` : 'unknown'} · {relativeTime(question.createdAt)}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 0 },
  row: { flexDirection: 'row', gap: spacing.lg },
  voteBox: { alignItems: 'center', width: 44, gap: 1 },
  voteCount: { ...typography.title, color: colors.brand },
  voteLabel: { ...typography.caption, color: colors.textFaint, fontSize: 9 },
  main: { flex: 1, gap: spacing.sm },
  title: { ...typography.heading, color: colors.text, lineHeight: 23 },
  preview: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  metaRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  footerText: { ...typography.small, color: colors.textFaint },
});
