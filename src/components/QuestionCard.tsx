import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { VoteControls } from './VoteControls';
import { useApp } from '@/store/AppContext';
import { LevelPill } from '@/components/LevelPill';
import { Avatar, Card, Chip } from '@/components/ui';
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
  showBody?: boolean;
  question: Question;
  author: User | undefined;
  onPress: () => void;
  answered: boolean;
  saved?: boolean;
  onToggleSave?: () => void;
  onShare?: () => void;
}

export function QuestionCard({
  question,
  author,
  onPress,
  answered,
  saved = false,
  onToggleSave,
  onShare,
  showBody = false,
}: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const meta = TOPIC_META[question.topic];
  const { currentUserId, actions } = useApp();

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {author && <Avatar name={author.name} seed={author.avatarSeed} size={30} />}
        <PlayerName userId={author?.id} style={styles.footerText}>@{author?.handle ?? 'player'}</PlayerName>
        {author && <LevelPill profile={author.profile} small />}
        <Text style={[styles.footerText, { marginLeft: 'auto' }]}>{relativeTime(question.createdAt)}</Text>
      </View>
      <Text style={styles.title}>{question.title}</Text>
      {showBody && !!question.body && <Text style={styles.preview}>{question.body}</Text>}
      <View style={styles.footer}>
        <VoteControls item={question} userId={currentUserId} onVote={direction => actions.voteQuestion(question.id, direction)} />
        <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted} style={{ marginLeft: 12 }} /><Text style={styles.footerText}>{question.answerIds.length}</Text>
        <Chip label={meta.label} small />
        {answered && <Ionicons name="checkmark-circle" size={16} color={colors.court} />}

        <View style={styles.spacer} />
        {onShare ? (
          <Pressable
            onPress={onShare}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Share this discussion"
          >
            <Ionicons name="paper-plane-outline" size={17} color={colors.textMuted} />
          </Pressable>
        ) : null}
        {onToggleSave ? (
          <Pressable
            onPress={onToggleSave}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove from saved' : 'Save this discussion'}
            style={{ marginLeft: 14 }}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={17}
              color={saved ? colors.brand : colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { gap: 16, borderWidth: 0, borderBottomWidth: 1, borderRadius: 0, paddingHorizontal: 0, paddingVertical: 20, backgroundColor: colors.bg },
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
  spacer: { flex: 1 },
});
