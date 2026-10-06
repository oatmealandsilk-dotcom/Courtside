import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import { StreakFlame } from '@/components/StreakFlame';
import { shownStreak, streakWords } from '@/features/practice/streakFlame';
import React, { useRef, useState } from 'react';
import { confirm, confirmDelete, confirmReport } from '@/lib/confirm';
import { RemovedNote } from '@/features/moderation/RemovedNote';
import { thankForReport } from '@/features/moderation/reportThanks';
import * as haptics from '@/lib/haptics';
import { MentionSuggestions } from '@/components/MentionSuggestions';
import { useMentionDraft } from '@/features/mentions/useMentionDraft';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { VoteControls } from '@/components/VoteControls';
import { TOPIC_META } from '@/components/QuestionCard';
import { Avatar, Button, Card, Chip, EmptyState, Field, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { RichText } from '@/components/RichText';
import { AttachButton, AttachedPreview, ReplyMediaView, type ReplyAttachment } from '@/components/ReplyMedia';
import { useRevealOnFocus } from '@/lib/keyboardScroll';
import { useApp } from '@/store/AppContext';
import type { Answer } from '@/data/types';
import { listedAnswers } from '@/features/hiddenWords/hiddenWords';
import { colors, font, radius, spacing, typography } from '@/theme';

export function ThreadReplies({questionId, preview = false}:{questionId:string; preview?:boolean}) {
  const {questions,answers,currentUserId,actions}=useApp();
  const question=questions.find(q=>q.id===questionId);
  // Never one hidden by the asker's Hidden words (migration 117), unless it is yours, nor a reply under one: the thread page lists those for the asker.
  const thread=listedAnswers(answers,questionId,currentUserId).sort((a,b)=>Number(b.id===question?.acceptedAnswerId)-Number(a.id===question?.acceptedAnswerId)||b.votes-a.votes);
  const canAccept = !!question && question.authorId === currentUserId && !preview;
  return <View>{thread.filter(a=>!a.parentAnswerId||!thread.some(p=>p.id===a.parentAnswerId)).map(a=><ThreadReply key={a.id} answer={a} thread={thread} acceptedId={question?.acceptedAnswerId} askerId={question?.authorId} preview={preview} closed={!!question?.removed} onAccept={canAccept ? (id) => actions.acceptAnswer(questionId, id) : undefined}/>)}</View>;
}
export function ThreadReply({ answer, thread, acceptedId, askerId, depth = 0, preview = false, closed = false, onAccept }: {
  answer: Answer; thread: Answer[]; acceptedId?: string; /** Who started the thread: their replies carry OP, Reddit's mark. */ askerId?: string; depth?: number; preview?:boolean;
  /** The thread was taken down (migration 108): nobody can reply anywhere in it, so no Reply buttons. */ closed?: boolean;
  /** The asker's: marks this as the answer that solved it. */ onAccept?: (answerId: string) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUserId, currentUser, blockedIds, actions } = useApp();
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState('');
  const [media, setMedia] = useState<ReplyAttachment | null>(null);
  const canSend = !!draft.trim() || !!media;
  // What is in the reply box now, for words sent and then refused (see post).
  const latest = useRef({ draft, media });
  latest.current = { draft, media };
  const post = () => {
    if (!canSend) return;
    const text = draft.trim();
    const attached = media;
    // Refused for its words (migration 117): the toast says why, and the reply
    // box opens again with what you wrote (and its photo or clip), unless you
    // have started another reply here since.
    void actions.addAnswer(answer.questionId, text, answer.id, attached ?? undefined).then((result) => {
      // Not saved at all ('failed', offline say) gets the words back the same way.
      if (!result || latest.current.draft.trim() || latest.current.media) return;
      setDraft(text);
      setMedia(attached);
      setReplying(true);
    });
    setDraft('');
    setMedia(null);
    setReplying(false);
  };
  const [collapsed, setCollapsed] = useState(false);
  const reveal = useRevealOnFocus();
  const lineRef = useRef<TextInput>(null);
  const responder = users.find(user => user.id === answer.authorId);
  const streak = shownStreak(responder, currentUserId);
  const tag = useMentionDraft(draft, setDraft, lineRef);
  // Hold your own reply to delete it, as on Instagram; hold someone else's to report it (Oct 5).
  const mine = !preview && answer.authorId === currentUserId;
  const theirs = !preview && !!currentUserId && answer.authorId !== currentUserId;
  const askDelete = mine ? () => { haptics.tap(); confirmDelete(() => actions.deleteAnswer(answer.id), 'this reply'); }
    : theirs ? () => {
      haptics.tap();
      confirmReport('reply', () => {
        actions.reportUser(answer.authorId, `answer:${answer.id}`);
        thankForReport(responder, responder && !blockedIds.includes(responder.id) ? () => actions.toggleBlock(responder.id) : undefined);
      });
    } : undefined;
  // An admin's hold takes it down (or puts it back), with Delete still there on their own reply (migration 108).
  const askModerate = !preview && currentUser?.isAdmin ? () => {
    haptics.tap();
    const deleteToo = mine ? { also: { label: 'Delete it instead', destructive: true, onPress: () => actions.deleteAnswer(answer.id) } } : {};
    if (answer.removed) {
      confirm({ title: 'Restore this reply?', message: 'Everyone who could see it before sees it again.', confirmLabel: 'Restore', onConfirm: () => { void actions.restoreContent('answer', answer.id); }, ...deleteToo });
    } else {
      // Someone else's: straight to the page that asks which rule it breaks (it asks once more before anything happens).
      // Your own: asked first, as Delete is the likelier wish.
      if (mine) confirm({ title: 'Take down this reply?', message: 'Choose which of CourtSide’s rules it breaks on the next page.', confirmLabel: 'Choose a reason', destructive: true, onConfirm: () => router.push({ pathname: '/take-down', params: { kind: 'answer', id: answer.id } }), ...deleteToo });
      else router.push({ pathname: '/take-down', params: { kind: 'answer', id: answer.id } });
    }
  } : undefined;
  const hold = askModerate ?? askDelete;
  const children = thread.filter(child => child.parentAnswerId === answer.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return <View>
    <View style={styles.answerCard}>
      {!collapsed && children.length > 0 && <View pointerEvents="none" style={styles.avatarRail}/>}
      <Pressable accessibilityRole="button" accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} reply by ${responder?.name ?? 'player'}${streakWords(streak)}`}
        onPress={() => setCollapsed(value => !value)} onLongPress={hold} style={styles.answerHead}>
        <Avatar name={responder?.name ?? '?'} seed={responder?.avatarSeed ?? answer.authorId} size={30}/>
        <PlayerName userId={responder?.id} style={styles.answerName}>{responder?.name ?? 'Unknown'}</PlayerName>
        <StreakFlame days={streak} size="small" style={styles.flame} />
        <Text style={styles.time}>{relativeTime(answer.createdAt)}</Text>
        {askerId && answer.authorId === askerId ? <View style={styles.op}><Text style={styles.opText}>OP</Text></View> : null}
        {answer.fromCoach && <Ionicons name="shield-checkmark" size={14} color={colors.brand}/>}
      </Pressable>
      {!collapsed && <>
        {acceptedId === answer.id && <Text style={styles.acceptedText}>Accepted by the asker</Text>}
        {answer.body ? (hold
          ? <Pressable accessibilityHint={askModerate ? (answer.removed ? 'Hold to restore it' : 'Hold to take it down') : mine ? 'Hold to delete' : 'Hold to report'} onLongPress={hold} delayLongPress={350}><RichText style={styles.replyBody}>{answer.body}</RichText></Pressable>
          : <RichText style={styles.replyBody}>{answer.body}</RichText>) : null}
        {answer.media ? <View style={{ paddingLeft: 42 }}><ReplyMediaView media={answer.media} onLongPress={hold} /></View> : null}
        {/* Taken down by an admin: only its author and admins get it, and see why. */}
        {answer.removed ? <View style={{ paddingLeft: 42 }}><RemovedNote removed={answer.removed} quiet /></View> : null}
        {!preview && <View style={styles.replyActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Collapse reply by ${responder?.name ?? 'player'}`} onPress={()=>setCollapsed(true)} style={styles.collapse}><Ionicons name="remove-circle-outline" size={20} color={colors.textMuted}/></Pressable>
          <VoteControls item={answer} userId={currentUserId} onVote={direction => actions.voteAnswer(answer.id, direction)}/>
          {answer.removed || closed ? null : <Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${responder?.name ?? 'player'}`} onPress={() => setReplying(true)} style={styles.replyButton}>
            <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted}/><Text style={styles.time}>Reply</Text>
          </Pressable>}
          {onAccept ? <Pressable accessibilityRole="button" accessibilityLabel={acceptedId === answer.id ? 'Unmark as the answer' : 'Mark as the answer'} onPress={() => onAccept(answer.id)} style={styles.replyButton}>
            <Ionicons name={acceptedId === answer.id ? 'checkmark-circle' : 'checkmark-circle-outline'} size={16} color={acceptedId === answer.id ? colors.success : colors.textMuted}/><Text style={styles.time}>{acceptedId === answer.id ? 'Accepted' : 'Accept'}</Text>
          </Pressable> : null}
        </View>}
        {replying && !closed && !answer.removed && <View style={styles.inlineComposer}>
          <MentionSuggestions candidates={tag.rows} onPick={tag.pick} maxHeight={176} />
          <View style={styles.composer}>
            <TextInput ref={lineRef} autoFocus onFocus={() => reveal(lineRef.current)} accessibilityLabel={`Reply to ${responder?.name ?? 'player'}`} placeholder={`Reply to ${responder?.name?.split(' ')[0] ?? 'this'}… (@ to tag)`} placeholderTextColor={colors.textFaint} multiline maxLength={10000} value={draft} onChangeText={setDraft} onSelectionChange={tag.onSelectionChange} style={styles.replyInput}
              // Enter sends on a computer; the web toolkit needs blurOnSubmit to do that in a multiline box.
              blurOnSubmit={Platform.OS === 'web' ? true : undefined}
              onSubmitEditing={Platform.OS === 'web' ? post : undefined}/>
            {media ? <AttachedPreview media={media} onRemove={() => setMedia(null)} /> : null}
            <View style={styles.inlineActions}>
              <AttachButton onPick={setMedia} />
              <View style={{ flex: 1 }} />
              <Pressable accessibilityRole="button" onPress={() => { setReplying(false); setDraft(''); setMedia(null); }} hitSlop={8}><Text style={styles.cancel}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Post reply" disabled={!canSend} onPress={post} style={[styles.send, !canSend && styles.sendOff]}><Ionicons name="arrow-up" size={18} color={colors.brandInk} /></Pressable>
            </View>
          </View>
        </View>}
      </>}
    </View>
    {!collapsed && children.map((child, index) => (
      <View key={child.id} style={styles.nested}>
        {/* The parent rail passes earlier siblings and their descendants,
            ending at the last child's elbow, never at a grandchild. */}
        <View pointerEvents="none" style={[styles.rail, index === children.length - 1 ? {height:16} : {bottom:0}]} />
        <View pointerEvents="none" style={styles.elbow}/>
        <ThreadReply answer={child} thread={thread} acceptedId={acceptedId} askerId={askerId} depth={depth + 1} preview={preview} closed={closed} onAccept={onAccept}/>
      </View>
    ))}
  </View>;
}

const styleDefinitions = StyleSheet.create({
  questionCard: { gap: spacing.md, borderWidth: 0, borderRadius: 0, backgroundColor: colors.bg, paddingHorizontal: 0, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: colors.border },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  time: { ...typography.small, color: colors.textFaint },
  op: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: colors.brandDim },
  opText: { fontSize: 10, ...font('700'), letterSpacing: 0.4, color: colors.brand },
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
  answerCard: { gap: 12, paddingVertical: 16 },
  nested: { marginLeft: 15, paddingLeft: 20 },
  rail: {position:'absolute',left:0,top:0,width:1.5,backgroundColor:colors.borderStrong},
  elbow: {position:'absolute',left:0,top:16,width:20,height:15,borderLeftWidth:1.5,borderBottomWidth:1.5,borderColor:colors.borderStrong,borderBottomLeftRadius:12},
  avatarRail: {position:'absolute',left:15,top:46,bottom:0,width:1.5,backgroundColor:colors.borderStrong},
  collapse: {position:'absolute',left:5,width:20,height:28,backgroundColor:colors.bg,justifyContent:'center'},
  replyBody: { fontSize: 15, lineHeight: 23, color: colors.text, paddingLeft: 42 },
  inlineComposer: { gap: 8, paddingLeft: 42 },
  // The same soft rounded box as the thread's own reply box.
  composer: { gap: 6, paddingTop: 12, paddingBottom: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surfaceAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  // No browser focus ring either: the cursor is the only sign the box is live.
  replyInput: { minHeight: 40, paddingVertical: 0, color: colors.text, fontSize: 16, lineHeight: 22, textAlignVertical: 'top', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  inlineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
  cancel: { ...typography.smallStrong, color: colors.textMuted },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
  sendOff: { opacity: 0.35 },
  replyActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap',paddingLeft:42 },
  replyButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  acceptedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  acceptedText: { ...typography.caption, color: colors.court },
  answerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  answerMeta: { flex: 1, gap: 2 },
  answerNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  answerName: { ...typography.smallStrong, color: colors.text },
  // Close after the name, as on a comment.
  flame: { marginLeft: -spacing.sm },
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
