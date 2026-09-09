import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { TOPIC_META } from '@/components/QuestionCard';
import { Avatar, Button, Card, Chip, EmptyState, Field, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import type { Answer } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

export default function QuestionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { questions, answers, users, currentUserId, actions } = useApp();
  const [draft, setDraft] = useState('');

  const question = questions.find((q) => q.id === id);
  const asker = users.find((u) => u.id === question?.authorId);

  if (!question) {
    return (
      <Screen title="Question" compactTitle onBack={() => router.back()}>
        <EmptyState icon="alert-circle-outline" title="This thread is gone" />
      </Screen>
    );
  }

  const meta = TOPIC_META[question.topic];
  const thread = question.answerIds
    .map((aid) => answers.find((a) => a.id === aid))
    .filter((a): a is Answer => Boolean(a))
    .sort((a, b) => {
      if (question.acceptedAnswerId === a.id) return -1;
      if (question.acceptedAnswerId === b.id) return 1;
      return b.votes - a.votes;
    });

  const myVote = currentUserId ? question.votedBy[currentUserId] : undefined;

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    actions.addAnswer(question.id, text);
    setDraft('');
  };

  return (
    <Screen title="Thread" compactTitle onBack={() => router.back()}>
      <Card style={styles.questionCard}>
        <View style={styles.topRow}>
          <Chip label={meta.label} selected tint={meta.tint} ink="#0A1120" small />
          <Text style={styles.time}>
            {asker ? `@${asker.handle}` : 'unknown'} · {relativeTime(question.createdAt)}
          </Text>
        </View>
        <Text style={styles.title}>{question.title}</Text>
        <Text style={styles.body}>{question.body}</Text>
        <View style={styles.tagRow}>
          {question.tags.map((tag) => (
            <Chip key={tag} label={`#${tag}`} small />
          ))}
        </View>
        <View style={styles.voteRow}>
          <VoteButton
            direction={1}
            active={myVote === 1}
            onPress={() => actions.voteQuestion(question.id, 1)}
          />
          <Text style={styles.voteCount}>{question.votes}</Text>
          <VoteButton
            direction={-1}
            active={myVote === -1}
            onPress={() => actions.voteQuestion(question.id, -1)}
          />
        </View>
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {thread.length} {thread.length === 1 ? 'answer' : 'answers'}
        </Text>

        {thread.length === 0 ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No answers yet"
            body="Know this one? A specific answer beats three vague ones."
          />
        ) : null}

        {thread.map((answer) => {
          const responder = users.find((u) => u.id === answer.authorId);
          const accepted = question.acceptedAnswerId === answer.id;
          const vote = currentUserId ? answer.votedBy[currentUserId] : undefined;
          return (
            <Card
              key={answer.id}
              style={[styles.answerCard, accepted ? { borderColor: `${colors.court}77` } : null]}
            >
              {accepted ? (
                <View style={styles.acceptedRow}>
                  <Ionicons name="checkmark-circle" size={15} color={colors.court} />
                  <Text style={styles.acceptedText}>ACCEPTED BY THE ASKER</Text>
                </View>
              ) : null}

              <View style={styles.answerHead}>
                <Avatar
                  name={responder?.name ?? '?'}
                  seed={responder?.avatarSeed ?? answer.authorId}
                  size={34}
                />
                <View style={styles.answerMeta}>
                  <View style={styles.answerNameRow}>
                    <Text style={styles.answerName}>{responder?.name ?? 'Unknown'}</Text>
                    {answer.fromCoach ? (
                      <View style={styles.coachTag}>
                        <Ionicons name="shield-checkmark" size={11} color={colors.brandInk} />
                        <Text style={styles.coachTagText}>COACH</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.time}>{relativeTime(answer.createdAt)}</Text>
                </View>
              </View>

              <Text style={styles.answerBody}>{answer.body}</Text>

              <View style={styles.voteRow}>
                <VoteButton direction={1} active={vote === 1} onPress={() => actions.voteAnswer(answer.id, 1)} />
                <Text style={styles.voteCount}>{answer.votes}</Text>
                <VoteButton direction={-1} active={vote === -1} onPress={() => actions.voteAnswer(answer.id, -1)} />
              </View>
            </Card>
          );
        })}

        <View style={styles.composer}>
          <Field
            label="Your answer"
            value={draft}
            onChangeText={setDraft}
            placeholder="Answer from experience. Say what you did and what happened."
            multiline
          />
          <Button label="Post answer" onPress={submit} disabled={draft.trim().length === 0} />
        </View>
      </View>
    </Screen>
  );
}

function VoteButton({
  direction,
  active,
  onPress,
}: {
  direction: 1 | -1;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={direction === 1 ? 'Upvote' : 'Downvote'}
      style={[styles.voteButton, active && { borderColor: colors.brand, backgroundColor: colors.brandDim }]}
    >
      <Ionicons
        name={direction === 1 ? 'chevron-up' : 'chevron-down'}
        size={16}
        color={active ? colors.brand : colors.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  questionCard: { gap: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  time: { ...typography.small, color: colors.textFaint },
  title: { ...typography.title, color: colors.text, lineHeight: 28 },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  voteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  voteButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteCount: { ...typography.bodyStrong, color: colors.text, minWidth: 24, textAlign: 'center' },
  section: { gap: spacing.md, paddingTop: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  answerCard: { gap: spacing.md },
  acceptedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  acceptedText: { ...typography.caption, color: colors.court },
  answerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  answerMeta: { flex: 1, gap: 2 },
  answerNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  answerName: { ...typography.smallStrong, color: colors.text },
  coachTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  coachTagText: { ...typography.caption, fontSize: 9, color: colors.brandInk },
  answerBody: { ...typography.body, color: colors.text, lineHeight: 22 },
  composer: { gap: spacing.md, paddingTop: spacing.lg },
});
