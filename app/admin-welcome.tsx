import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { EmptyState, Avatar, Screen } from '@/components/ui';
import { CourtSpinner } from '@/components/CourtSpinner';
import type { Post } from '@/data/types';
import { goBack } from '@/lib/goBack';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Everyone's first post from the last month, newest first, and whether you
 * have said hello yet. A comment from the founder on day one is the best
 * thing that can happen to a new account.
 */
export default function AdminWelcome() {
  const styles = useThemedStyles(styleDefinitions);
  const { users, comments, currentUserId, actions } = useApp();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const load = useCallback(async () => { setPosts(await actions.loadFirstPosts()); }, [actions]);
  useEffect(() => { void load(); }, [load]);

  const welcomed = (post: Post) => comments.some((c) => c.postId === post.id && c.authorId === currentUserId);
  const waiting = posts?.filter((p) => !welcomed(p)).length ?? 0;

  return (
    <Screen title="Welcome new players" compactTitle onBack={() => goBack()} onRefresh={load}>
      <Text style={styles.lead}>
        {posts === null ? ' ' : waiting ? `${waiting} first ${waiting === 1 ? 'post is' : 'posts are'} waiting for a hello.` : 'Everyone has been welcomed.'} A comment from you on someone's first day does more for them coming back than anything else.
      </Text>
      {posts === null ? (
        <View style={styles.loading}><CourtSpinner size={28} /></View>
      ) : !posts.length ? (
        <EmptyState icon="sparkles-outline" title="No first posts yet" body="When a new player posts for the first time, it shows up here." />
      ) : (
        <View style={styles.card}>
          {posts.map((post, index) => {
            const author = users.find((u) => u.id === post.authorId);
            const done = welcomed(post);
            const picture = post.thumbnailUrl ?? post.imageUrl;
            return (
              <Pressable key={post.id} accessibilityRole="link" accessibilityLabel={`${author?.name ?? 'A new player'}'s first post`} onPress={() => router.push(`/post/${post.id}`)} style={({ pressed }) => [styles.row, index > 0 && styles.rowLine, pressed && { backgroundColor: colors.surfaceAlt }]}>
                <Avatar name={author?.name ?? '?'} seed={author?.avatarSeed ?? post.authorId} size={44} />
                <View style={styles.words}>
                  <Text style={styles.name} numberOfLines={1}>{author?.name ?? 'New player'}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{[author?.handle ? `@${author.handle}` : null, author?.location?.split(',')[0] || null, relativeTime(post.createdAt)].filter(Boolean).join(' · ')}</Text>
                  {post.body ? <Text style={styles.body} numberOfLines={1}>{post.body}</Text> : null}
                </View>
                {picture ? <Image accessibilityIgnoresInvertColors source={{ uri: picture }} style={styles.thumb} /> : null}
                {done ? (
                  <View style={styles.done}><Ionicons name="checkmark" size={14} color={colors.brand} /><Text style={styles.doneText}>Said hi</Text></View>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Say hi to ${author?.name ?? 'them'}`} hitSlop={6} onPress={() => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id } })} style={styles.hi}>
                    <Text style={styles.hiText}>Say hi</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  card: { borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  words: { flex: 1, gap: 1 },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  body: { ...typography.small, color: colors.textFaint },
  thumb: { width: 40, height: 50, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  hi: { height: 32, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  hiText: { ...typography.smallStrong, color: colors.brandInk },
  done: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  doneText: { ...typography.smallStrong, color: colors.brand },
});
