import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { VoteControls } from '@/components/VoteControls';
import { TOPIC_META } from '@/components/QuestionCard';
import { Avatar, Button, Card, Chip, EmptyState, Field, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { RichText } from '@/components/RichText';
import { useRevealOnFocus } from '@/lib/keyboardScroll';
import { useApp } from '@/store/AppContext';
import type { Answer } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

export function ThreadReplies({questionId, preview = false}:{questionId:string; preview?:boolean}) {
  const {questions,answers,currentUserId,actions}=useApp();
  const question=questions.find(q=>q.id===questionId);
  const thread=answers.filter(a=>a.questionId===questionId).sort((a,b)=>Number(b.id===question?.acceptedAnswerId)-Number(a.id===question?.acceptedAnswerId)||b.votes-a.votes);
  const canAccept = !!question && question.authorId === currentUserId && !preview;
  return <View>{thread.filter(a=>!a.parentAnswerId||!thread.some(p=>p.id===a.parentAnswerId)).map(a=><ThreadReply key={a.id} answer={a} thread={thread} acceptedId={question?.acceptedAnswerId} preview={preview} onAccept={canAccept ? (id) => actions.acceptAnswer(questionId, id) : undefined}/>)}</View>;
}
export function ThreadReply({ answer, thread, acceptedId, depth = 0, preview = false, onAccept }: {
  answer: Answer; thread: Answer[]; acceptedId?: string; depth?: number; preview?:boolean; /** The asker's: marks this as the answer that solved it. */ onAccept?: (answerId: string) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUserId, actions } = useApp();
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const reveal = useRevealOnFocus();
  const lineRef = useRef<TextInput>(null);
  const responder = users.find(user => user.id === answer.authorId);
  const children = thread.filter(child => child.parentAnswerId === answer.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return <View>
    <View style={styles.answerCard}>
      {!collapsed && children.length > 0 && <View pointerEvents="none" style={styles.avatarRail}/>}
      <Pressable accessibilityRole="button" accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} reply by ${responder?.name ?? 'player'}`}
        onPress={() => setCollapsed(value => !value)} style={styles.answerHead}>
        <Avatar name={responder?.name ?? '?'} seed={responder?.avatarSeed ?? answer.authorId} size={30}/>
        <PlayerName userId={responder?.id} style={styles.answerName}>{responder?.name ?? 'Unknown'}</PlayerName>
        <Text style={styles.time}>{relativeTime(answer.createdAt)}</Text>
        {answer.fromCoach && <Ionicons name="shield-checkmark" size={14} color={colors.brand}/>}
      </Pressable>
      {!collapsed && <>
        {acceptedId === answer.id && <Text style={styles.acceptedText}>Accepted by the asker</Text>}
        <RichText style={styles.replyBody}>{answer.body}</RichText>
        {!preview && <View style={styles.replyActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Collapse reply by ${responder?.name ?? 'player'}`} onPress={()=>setCollapsed(true)} style={styles.collapse}><Ionicons name="remove-circle-outline" size={20} color={colors.textMuted}/></Pressable>
          <VoteControls item={answer} userId={currentUserId} onVote={direction => actions.voteAnswer(answer.id, direction)}/>
          <Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${responder?.name ?? 'player'}`} onPress={() => setReplying(true)} style={styles.replyButton}>
            <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted}/><Text style={styles.time}>Reply</Text>
          </Pressable>
          {onAccept ? <Pressable accessibilityRole="button" accessibilityLabel={acceptedId === answer.id ? 'Unmark as the answer' : 'Mark as the answer'} onPress={() => onAccept(answer.id)} style={styles.replyButton}>
            <Ionicons name={acceptedId === answer.id ? 'checkmark-circle' : 'checkmark-circle-outline'} size={16} color={acceptedId === answer.id ? colors.success : colors.textMuted}/><Text style={styles.time}>{acceptedId === answer.id ? 'Accepted' : 'Accept'}</Text>
          </Pressable> : null}
        </View>}
        {replying && <View style={styles.inlineComposer}>
          {/* No box: just the line you type on, cursor blinking, like replying on Threads. */}
          <TextInput ref={lineRef} autoFocus onFocus={() => reveal(lineRef.current)} accessibilityLabel={`Reply to ${responder?.name ?? 'player'}`} placeholder={`Reply to ${responder?.name?.split(' ')[0] ?? 'this'}…`} placeholderTextColor={colors.textFaint} multiline value={draft} onChangeText={setDraft} style={styles.replyInput}
            // Enter sends on a computer; the web toolkit needs blurOnSubmit to do that in a multiline box.
            blurOnSubmit={Platform.OS === 'web' ? true : undefined}
            onSubmitEditing={Platform.OS === 'web' ? () => { if (!draft.trim()) return; actions.addAnswer(answer.questionId, draft.trim(), answer.id); setDraft(''); setReplying(false); } : undefined}/>
          <View style={styles.inlineActions}>
            <Pressable accessibilityRole="button" onPress={() => { setReplying(false); setDraft(''); }} hitSlop={8}><Text style={styles.time}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Post reply" disabled={!draft.trim()} onPress={() => {
              actions.addAnswer(answer.questionId, draft.trim(), answer.id); setDraft(''); setReplying(false);
            }} style={[styles.sendPill, !draft.trim() && { opacity: 0.4 }]}><Text style={styles.sendText}>Reply</Text></Pressable>
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
        <ThreadReply answer={child} thread={thread} acceptedId={acceptedId} depth={depth + 1} preview={preview} onAccept={onAccept}/>
      </View>
    ))}
  </View>;
}

const styleDefinitions = StyleSheet.create({
  questionCard: { gap: spacing.md, borderWidth: 0, borderRadius: 0, backgroundColor: colors.bg, paddingHorizontal: 0, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: colors.border },
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
  answerCard: { gap: 12, paddingVertical: 16 },
  nested: { marginLeft: 15, paddingLeft: 20 },
  rail: {position:'absolute',left:0,top:0,width:1.5,backgroundColor:colors.borderStrong},
  elbow: {position:'absolute',left:0,top:16,width:20,height:15,borderLeftWidth:1.5,borderBottomWidth:1.5,borderColor:colors.borderStrong,borderBottomLeftRadius:12},
  avatarRail: {position:'absolute',left:15,top:46,bottom:0,width:1.5,backgroundColor:colors.borderStrong},
  collapse: {position:'absolute',left:5,width:20,height:28,backgroundColor:colors.bg,justifyContent:'center'},
  replyBody: { fontSize: 15, lineHeight: 23, color: colors.text, paddingLeft: 42 },
  inlineComposer: { gap: 8, paddingLeft: 42 },
  // No browser focus ring either: the cursor is the only sign the line is live.
  replyInput: { minHeight: 24, paddingVertical: 4, color: colors.text, fontSize: 15, lineHeight: 22, textAlignVertical: 'top', borderBottomWidth: 1, borderBottomColor: colors.border, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  inlineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
  sendPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brand },
  sendText: { ...typography.smallStrong, color: colors.brandInk },
  replyActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap',paddingLeft:42 },
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
