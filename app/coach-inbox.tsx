import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, EmptyState, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, lift, radius, spacing, typography } from '@/theme';

/** For a coach: every open question, the ones with no reply yet at the top. */
export default function CoachInbox() {
  return (
    <Screen title="Questions for coaches" subtitle="Unanswered first" compactTitle onBack={() => goBack()}>
      <QuestionsPanel />
    </Screen>
  );
}

/** Free questions from players, unanswered first: this page and the studio's Questions tab. */
export function QuestionsPanel() {
  const styles = useThemedStyles(styleDefinitions);
  const { coachQuestions, users } = useApp();
  const list = [...coachQuestions]
    .filter((q) => !q.resolved)
    .sort((a, b) => (a.replyIds.length - b.replyIds.length) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <>
      {list.length === 0 ? (
        <EmptyState icon="chatbubbles-outline" title="Nothing waiting" body="New questions from players land here." />
      ) : <View style={styles.group}>{list.map((q, index) => {
        const author = users.find((u) => u.id === q.authorId);
        const open = q.replyIds.length === 0;
        return (
          <Pressable key={q.id} accessibilityRole="link" onPress={() => router.push(`/coach-question/${q.id}`)} style={({ pressed }) => [styles.row, index > 0 && styles.line, pressed && { backgroundColor: colors.surfaceAlt }]}>
            <Avatar name={author?.name ?? '?'} seed={author?.avatarSeed ?? q.id} uri={author?.avatarUrl} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title} numberOfLines={2}>{q.title}</Text>
              <PlayerName userId={author?.id} style={styles.meta}>{author?.name ?? 'Player'} · {relativeTime(q.createdAt)}{open ? '' : ` · ${q.replyIds.length} ${q.replyIds.length === 1 ? 'reply' : 'replies'}`}</PlayerName>
            </View>
            {open ? <View style={styles.pill}><Text style={styles.pillText}>New</Text></View> : <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
          </Pressable>
        );
      })}</View>}
    </>
  );
}

const styleDefinitions = StyleSheet.create({
  // The same grouped card as the bookings, so the studio's tabs read alike.
  group: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  title: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  pillText: { ...typography.caption, letterSpacing: 0, color: colors.brand, fontWeight: '700' },
});
