import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, EmptyState, Screen, SegmentedControl } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

type Section = 'likes' | 'upvotes' | 'saved';

/** Everything you have done, newest first — the way Instagram's activity log works. */
export default function Activity() {
  const styles = useThemedStyles(styleDefinitions);
  const { posts, questions, users, currentUserId, saved } = useApp();
  const [section, setSection] = useState<Section>('likes');

  const me = currentUserId ?? '';
  const byDate = <T extends { createdAt: string }>(items: T[]) =>
    [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const likedPosts = byDate(posts.filter((p) => p.likedBy.includes(me)));
  const upvoted = byDate(questions.filter((q) => q.votedBy[me] === 1));
  const savedPosts = byDate(posts.filter((p) => saved.postIds.includes(p.id)));
  const savedQuestions = byDate(questions.filter((q) => saved.questionIds.includes(q.id)));

  const author = (id: string) => users.find((u) => u.id === id);

  const postRow = (post: (typeof posts)[number], icon: keyof typeof Ionicons.glyphMap) => {
    const who = author(post.authorId);
    return (
      <Pressable key={post.id} accessibilityRole="link" onPress={() => router.push(`/post/${post.id}`)} style={styles.row}>
        <Avatar name={who?.name ?? '?'} seed={who?.avatarSeed ?? post.id} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} numberOfLines={2}>{post.body}</Text>
          <Text style={styles.meta}>@{who?.handle} · {relativeTime(post.createdAt)}</Text>
        </View>
        <Ionicons name={icon} size={17} color={colors.textFaint} />
      </Pressable>
    );
  };

  const questionRow = (question: (typeof questions)[number], icon: keyof typeof Ionicons.glyphMap) => {
    const who = author(question.authorId);
    return (
      <Pressable key={question.id} accessibilityRole="link" onPress={() => router.push(`/question/${question.id}`)} style={styles.row}>
        <Avatar name={who?.name ?? '?'} seed={who?.avatarSeed ?? question.id} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} numberOfLines={2}>{question.title}</Text>
          <Text style={styles.meta}>@{who?.handle} · {relativeTime(question.createdAt)}</Text>
        </View>
        <Ionicons name={icon} size={17} color={colors.textFaint} />
      </Pressable>
    );
  };

  const empty = {
    likes: { title: 'No likes yet', body: 'Posts you like show up here.' },
    upvotes: { title: 'No upvotes yet', body: 'Discussions you upvote show up here.' },
    saved: { title: 'Nothing saved', body: 'Tap the bookmark on a post or thread to keep it.' },
  }[section];

  const rows =
    section === 'likes' ? likedPosts.map((p) => postRow(p, 'heart'))
    : section === 'upvotes' ? upvoted.map((q) => questionRow(q, 'arrow-up'))
    : [...savedPosts.map((p) => postRow(p, 'bookmark')), ...savedQuestions.map((q) => questionRow(q, 'bookmark'))];

  return (
    <Screen title="Your activity" compactTitle onBack={() => goBack()}>
      <View style={{ paddingBottom: spacing.lg }}>
        <SegmentedControl<Section>
          value={section}
          onChange={setSection}
          segments={[
            { value: 'likes', label: `Likes · ${likedPosts.length}` },
            { value: 'upvotes', label: `Upvotes · ${upvoted.length}` },
            { value: 'saved', label: `Saved · ${savedPosts.length + savedQuestions.length}` },
          ]}
        />
      </View>
      {rows.length ? rows : <EmptyState icon="time-outline" title={empty.title} body={empty.body} />}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { ...typography.body, color: colors.text, lineHeight: 20 },
  meta: { ...typography.small, color: colors.textFaint },
});
