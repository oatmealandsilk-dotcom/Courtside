import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { ClipVideo } from '@/components/ClipVideo';
import { Avatar, Button, Chip, EmptyState, Field, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { RichText } from '@/components/RichText';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/** One Ask-a-Coach thread: the player's question and every coach reply. */
export default function CoachQuestionDetail() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { coachQuestions, coachReplies, users, coaches, currentUser, currentUserId, actions } = useApp();
  const [draft, setDraft] = useState('');

  const question = coachQuestions.find((q) => q.id === id);
  if (!question) {
    return (
      <Screen title="Question" compactTitle onBack={() => goBack()}>
        <EmptyState title="Question not found" body="It may have been removed." />
      </Screen>
    );
  }

  const author = users.find((u) => u.id === question.authorId);
  const replies = question.replyIds
    .map((rid) => coachReplies.find((r) => r.id === rid))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .sort((a, b) => b.helpfulBy.length - a.helpfulBy.length);

  const iAmCoach = Boolean(currentUser?.isCoach);

  return (
    <Screen title="Ask a coach" compactTitle onBack={() => goBack()}>
      <View style={styles.head}>
        <View style={styles.authorRow}>
          <Avatar name={author?.name ?? '?'} seed={author?.avatarSeed ?? question.id} size={38} />
          <View style={{ flex: 1 }}>
            <PlayerName userId={author?.id} style={styles.authorName}>{author?.name ?? 'Player'}</PlayerName>
            <PlayerName userId={author?.id} style={styles.meta}>
              @{author?.handle ?? 'player'} · {relativeTime(question.createdAt)}
            </PlayerName>
          </View>
          <Chip label={question.specialty} small />
        </View>

        <Text style={styles.title}>{question.title}</Text>
        <RichText style={styles.body}>{question.body}</RichText>

        {question.videoUrl ? (
          <ClipVideo uri={question.videoUrl} />
        ) : question.mediaLabel ? (
          <MediaPlaceholder label={question.mediaLabel} seed={question.id} />
        ) : null}

        <View style={styles.statusRow}>
          <Ionicons
            name={question.resolved ? 'checkmark-circle' : 'time-outline'}
            size={16}
            color={question.resolved ? colors.success : colors.textMuted}
          />
          <Text style={styles.meta}>
            {question.resolved
              ? 'Answered'
              : replies.length
                ? `${replies.length} coach ${replies.length === 1 ? 'reply' : 'replies'}`
                : 'Waiting on a coach'}
          </Text>
          {question.authorId === currentUserId && replies.length ? (
            <Pressable accessibilityRole="button" accessibilityLabel={question.resolved ? 'Reopen the question' : 'This answered it'} onPress={() => actions.resolveCoachQuestion(question.id)} hitSlop={8} style={{ marginLeft: 'auto' }}>
              <Text style={[styles.meta, { color: colors.brand, fontWeight: '700' }]}>{question.resolved ? 'Reopen' : 'This answered it'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={styles.sectionTitle}>
        {replies.length ? 'COACH REPLIES' : 'NO REPLIES YET'}
      </Text>

      {replies.map((reply) => {
        const coachUser = users.find((u) => u.id === reply.coachUserId);
        const coach = coaches.find((c) => c.userId === reply.coachUserId);
        const helpful = Boolean(currentUserId && reply.helpfulBy.includes(currentUserId));
        return (
          <View key={reply.id} style={styles.reply}>
            <Pressable
              accessibilityRole="link"
              onPress={() => (coach ? router.push(`/coach/${coach.id}`) : undefined)}
              style={styles.authorRow}
            >
              <Avatar name={coachUser?.name ?? 'Coach'} seed={reply.coachUserId} size={34} />
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <PlayerName userId={coachUser?.id} style={styles.authorName}>{coachUser?.name ?? 'Coach'}</PlayerName>
                  <Ionicons name="shield-checkmark" size={14} color={colors.brand} />
                </View>
                <Text style={styles.meta}>
                  {coach?.credentials[0] ?? 'Verified coach'} · {relativeTime(reply.createdAt)}
                </Text>
              </View>
            </Pressable>

            <RichText style={styles.body}>{reply.body}</RichText>

            <View style={styles.replyActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={helpful ? 'Remove helpful' : 'Mark as helpful'}
                onPress={() => actions.toggleReplyHelpful(reply.id)}
                style={styles.helpful}
              >
                <Ionicons
                  name={helpful ? 'thumbs-up' : 'thumbs-up-outline'}
                  size={16}
                  color={helpful ? colors.brand : colors.textMuted}
                />
                <Text style={[styles.meta, helpful && { color: colors.brand }]}>
                  Helpful · {reply.helpfulBy.length}
                </Text>
              </Pressable>
              {coach ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push(`/coach/${coach.id}`)}
                  style={styles.helpful}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.info} />
                  <Text style={[styles.meta, { color: colors.info }]}>Book a session</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}

      {!replies.length ? (
        <Text style={styles.waiting}>
          Coaches usually reply within a day. You will get a notification when they do.
        </Text>
      ) : null}

      {iAmCoach ? (
        <View style={styles.composer}>
          <Field
            label="Your answer"
            value={draft}
            onChangeText={setDraft}
            placeholder="Be specific. Name the cause, then the fix, then one drill."
            multiline
            onSubmitEditing={() => {
              if (draft.trim().length < 20) return;
              actions.replyToCoachQuestion(question.id, draft.trim());
              setDraft('');
            }}
          />
          <Button
            label="Post answer"
            onPress={() => {
              if (draft.trim().length < 20) return;
              actions.replyToCoachQuestion(question.id, draft.trim());
              setDraft('');
            }}
            disabled={draft.trim().length < 20}
            full
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/coach-apply')}
          style={styles.applyPrompt}
        >
          <Ionicons name="ribbon-outline" size={19} color={colors.brand} />
          <Text style={styles.applyText}>Coach yourself? Apply to answer questions like this.</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  head: { gap: spacing.md, paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  authorName: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textFaint },
  title: { ...typography.title, color: colors.text, lineHeight: 29 },
  body: { ...typography.body, color: colors.text, lineHeight: 23 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { ...typography.caption, color: colors.textMuted, letterSpacing: 1.3, paddingVertical: spacing.lg },
  reply: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  replyActions: { flexDirection: 'row', gap: spacing.xl },
  helpful: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waiting: { ...typography.small, color: colors.textFaint, lineHeight: 20, paddingBottom: spacing.lg },
  composer: { gap: spacing.md, paddingTop: spacing.xl },
  applyPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  applyText: { ...typography.small, color: colors.text, flex: 1 },
});
