import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { PostCard } from '@/components/PostCard';
import { EmptyState, Screen, SegmentedControl, type Segment } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

type FeedFilter = 'all' | 'match' | 'session' | 'gear';

const SEGMENTS: Segment<FeedFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'match', label: 'Matches' },
  { value: 'session', label: 'Sessions' },
  { value: 'gear', label: 'Gear' },
];

export default function Feed() {
  const { posts, users, currentUserId, actions, ready } = useApp();
  const [filter, setFilter] = useState<FeedFilter>('all');

  const visible = useMemo(() => {
    const sorted = [...posts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return filter === 'all' ? sorted : sorted.filter((p) => p.kind === filter);
  }, [posts, filter]);

  return (
    <Screen
      title="CourtSide"
      subtitle="What your circle has been working on"
      right={
        <Pressable
          onPress={() => router.push('/compose')}
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel="New post"
        >
          <Ionicons name="add" size={22} color={colors.brandInk} />
        </Pressable>
      }
    >
      <View style={styles.filters}>
        <SegmentedControl segments={SEGMENTS} value={filter} onChange={setFilter} />
      </View>

      {!ready ? (
        <EmptyState icon="hourglass-outline" title="Loading the feed" />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Log a session or a match and it shows up at the top of the feed."
        />
      ) : (
        <View style={styles.list}>
          {visible.map((post) => {
            const author = users.find((u) => u.id === post.authorId);
            if (!author) return null;
            return (
              <PostCard
                key={post.id}
                post={post}
                author={author}
                liked={Boolean(currentUserId && post.likedBy.includes(currentUserId))}
                onToggleLike={() => actions.toggleLike(post.id)}
                onPress={() => router.push(`/post/${post.id}`)}
                onPressAuthor={() => router.push(`/user/${author.id}`)}
              />
            );
          })}
          <Text style={styles.end}>That is everything from this week.</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: { paddingBottom: spacing.lg },
  list: { gap: spacing.lg },
  end: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xl },
});
