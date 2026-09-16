import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { VoteControls } from './VoteControls';
import { RichText } from '@/components/RichText';
import { useApp } from '@/store/AppContext';
import { LevelPill } from '@/components/LevelPill';
import { Avatar, Card, Chip } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import type { Question, QuestionTopic, User } from '@/data/types';
import { Tappable } from '@/components/Tappable';
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
  /** The home feed: the page carries the CourtSide mark up by its eyebrow, so no date here. */
  brandCorner?: boolean;
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
  brandCorner = false,
}: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const meta = TOPIC_META[question.topic];
  const { currentUserId, actions } = useApp();

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {author && <Avatar name={author.name} seed={author.avatarSeed} size={30} />}
        <PlayerName userId={author?.id} style={styles.footerText}>@{author?.handle ?? 'player'}</PlayerName>
        {question.source ? (
          <View style={styles.sourceBadge}>
            <Ionicons name={question.source.name === 'reddit' ? 'logo-reddit' : 'globe-outline'} size={12} color={colors.textMuted} />
            <Text style={styles.sourceText}>{question.source.label}</Text>
          </View>
        ) : author ? <LevelPill profile={author.profile} small /> : null}
        {brandCorner ? null : <Text style={[styles.footerText, { marginLeft: 'auto' }]}>{relativeTime(question.createdAt)}</Text>}
      </View>
      <Text style={styles.title}>{question.title}</Text>
      {showBody && !!question.body && <RichText style={styles.preview}>{question.body}</RichText>}
      <View style={styles.metaRow}>
        <Chip label={meta.label} small />
        {answered ? (
          <View style={styles.answered}>
            <Ionicons name="checkmark-circle" size={14} color={colors.court} />
            <Text style={styles.answeredText}>Answered</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <VoteControls item={question} userId={currentUserId} onVote={direction => actions.voteQuestion(question.id, direction)} />

        <Tappable
          accessibilityLabel={`${question.answerIds.length} replies`}
          onPress={onPress ?? (() => undefined)}
          style={styles.action}
        >
          <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
          <Text style={styles.actionLabel}>{question.answerIds.length || question.source?.replies || 0}</Text>
        </Tappable>

        {onShare ? (
          <Tappable accessibilityLabel="Share this discussion" onPress={onShare} style={styles.action}>
            <Ionicons name="arrow-redo-outline" size={20} color={colors.text} />
            <Text style={styles.actionLabel}>{question.shares ?? 0}</Text>
          </Tappable>
        ) : null}

        <View style={styles.spacer} />

        {onToggleSave ? (
          <Tappable
            accessibilityLabel={saved ? 'Remove from saved' : 'Save this discussion'}
            onPress={onToggleSave}
            style={styles.action}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={saved ? colors.brand : colors.text}
            />
          </Tappable>
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
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.xs },
  footerText: { ...typography.small, color: colors.textFaint },
  // Bigger targets and full-strength ink: these were competing with body text
  // at 16px and textFaint, which read as decoration rather than buttons.
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  actionLabel: { ...typography.smallStrong, color: colors.text },
  sourceBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surfaceAlt },
  sourceText: { ...typography.caption, color: colors.textMuted, letterSpacing: 0 },
  answered: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  answeredText: { ...typography.caption, color: colors.court },
  spacer: { flex: 1 },
});
