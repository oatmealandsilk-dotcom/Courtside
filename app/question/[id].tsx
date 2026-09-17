import { ThreadReply } from '@/components/ThreadReplies';
import { SwipeSurface } from '@/components/SwipeSurface';
import { requestSection } from '@/features/navigation/swipeOrder';
import Discuss from '../(tabs)/discuss';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { VoteControls } from '@/components/VoteControls';
import { TOPIC_META } from '@/components/QuestionCard';
import { Avatar, Card, Chip, EmptyState, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { RichText } from '@/components/RichText';
import { useRevealOnFocus } from '@/lib/keyboardScroll';
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
  const [replying, setReplying] = useState(false);
  const replyInput = useRef<TextInput>(null);
  const reveal = useRevealOnFocus();

  const question = questions.find((q) => q.id === id);
  const asker = users.find((u) => u.id === question?.authorId);

  if (!question) {
    return (
      <Screen title="Question" compactTitle onBack={() => goBack()}>
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
    setReplying(false);
  };

  return (
    <SwipeSurface onSwipe={direction=>{if(direction===-1) { requestSection('/discuss', 'discussions'); router.navigate('/discuss'); }}} renderPreview={direction=>direction===-1 ? <Discuss previewSection="discussions"/> : null}><Screen title="Thread" compactTitle onBack={() => goBack()} right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>{question.authorId === currentUserId ? <Pressable accessibilityRole="button" accessibilityLabel="Edit this thread" hitSlop={10} onPress={() => router.push({ pathname: '/edit-post', params: { id: question.id, kind: 'question' } })}><Ionicons name="create-outline" size={23} color={colors.text} /></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel="Share this thread" hitSlop={10} onPress={() => router.push(`/share?kind=question&id=${question.id}`)}><Ionicons name="arrow-redo-outline" size={23} color={colors.text} /></Pressable></View>}>
      <Card style={styles.questionCard}>
        {/* Who asked, up top and at full size — the way a reply shows its author. */}
        <View style={styles.askerRow}>
          <Pressable accessibilityRole="link" accessibilityLabel={asker ? `Open ${asker.name}'s profile` : undefined} onPress={() => asker && router.push(asker.id === currentUserId ? '/profile' : `/user/${asker.id}`)} style={styles.asker}>
            <Avatar name={asker?.name ?? '?'} seed={asker?.avatarSeed ?? question.authorId} uri={asker?.avatarUrl} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={styles.askerName} numberOfLines={1}>{asker?.name ?? 'Unknown'}</Text>
              <Text style={styles.time}>{asker ? `@${asker.handle}` : ''} · {relativeTime(question.createdAt)}{question.editedAt ? ' · Edited' : ''}</Text>
            </View>
          </Pressable>
          <Chip label={meta.label} selected tint={meta.tint} ink="#0A1120" small />
        </View>
        <Text style={styles.title}>{question.title}</Text>
        <RichText style={styles.body}>{question.body}</RichText>
        <View style={styles.tagRow}>
          {question.tags.map((tag) => (
            <Chip key={tag} label={`#${tag}`} onPress={() => router.push({pathname:"/search",params:{q:`#${tag}`}})} small />
          ))}
        </View>
        {question.source ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Read the original on ${question.source.label}`}
            onPress={() => { if (/^https?:\/\//i.test(question.source!.url)) Linking.openURL(question.source!.url); }}
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
          {/* The same Reply button a reply has; it opens the line to type on right here. */}
          <Pressable accessibilityRole="button" accessibilityLabel="Reply to this thread" onPress={() => { setReplying(true); setTimeout(() => replyInput.current?.focus(), 50); }} style={styles.replyButton}>
            <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted}/>
            <Text style={styles.time}>Reply</Text>
          </Pressable>
          <Text style={[styles.time, { marginLeft: 'auto' }]}>{thread.length} {thread.length === 1 ? 'reply' : 'replies'}</Text>
        </View>
        {replying ? (
          <View style={styles.inlineComposer}>
            <TextInput ref={replyInput} autoFocus onFocus={() => reveal(replyInput.current)} accessibilityLabel="Reply to this thread" placeholder="Write a reply…" placeholderTextColor={colors.textFaint} multiline value={draft} onChangeText={setDraft} style={styles.replyInput}
              blurOnSubmit={Platform.OS === 'web' ? true : undefined}
              onSubmitEditing={Platform.OS === 'web' ? submit : undefined} />
            <View style={styles.inlineActions}>
              <Pressable accessibilityRole="button" onPress={() => { setReplying(false); setDraft(''); }} hitSlop={8}><Text style={styles.time}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Post reply" disabled={!draft.trim()} onPress={submit} style={[styles.sendPill, !draft.trim() && { opacity: 0.4 }]}><Text style={styles.sendText}>Reply</Text></Pressable>
            </View>
          </View>
        ) : null}
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {thread.length} {thread.length === 1 ? 'reply' : 'replies'}
        </Text>

        {thread.length === 0 ? (
          question.source ? (
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title={`${question.source.replies} ${question.source.replies === 1 ? 'reply' : 'replies'} on ${question.source.label}`}
              body="Those stay on the original site. Be the first to answer it here."
            />
          ) : (
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title="No answers yet"
              body="Know this one? A specific answer beats three vague ones."
            />
          )
        ) : null}

        {thread.filter(answer => !answer.parentAnswerId || !thread.some(parent => parent.id === answer.parentAnswerId)).map(answer => (
          <ThreadReply key={answer.id} answer={answer} thread={thread} acceptedId={question.acceptedAnswerId} />
        ))}

      </View>
    </Screen></SwipeSurface>
  );
}

const styleDefinitions = StyleSheet.create({
  questionCard: { gap: spacing.md, borderWidth: 0, borderRadius: 0, backgroundColor: colors.bg, paddingHorizontal: 0, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: colors.border },
  askerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  replyButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  inlineComposer: { gap: 8, paddingTop: spacing.xs },
  // No browser focus ring either: the cursor is the only sign the line is live.
  replyInput: { minHeight: 24, paddingVertical: 4, color: colors.text, fontSize: 15, lineHeight: 22, textAlignVertical: 'top', borderBottomWidth: 1, borderBottomColor: colors.border, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  inlineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
  sendPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brand },
  sendText: { ...typography.smallStrong, color: colors.brandInk },
  asker: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  askerName: { ...typography.smallStrong, color: colors.text, fontSize: 14 },
  time: { ...typography.small, color: colors.textFaint },
  title: { ...typography.title, color: colors.text, lineHeight: 28 },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  voteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
});
