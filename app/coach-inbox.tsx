import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, EmptyState, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/** For a coach: every open question, the ones with no reply yet at the top. */
export default function CoachInbox() {
  const styles = useThemedStyles(styleDefinitions);
  const { coachQuestions, users } = useApp();
  const list = [...coachQuestions]
    .filter((q) => !q.resolved)
    .sort((a, b) => (a.replyIds.length - b.replyIds.length) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <Screen title="Questions for coaches" subtitle="Unanswered first" compactTitle onBack={() => goBack()}>
      {list.length === 0 ? (
        <EmptyState icon="chatbubbles-outline" title="Nothing waiting" body="New questions from players land here." />
      ) : list.map((q) => {
        const author = users.find((u) => u.id === q.authorId);
        const open = q.replyIds.length === 0;
        return (
          <Pressable key={q.id} accessibilityRole="link" onPress={() => router.push(`/coach-question/${q.id}`)} style={styles.row}>
            <Avatar name={author?.name ?? '?'} seed={author?.avatarSeed ?? q.id} uri={author?.avatarUrl} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title} numberOfLines={2}>{q.title}</Text>
              <PlayerName userId={author?.id} style={styles.meta}>{author?.name ?? 'Player'} · {relativeTime(q.createdAt)}{open ? '' : ` · ${q.replyIds.length} ${q.replyIds.length === 1 ? 'reply' : 'replies'}`}</PlayerName>
            </View>
            {open ? <View style={styles.pill}><Text style={styles.pillText}>NEW</Text></View> : <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  pillText: { ...typography.caption, color: colors.brand, fontWeight: '800' },
});
