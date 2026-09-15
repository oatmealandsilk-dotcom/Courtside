import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { PostCard } from '@/components/PostCard';
import { EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { confirmDelete } from '@/lib/confirm';
import { colors, spacing, typography } from '@/theme';

type Set = 'own' | 'clips' | 'tagged';

/**
 * One player's posts as a feed, the way Instagram opens a grid tile: the
 * whole set, newest first, scrolled to the one that was tapped.
 */
export default function PlayerPosts() {
  const styles = useThemedStyles(styleDefinitions);
  const { userId, post: startAt, set = 'own' } = useLocalSearchParams<{ userId: string; post?: string; set?: Set }>();
  const { users, posts, currentUserId, saved, actions } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [jumped, setJumped] = useState(false);

  const user = users.find((u) => u.id === userId);
  const list = useMemo(() => {
    const visible = posts.filter((p) => !p.archived);
    const mine =
      set === 'tagged' ? visible.filter((p) => p.taggedUserIds?.includes(userId))
      : visible.filter((p) => p.authorId === userId && (set !== 'clips' || p.kind === 'clip'));
    return mine.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [posts, userId, set]);

  if (!user) {
    return (
      <Screen title="Posts" compactTitle onBack={() => goBack()}>
        <EmptyState icon="person-outline" title="No such player" />
      </Screen>
    );
  }

  const title = set === 'clips' ? 'Clips' : set === 'tagged' ? 'Tagged' : 'Posts';

  return (
    <Screen
      title={title}
      subtitle={`@${user.handle}`}
      compactTitle
      onBack={() => goBack()}
      scrollRef={scrollRef}
    >
      {list.length === 0 ? (
        <EmptyState icon="images-outline" title={`No ${title.toLowerCase()} yet`} />
      ) : (
        <View style={styles.list}>
          {list.map((post) => {
            const author = users.find((u) => u.id === post.authorId) ?? user;
            return (
              <View
                key={post.id}
                onLayout={(e) => {
                  // Land on the tapped post once, then leave the scroll alone.
                  if (jumped || post.id !== startAt) return;
                  setJumped(true);
                  requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - spacing.sm), animated: false }));
                }}
              >
                <PostCard
                  post={post}
                  author={author}
                  liked={Boolean(currentUserId && post.likedBy.includes(currentUserId))}
                  onToggleLike={() => actions.toggleLike(post.id)}
                  onPress={() => router.push(`/post/${post.id}`)}
                  onPressAuthor={() => router.push(`/user/${author.id}`)}
                  saved={saved.postIds.includes(post.id)}
                  onToggleSave={() => actions.toggleSavePost(post.id)}
                  onShare={() => router.push(`/share?kind=post&id=${post.id}`)}
                  onArchive={post.authorId === currentUserId ? () => actions.toggleArchivePost(post.id) : undefined}
                  onDelete={post.authorId === currentUserId ? () => confirmDelete(() => actions.deletePost(post.id)) : undefined}
                />
              </View>
            );
          })}
          <Text style={styles.end}>That is everything from @{user.handle}.</Text>
        </View>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  list: { gap: spacing.sm },
  end: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xl },
});
