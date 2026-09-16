import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { CommentRow } from '@/components/CommentRow';
import { DragSheet } from '@/components/DragSheet';
import { Field } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Comments on a clip, a post or a hit, as a sheet over the feed — the way
 * Instagram does it — instead of a page of its own. Threads keep their page.
 */
export default function CommentsSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const { kind: rawKind, id = '' } = useLocalSearchParams<{ kind?: string; id?: string }>();
  const kind = rawKind === 'hit' ? 'hit' : 'post';
  const { comments, posts, stories, actions } = useApp();
  const [draft, setDraft] = useState('');
  const [closeSignal, setCloseSignal] = useState(0);
  const exists = kind === 'hit' ? stories.some((st) => st.id === id) : posts.some((p) => p.id === id);
  const thread = comments.filter((c) => c.postId === id).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const send = () => {
    const text = draft.trim();
    if (!text || !exists) return;
    if (kind === 'hit') actions.addStoryComment(id, text);
    else actions.addComment(id, text);
    setDraft('');
  };

  return (
    <DragSheet
      closeSignal={closeSignal}
      onDismissed={() => router.back()}
      peekFraction={0.7}
      header={
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Comments{thread.length ? ` · ${thread.length}` : ''}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setCloseSignal((n) => n + 1)}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      }
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {thread.map((c) => <CommentRow key={c.id} comment={c} />)}
          {!thread.length ? <Text style={styles.empty}>{exists ? 'No comments yet. Start the conversation.' : 'This is no longer available.'}</Text> : null}
        </ScrollView>
        <View style={styles.composer}>
          <View style={{ flex: 1 }}>
            <Field value={draft} onChangeText={setDraft} placeholder="Add a comment…" multiline minHeight={44} onSubmitEditing={send} mentions />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Post comment" disabled={!draft.trim() || !exists} onPress={send} style={[styles.send, (!draft.trim() || !exists) && { opacity: 0.4 }]}>
            <Ionicons name="arrow-up" size={19} color={colors.brandInk} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  heading: { ...typography.title, color: colors.text },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xl },
  empty: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.lg, textAlign: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
  send: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
});
