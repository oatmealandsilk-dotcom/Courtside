import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AchievementGrid } from '@/components/AchievementGrid';
import { LevelPill } from '@/components/LevelPill';
import { PostCard } from '@/components/PostCard';
import { Avatar, Button, Card, Chip, EmptyState, Screen, StatTile } from '@/components/ui';
import { evaluateAchievements, playStyleLabel } from '@/lib/badges';
import { compactNumber, formatDate } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

export default function UserProfile() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { users, posts, coaches, currentUserId, actions } = useApp();

  const user = users.find((u) => u.id === id);

  if (!user) {
    return (
      <Screen title="Player" compactTitle onBack={() => router.back()}>
        <EmptyState icon="person-outline" title="No such player" />
      </Screen>
    );
  }

  const coach = coaches.find((c) => c.userId === user.id);
  const theirPosts = posts
    .filter((p) => p.authorId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const unlocked = evaluateAchievements(user).filter((a) => a.unlocked);

  return (
    <Screen title={user.name} compactTitle onBack={() => router.back()}>
      <Card style={styles.identity}>
        <View style={styles.identityRow}>
          <Avatar name={user.name} seed={user.avatarSeed} size={62} ring={user.isCoach} />
          <View style={styles.identityText}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.handle}>
              @{user.handle} · {user.location}
            </Text>
            <View style={styles.pillRow}>
              <LevelPill profile={user.profile} small />
              <Chip label={playStyleLabel[user.profile.playStyle]} small />
            </View>
          </View>
        </View>
        <Text style={styles.bio}>{user.bio}</Text>
        <View style={styles.followRow}>
          <Text style={styles.followText}>
            <Text style={styles.followCount}>{compactNumber(user.followers)}</Text> followers
          </Text>
          <Text style={styles.followText}>Joined {formatDate(user.joinedAt)}</Text>
        </View>
        {currentUserId !== user.id && <Button label="Message" variant="secondary" onPress={() => router.push(`/messages/${actions.openConversationWith(user.id)}`)} full/>}
        {coach ? (
          <Button label="See coaching services" onPress={() => router.push(`/coach/${coach.id}`)} full />
        ) : null}
      </Card>

      <View style={styles.tileRow}>
        <StatTile label="Sessions" value={String(user.stats.sessionsLogged)} />
        <StatTile label="Hours" value={String(user.stats.hoursOnCourt)} />
      </View>

      {unlocked.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Achievements</Text>
          <AchievementGrid items={unlocked} />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Posts</Text>
        {theirPosts.length === 0 ? (
          <Text style={styles.muted}>Nothing posted yet.</Text>
        ) : (
          <View style={styles.postList}>
            {theirPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                author={user}
                liked={Boolean(currentUserId && post.likedBy.includes(currentUserId))}
                onToggleLike={() => actions.toggleLike(post.id)}
                onPress={() => router.push(`/post/${post.id}`)}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  identity: { gap: spacing.md },
  identityRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  identityText: { flex: 1, gap: 4 },
  name: { ...typography.title, color: colors.text },
  handle: { ...typography.small, color: colors.textFaint },
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', paddingTop: 2 },
  bio: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  followRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  followText: { ...typography.small, color: colors.textFaint },
  followCount: { color: colors.text, fontWeight: '700' },
  tileRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.lg },
  section: { gap: spacing.md, paddingBottom: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  gameCard: { gap: spacing.xs },
  gameLine: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  muted: { ...typography.small, color: colors.textFaint },
  postList: { gap: spacing.lg },
});
