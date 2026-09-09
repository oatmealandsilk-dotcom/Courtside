import React, { useMemo, useState } from 'react';
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useResponsive } from '@/lib/useResponsive';
import { PostCard } from '@/components/PostCard';
import { Avatar, EmptyState, Screen, SegmentedControl, type Segment } from '@/components/ui';
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
  const { isPhone } = useResponsive();
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
      rail={<View style={{ gap: 24 }}>
        {users.filter(u => u.id === currentUserId).map(u => <Pressable key={u.id} onPress={() => router.push('/profile')} style={styles.person}>
          <Avatar name={u.name} seed={u.avatarSeed} size={46} /><View style={{ flex: 1 }}><Text style={styles.personName}>{u.name}</Text><Text style={styles.personMeta}>@{u.handle}</Text></View>
        </Pressable>)}
        <View style={styles.railHeading}><Text style={styles.personMeta}>Suggested for you</Text><Text style={styles.railLabel}>EXPLORE</Text></View>
        {users.filter(u => u.id !== currentUserId).slice(0, 5).map(u => <Pressable key={u.id} accessibilityRole="link" onPress={() => router.push(`/user/${u.id}`)} style={styles.person}>
          <Avatar name={u.name} seed={u.avatarSeed} size={38} /><View style={{ flex: 1 }}><Text style={styles.personName}>{u.name}</Text><Text style={styles.personMeta}>{u.isCoach ? 'Coach' : 'Tennis player'}</Text></View><Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
        </Pressable>)}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 24, gap: 8 }}><Text style={styles.personName}>Make time for your game.</Text><Text style={styles.personMeta}>Find your next session, share the small wins, and keep showing up.</Text></View>
        <Text style={styles.railLabel}>© COURTSIDE · SEE YOU ON COURT</Text>
      </View>}

      subtitle="What your circle has been working on"
      right={isPhone &&
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 20, paddingBottom: 24, paddingTop: 6 }}>
        {users.filter(u => u.id !== currentUserId).map(u => <Pressable key={u.id} accessibilityRole="link" accessibilityLabel={`View ${u.name}`} onPress={() => router.push(`/user/${u.id}`)} style={{ alignItems: 'center', gap: 8, width: 62 }}>
          <View style={{ borderWidth: 1, borderColor: colors.borderStrong, padding: 4, borderRadius: 40 }}><Avatar name={u.name} seed={u.avatarSeed} size={52} /></View>
          <Text numberOfLines={1} style={styles.personMeta}>{u.name.split(' ')[0]}</Text>
        </Pressable>)}
      </ScrollView>
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
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  personName: { fontSize: 13, fontWeight: '600', color: colors.text },
  personMeta: { fontSize: 12, color: colors.textMuted, lineHeight: 19 },
  railHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  railLabel: { fontSize: 9, color: colors.textFaint, letterSpacing: 0.6 },
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
