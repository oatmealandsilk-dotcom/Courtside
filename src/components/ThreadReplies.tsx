import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { VoteControls } from '@/components/VoteControls';
import { TOPIC_META } from '@/components/QuestionCard';
import { Avatar, Button, Card, Chip, EmptyState, Field, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import type { Answer } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

export function ThreadReplies({questionId, preview = false}:{questionId:string; preview?:boolean}) {
  const {questions,answers}=useApp();
  const question=questions.find(q=>q.id===questionId);
  const thread=answers.filter(a=>a.questionId===questionId).sort((a,b)=>Number(b.id===question?.acceptedAnswerId)-Number(a.id===question?.acceptedAnswerId)||b.votes-a.votes);
  return <View>{thread.filter(a=>!a.parentAnswerId||!thread.some(p=>p.id===a.parentAnswerId)).map(a=><ThreadReply key={a.id} answer={a} thread={thread} acceptedId={question?.acceptedAnswerId} preview={preview}/>)}</View>;
}
export function ThreadReply({ answer, thread, acceptedId, depth = 0, preview = false }: {
  answer: Answer; thread: Answer[]; acceptedId?: string; depth?: number; preview?:boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUserId, actions } = useApp();
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState('');
  const [collapsed, setCollapsed] = useState(false);
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
        <Text style={styles.replyBody}>{answer.body}</Text>
        {!preview && <View style={styles.replyActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Collapse reply by ${responder?.name ?? 'player'}`} onPress={()=>setCollapsed(true)} style={styles.collapse}><Ionicons name="remove-circle-outline" size={20} color={colors.textMuted}/></Pressable>
          <VoteControls item={answer} userId={currentUserId} onVote={direction => actions.voteAnswer(answer.id, direction)}/>
          <Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${responder?.name ?? 'player'}`} onPress={() => setReplying(true)} style={styles.replyButton}>
            <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted}/><Text style={styles.time}>Reply</Text>
          </Pressable>
        </View>}
        {replying && <View style={styles.inlineComposer}>
          <TextInput autoFocus accessibilityLabel={`Reply to ${responder?.name ?? 'player'}`} placeholder="Write a reply…" multiline value={draft} onChangeText={setDraft} style={styles.replyInput}/>
          <View style={styles.replyActions}>
            <Button label="Cancel" variant="secondary" onPress={() => { setReplying(false); setDraft(''); }}/>
            <Button label="Reply" disabled={!draft.trim()} onPress={() => {
              actions.addAnswer(answer.questionId, draft.trim(), answer.id); setDraft(''); setReplying(false);
            }}/>
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
        <ThreadReply answer={child} thread={thread} acceptedId={acceptedId} depth={depth + 1} preview={preview}/>
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
  inlineComposer: { gap: 10, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16 },
  replyInput: { minHeight: 80, color: colors.text, fontSize: 15, textAlignVertical: 'top' },
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
