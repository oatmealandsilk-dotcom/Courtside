import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { ClipVideo } from '@/components/ClipVideo';
import { CourtSpinner } from '@/components/CourtSpinner';
import { Tappable } from '@/components/Tappable';
import { Avatar, Button, Chip, EmptyState, Field, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { confirmAfterMenu, confirmReport } from '@/lib/confirm';
import { show as showToast } from '@/lib/toast';
import { useStillLoading } from '@/lib/useStillLoading';
import { RichText } from '@/components/RichText';
import { useApp } from '@/store/AppContext';
import type { CoachQuestion, CoachReply } from '@/data/types';
import { SPECIALTY_LABEL } from '@/features/coaching/bookings';
import { colors, radius, spacing, typography, font } from '@/theme';

/** One Ask-a-Coach thread: the player's question and every coach reply. */
export default function CoachQuestionDetail() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { coachQuestions, coachReplies, users, coaches, currentUser, currentUserId, error, actions } = useApp();
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  // A link opened cold waits for the data before saying the question is gone;
  // a load that failed stops the wait, so it never spins for ever.
  const loading = useStillLoading() && !error;
  // What the page last showed, kept while it slides away after its own
  // delete, so it leaves as it was instead of flashing "gone" on the way out.
  const shown = useRef<{ question: CoachQuestion; replies: CoachReply[] } | null>(null);
  const leaving = useRef(false);

  const found = coachQuestions.find((q) => q.id === id);
  if (found) {
    shown.current = {
      question: found,
      replies: found.replyIds
        .map((rid) => coachReplies.find((r) => r.id === rid))
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .sort((a, b) => b.helpfulBy.length - a.helpfulBy.length),
    };
  }
  const view = found || leaving.current ? shown.current : null;
  if (!view) {
    return (
      <Screen title="Question" compactTitle onBack={() => goBack()}>
        {loading
          ? <View style={styles.wait}><CourtSpinner size={28} /></View>
          : <EmptyState icon="alert-circle-outline" title="This question is gone" body="Whoever asked it may have deleted it." />}
      </Screen>
    );
  }
  const { question, replies } = view;

  const author = users.find((u) => u.id === question.authorId);
  const iAmCoach = Boolean(currentUser?.isCoach);
  const mine = question.authorId === currentUserId;

  // Asked once, from the menu, the way a post's Delete asks.
  const askToDelete = () => confirmAfterMenu({
    title: 'Delete this question?',
    message: 'Any coach answers go with it. This can’t be undone.',
    confirmLabel: 'Delete',
    destructive: true,
    onConfirm: () => {
      leaving.current = true;
      actions.deleteCoachQuestion(question.id);
      goBack('/coaches');
      showToast({ title: 'Question deleted', icon: 'trash-outline' });
    },
  });

  // Anyone else's question, and any coach's reply, can be reported (App Review 1.2, Oct 5).
  // Either leaves your screens at once; a reported question takes the page back with it.
  const signedIn = !!currentUserId;
  const reportQuestion = () => confirmReport('question', () => {
    leaving.current = true;
    actions.reportUser(question.authorId, `coach-question:${question.id}`);
    goBack('/coaches');
    showToast({ title: 'Thanks — a person will review this', icon: 'flag-outline' });
  }, true);
  const reportReply = (reply: CoachReply) => confirmReport('reply', () => {
    actions.reportUser(reply.coachUserId, `coach-reply:${reply.id}`);
    showToast({ title: 'Thanks — a person will review this', icon: 'flag-outline' });
  });

  return (
    <Screen
      title="Ask a coach"
      compactTitle
      onBack={() => goBack()}
      right={mine || signedIn ? (
        <Tappable accessibilityRole="button" accessibilityLabel="More options" onPress={() => setMenuOpen(true)} hitSlop={10} style={styles.more}>
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
        </Tappable>
      ) : undefined}
    >
      <View style={styles.head}>
        <View style={styles.authorRow}>
          <Avatar name={author?.name ?? '?'} seed={author?.avatarSeed ?? question.id} size={38} />
          <View style={{ flex: 1 }}>
            <PlayerName userId={author?.id} style={styles.authorName}>{author?.name ?? 'Player'}</PlayerName>
            <PlayerName userId={author?.id} style={styles.meta}>
              @{author?.handle ?? 'player'} · {relativeTime(question.createdAt)}
            </PlayerName>
          </View>
          <Chip label={SPECIALTY_LABEL[question.specialty] ?? question.specialty} small />
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
              <Text style={[styles.meta, { color: colors.brand, ...font('700') }]}>{question.resolved ? 'Reopen' : 'This answered it'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={styles.sectionTitle}>
        {replies.length ? 'Coach replies' : 'No replies yet'}
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
                  <Ionicons name="person-circle-outline" size={16} color={colors.info} />
                  <Text style={[styles.meta, { color: colors.info }]}>Coach’s page</Text>
                </Pressable>
              ) : null}
              {signedIn && reply.coachUserId !== currentUserId ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Report this reply" onPress={() => reportReply(reply)} hitSlop={8} style={[styles.helpful, { marginLeft: 'auto' }]}>
                  <Ionicons name="flag-outline" size={15} color={colors.textMuted} />
                  <Text style={styles.meta}>Report</Text>
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

      {/* The question's menu, the same sheet a profile's "…" opens: Delete for the asker, Report for anyone else. */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        {/* The backdrop is a plain surface, not a button: a button here would
            wrap the menu's button, which the web refuses to nest. */}
        <Pressable accessibilityLabel="Close menu" onPress={() => setMenuOpen(false)} style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            {mine ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => { setMenuOpen(false); askToDelete(); }}
                style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <Ionicons name="trash-outline" size={21} color={colors.danger} />
                <Text style={[styles.menuLabel, { color: colors.danger }]}>Delete question</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => { setMenuOpen(false); reportQuestion(); }}
                style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <Ionicons name="flag-outline" size={21} color={colors.danger} />
                <Text style={[styles.menuLabel, { color: colors.danger }]}>Report question</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
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
  sectionTitle: { ...typography.smallStrong, color: colors.textMuted, paddingVertical: spacing.lg },
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
  wait: { paddingVertical: 60, alignItems: 'center' },
  more: { padding: 4 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.sm,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.md },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  menuLabel: { ...typography.body, color: colors.text },
});
