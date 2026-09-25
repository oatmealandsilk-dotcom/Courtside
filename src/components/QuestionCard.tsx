import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { memo } from 'react';
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
import { openTopic } from '@/features/community/openTopic';
import { colors, spacing, typography, radius } from '@/theme';

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

function QuestionCardInner({
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
        {/* Who wrote it, the way the feed says it: the name first, the handle
            after it. A thread carried in from outside keeps to the handle —
            the badge beside it already says where it came from. */}
        <PlayerName userId={author?.id} style={styles.footerText} numberOfLines={1}>
          {author && !question.source ? <Text style={styles.footerName}>{author.name} </Text> : null}
          @{author?.handle ?? 'player'}
        </PlayerName>
        {question.source ? (
          <View style={styles.sourceBadge}>
            <Ionicons name={question.source.name === 'reddit' ? 'logo-reddit' : 'globe-outline'} size={12} color={colors.textMuted} />
            <Text style={styles.sourceText}>{question.source.label}</Text>
          </View>
        ) : author ? <LevelPill profile={author.profile} small /> : null}
        {brandCorner ? null : <Text style={[styles.footerText, { marginLeft: 'auto' }]}>{relativeTime(question.createdAt)}{question.editedAt ? ' · Edited' : ''}</Text>}
      </View>
      <Text style={styles.title}>{question.title}</Text>
      {showBody && !!question.body && <RichText style={styles.preview}>{question.body}</RichText>}
      <View style={styles.metaRow}>
        {/* The topic is a tag in its own colour: a tap shows every thread under it. */}
        <Pressable accessibilityRole="button" accessibilityLabel={`${meta.label} threads`} onPress={() => openTopic(question.topic)} hitSlop={6} style={({ pressed }) => [styles.tag, { borderColor: meta.tint }, pressed && { opacity: 0.7 }]}>
          <Text style={[styles.tagText, { color: meta.tint }]}>{meta.label}</Text>
        </Pressable>
        {answered ? (
          <View style={[styles.tag, styles.tagDone]}>
            <Ionicons name="checkmark" size={11} color={colors.court} />
            <Text style={[styles.tagText, { color: colors.court }]}>Answered</Text>
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
          <Text style={styles.actionLabel}>{question.answerIds.length + (question.source?.replies ?? 0)}</Text>
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
  card: { gap: 16, borderWidth: 0, borderBottomWidth: 1, borderRadius: 0, paddingHorizontal: 0, paddingVertical: 20, backgroundColor: 'transparent' },
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
  footerName: { ...typography.smallStrong, color: colors.text },
  // Bigger targets and full-strength ink: these were competing with body text
  // at 16px and textFaint, which read as decoration rather than buttons.
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  actionLabel: { ...typography.smallStrong, color: colors.text },
  sourceBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surfaceAlt },
  sourceText: { ...typography.caption, color: colors.textMuted, letterSpacing: 0 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  tagDone: { borderColor: colors.brandDim, backgroundColor: colors.brandDim },
  tagText: { ...typography.caption, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  spacer: { flex: 1 },
});

/** Re-renders only when a shown value changes; the handlers passed in read fresh values through their own props, so a new function alone is no reason to rebuild. */
export const QuestionCard = memo(QuestionCardInner, (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = (a as Record<string, unknown>)[k]; const y = (b as Record<string, unknown>)[k];
    if (typeof x === 'function' && typeof y === 'function') continue;
    if (x !== y) return false;
  }
  return true;
});
