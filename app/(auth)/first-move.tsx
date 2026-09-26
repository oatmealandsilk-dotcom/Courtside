import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLeave } from '@/components/LeaveCurtain';
import { LevelPill } from '@/components/LevelPill';
import { Avatar } from '@/components/ui';
import { Wash } from '@/components/Wash';
import type { FirstMove } from '@/data/remote';
import { levelBadge } from '@/lib/badges';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

const enter = (i: number) => FadeInDown.delay(80 + i * 80).duration(420).easing(Easing.out(Easing.cubic));
const STARTER = "What's the one thing in your game you want fixed?";

/**
 * Right after setup: one thing to do before the feed. Not a gate and not a
 * form — a clip is the obvious move, a real question someone asked sits
 * right there to answer in a sentence, and asking your own is a quiet line
 * at the bottom. "Later" is always there.
 */
export default function FirstMove() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { currentUser, currentUserId, questions, users, actions } = useApp();
  const { leave, curtain } = useLeave();

  // One real question nobody has answered, from someone at a level near yours.
  const question = useMemo(() => {
    const mine = currentUser ? levelBadge(currentUser.profile).progress : 0.5;
    return questions
      .filter((q) => q.authorId !== currentUserId && !q.source && q.answerIds.length === 0)
      .map((q) => {
        const asker = users.find((u) => u.id === q.authorId);
        const gap = asker ? Math.abs(levelBadge(asker.profile).progress - mine) : 1;
        return { q, asker, score: gap + (Date.now() - Date.parse(q.createdAt)) / (30 * 86_400_000) };
      })
      .sort((a, b) => a.score - b.score)[0] ?? null;
  }, [questions, users, currentUser, currentUserId]);

  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [ask, setAsk] = useState('');

  const done = (move: FirstMove, then?: () => void) => {
    actions.noteFirstMove(move);
    leave(() => { router.replace('/(tabs)'); if (then) setTimeout(then, 380); });
  };
  const sendAnswer = () => {
    if (!question || answer.trim().length < 3) return;
    haptics.commit();
    actions.addAnswer(question.q.id, answer.trim());
    showToast({ title: 'Answer posted', body: `${question.asker?.name.split(' ')[0] ?? 'They'} will see it.`, icon: 'chatbubble-outline', href: `/question/${question.q.id}` });
    done('answer');
  };
  const sendAsk = () => {
    const title = ask.trim();
    if (title.length < 8) return;
    haptics.commit();
    const id = actions.addQuestion({ title, body: '', topic: 'technique', tags: [] });
    showToast({ title: 'Question posted', body: 'Players and coaches can answer it now.', icon: 'help-circle-outline', href: `/question/${id}` });
    done('ask');
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Wash height={420} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
        <Animated.View entering={enter(0)} style={styles.head}>
          <Text style={styles.title}>You're in{currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}.</Text>
          <Text style={styles.lead}>Start with one thing. It's how players near you find you.</Text>
        </Animated.View>

        {/* The obvious move: a clip. The Instant sits inside it for anyone without one. */}
        <Animated.View entering={enter(1)} style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel="Post a clip or photo" onPress={() => done('post', () => router.push('/compose'))} style={({ pressed }) => [styles.post, pressed && styles.pressed]}>
            <View style={styles.postIcon}><Ionicons name="videocam" size={22} color={colors.brandInk} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.postTitle}>Post a clip or photo</Text>
              <Text style={styles.postBody}>A highlight, a good rally, a funny moment.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Take an Instant" onPress={() => done('instant', () => router.push('/hit'))} style={({ pressed }) => [styles.instant, pressed && styles.pressed]}>
            <Ionicons name="camera-outline" size={16} color={colors.textMuted} />
            <Text style={styles.instantText}>Nothing saved? <Text style={styles.instantLink}>Take an Instant</Text></Text>
          </Pressable>
        </Animated.View>

        {/* A real question, answerable in a sentence, right here. */}
        {question ? (
          <Animated.View entering={enter(2)} style={styles.answerBlock}>
            <Text style={styles.label}>Or help someone out</Text>
            <View style={styles.card}>
              <View style={styles.askerRow}>
                <Avatar name={question.asker?.name ?? '?'} seed={question.asker?.avatarSeed ?? question.q.authorId} size={28} />
                <Text style={styles.asker} numberOfLines={1}>{question.asker?.name ?? 'A player'}</Text>
                {question.asker ? <LevelPill profile={question.asker.profile} small /> : null}
              </View>
              <Text style={styles.question}>{question.q.title}</Text>
              <View style={styles.replyRow}>
                <TextInput
                  value={answer}
                  onChangeText={setAnswer}
                  placeholder="Your answer, in a sentence"
                  placeholderTextColor={colors.textFaint}
                  multiline
                  accessibilityLabel="Your answer"
                  style={styles.reply}
                />
                <Pressable accessibilityRole="button" accessibilityLabel="Send answer" disabled={answer.trim().length < 3} onPress={sendAnswer} style={[styles.send, answer.trim().length < 3 && styles.sendOff]}>
                  <Ionicons name="arrow-up" size={18} color={answer.trim().length < 3 ? colors.textFaint : colors.brandInk} />
                </Pressable>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {/* The quiet option: a line that opens into a box. */}
        <Animated.View entering={enter(3)}>
          {asking ? (
            <Animated.View entering={FadeIn.duration(200)} style={[styles.card, styles.askCard]}>
              <TextInput
                value={ask}
                onChangeText={setAsk}
                placeholder={STARTER}
                placeholderTextColor={colors.textFaint}
                multiline
                autoFocus
                accessibilityLabel="Your question"
                style={styles.askInput}
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Ask" disabled={ask.trim().length < 8} onPress={sendAsk} style={[styles.askButton, ask.trim().length < 8 && styles.sendOff]}>
                <Text style={[styles.askButtonText, ask.trim().length < 8 && { color: colors.textFaint }]}>Ask</Text>
              </Pressable>
            </Animated.View>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Ask your own question" onPress={() => { setAsking(true); setAsk(''); }} style={styles.askLine}>
              <Text style={styles.askLineText}>Or ask your own question</Text>
            </Pressable>
          )}
        </Animated.View>

        <Animated.View entering={enter(4)}>
          <Pressable accessibilityRole="button" accessibilityLabel="Later" onPress={() => done('later')} hitSlop={8} style={styles.later}>
            <Text style={styles.laterText}>Later</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
      {curtain}
    </KeyboardAvoidingView>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl, maxWidth: 460, width: '100%', alignSelf: 'center' },
  head: { gap: spacing.sm },
  title: { ...typography.display, color: colors.text },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  card: { borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  pressed: { backgroundColor: colors.surfaceAlt },
  post: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  postIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  postTitle: { ...typography.heading, color: colors.text },
  postBody: { ...typography.small, color: colors.textMuted },
  instant: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  instantText: { ...typography.small, color: colors.textMuted },
  instantLink: { ...typography.smallStrong, color: colors.text },
  answerBlock: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.xs },
  askerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  asker: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  question: { ...typography.bodyStrong, color: colors.text, lineHeight: 22, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  replyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.sm, paddingLeft: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  reply: { flex: 1, ...typography.body, color: colors.text, minHeight: 38, maxHeight: 110, paddingTop: 9, paddingBottom: 9 },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  sendOff: { backgroundColor: colors.surfaceAlt },
  askLine: { alignSelf: 'center', paddingVertical: spacing.xs },
  askLineText: { ...typography.smallStrong, color: colors.textMuted, textDecorationLine: 'underline' },
  askCard: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.sm, paddingLeft: spacing.lg },
  askInput: { flex: 1, ...typography.body, color: colors.text, minHeight: 40, maxHeight: 120, paddingTop: 10, paddingBottom: 10 },
  askButton: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  askButtonText: { ...typography.smallStrong, color: colors.brandInk },
  later: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  laterText: { ...typography.smallStrong, color: colors.textFaint },
});
