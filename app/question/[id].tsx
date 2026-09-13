import { ThreadReply } from '@/components/ThreadReplies';
import { SwipeSurface } from '@/components/SwipeSurface';
import Discuss from '../(tabs)/discuss';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { VoteControls } from '@/components/VoteControls';
import { TOPIC_META } from '@/components/QuestionCard';
import { Avatar, Button, Card, Chip, EmptyState, Field, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import type { Answer } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

export default function QuestionDetail() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { questions, answers, users, currentUserId, actions } = useApp();
  const view = actions.recordView;
  useEffect(() => { view('question', String(id)); }, [view, id]);
  const [draft, setDraft] = useState('');
  const replyInput = useRef<TextInput>(null);

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


  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    actions.addAnswer(question.id, text);
    setDraft('');
  };

  return (
    <SwipeSurface onSwipe={direction=>{if(direction===-1) router.navigate("/discuss?section=discussions");}} renderPreview={direction=>direction===-1 ? <Discuss previewSection="discussions"/> : null}><Screen title="Thread" compactTitle onBack={() => router.back()} right={<Pressable accessibilityRole="button" accessibilityLabel="Share this thread" hitSlop={10} onPress={() => router.push(`/share?kind=question&id=${question.id}`)}><Ionicons name="paper-plane-outline" size={23} color={colors.text} /></Pressable>}>
      <Card style={styles.questionCard}>
        <View style={styles.topRow}>
          <Chip label={meta.label} selected tint={meta.tint} ink="#0A1120" small />
          <Text style={styles.time}>
            <PlayerName userId={asker?.id}>{asker ? `@${asker.handle}` : 'unknown'}</PlayerName> · {relativeTime(question.createdAt)}
          </Text>
        </View>
        <Text style={styles.title}>{question.title}</Text>
        <Text style={styles.body}>{question.body}</Text>
        <View style={styles.tagRow}>
          {question.tags.map((tag) => (
            <Chip key={tag} label={`#${tag}`} onPress={() => router.push({pathname:"/search",params:{q:`#${tag}`}})} small />
          ))}
        </View>
        {question.source ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Read the original on ${question.source.label}`}
            onPress={() => Linking.openURL(question.source!.url)}
            style={styles.sourceRow}
          >
            <Ionicons name={question.source.name === 'reddit' ? 'logo-reddit' : 'globe-outline'} size={16} color={colors.brand} />
            <Text style={styles.sourceText}>
              From {question.source.label} · by {question.source.author} · {question.source.replies} replies there
            </Text>
            <Ionicons name="open-outline" size={15} color={colors.brand} />
          </Pressable>
        ) : null}
        <View style={styles.voteRow}>
          <VoteControls item={question} userId={currentUserId} onVote={direction => actions.voteQuestion(question.id, direction)} />
          <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted}/>
          <Text style={styles.time}>{thread.length} {thread.length === 1 ? 'reply' : 'replies'}</Text>
        </View>
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {thread.length} {thread.length === 1 ? 'reply' : 'replies'}
        </Text>

        {thread.length === 0 ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No answers yet"
            body="Know this one? A specific answer beats three vague ones."
          />
        ) : null}

        {thread.filter(answer => !answer.parentAnswerId || !thread.some(parent => parent.id === answer.parentAnswerId)).map(answer => (
          <ThreadReply key={answer.id} answer={answer} thread={thread} acceptedId={question.acceptedAnswerId} />
        ))}

        <View style={styles.composer}>
          <Field
            inputRef={replyInput}
            label="Join the conversation"
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a thoughtful reply…"
            multiline
            onSubmitEditing={submit}
          />
          <Button label="Post reply" onPress={submit} disabled={draft.trim().length === 0} />
        </View>
      </View>
    </Screen></SwipeSurface>
  );
}

const styleDefinitions = StyleSheet.create({
  questionCard: { gap: spacing.md, borderWidth: 0, borderRadius: 0, backgroundColor: colors.bg, paddingHorizontal: 0, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: colors.border },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  time: { ...typography.small, color: colors.textFaint },
  title: { ...typography.title, color: colors.text, lineHeight: 28 },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  voteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  sourceText: { ...typography.small, color: colors.textMuted, flex: 1, lineHeight: 19 },
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
  answerCard: { gap: 12, paddingVertical: 16 },
  nested: { marginLeft: 16, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.border },
  replyBody: { fontSize: 15, lineHeight: 23, color: colors.text, paddingLeft: 8 },
  inlineComposer: { gap: 10, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16 },
  replyInput: { minHeight: 80, color: colors.text, fontSize: 15, textAlignVertical: 'top' },
  replyActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  replyButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
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
  answerBody: { ...typography.body, color: colors.text, lineHeight: 24, marginLeft: 16, paddingLeft: 29, borderLeftWidth: 1, borderLeftColor: colors.border },
  composer: { gap: spacing.md, paddingTop: spacing.lg },
});
