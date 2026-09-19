import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { LevelPill } from '@/components/LevelPill';
import { Avatar, Button, EmptyState, Field, Screen, SegmentedControl } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

type Tab = 'followers' | 'following';

/** Who follows a player and who they follow, the way Instagram lays it out. */
export default function Follows() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ userId?: string; tab?: string }>();
  const { users, currentUserId, followingIds, followEdges, blockedIds, actions } = useApp();
  const userId = params.userId ?? currentUserId ?? '';
  const [tab, setTab] = useState<Tab>(params.tab === 'following' ? 'following' : 'followers');
  const [search, setSearch] = useState('');
  const subject = users.find((u) => u.id === userId);
  // Their followers and following come in when the list opens.
  const loadFollowsOf = actions.loadFollowsOf;
  useEffect(() => { if (userId) void loadFollowsOf(userId); }, [loadFollowsOf, userId]);

  const ids = useMemo(() => {
    const edges = followEdges.filter((e) => !blockedIds.includes(e.followerId) && !blockedIds.includes(e.followingId));
    if (tab === 'followers') return edges.filter((e) => e.followingId === userId).map((e) => e.followerId);
    if (userId === currentUserId) return followingIds;
    return edges.filter((e) => e.followerId === userId).map((e) => e.followingId);
  }, [followEdges, tab, userId, currentUserId, followingIds, blockedIds]);

  const list = ids
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .filter((u) => `${u.name} ${u.handle}`.toLowerCase().includes(search.trim().toLowerCase()));

  const counts = {
    followers: subject?.followers ?? 0,
    following: subject?.following ?? 0,
  };

  return (
    <Screen title={subject ? `@${subject.handle}` : 'Players'} compactTitle onBack={() => goBack()}>
      <View style={styles.tabs}>
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          segments={[
            { value: 'followers', label: `${counts.followers} followers` },
            { value: 'following', label: `${counts.following} following` },
          ]}
        />
      </View>
      <View style={styles.searchWrap}>
        <Field value={search} onChangeText={setSearch} placeholder="Search" autoCapitalize="none" />
      </View>
      {list.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
          body={tab === 'followers' ? 'Post a clip or answer a thread — that is how players find you.' : 'Follow players from Community or their profile.'}
        />
      ) : (
        list.map((user) => {
          const isMe = user.id === currentUserId;
          const following = followingIds.includes(user.id);
          return (
            <Pressable key={user.id} accessibilityRole="link" onPress={() => router.push(`/user/${user.id}`)} style={styles.row}>
              <Avatar name={user.name} seed={user.avatarSeed} size={48} ring={user.isCoach} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
                <View style={styles.meta}>
                  <Text style={styles.handle} numberOfLines={1}>@{user.handle}</Text>
                  <LevelPill profile={user.profile} small />
                </View>
              </View>
              {isMe ? null : (
                <Button label={following ? 'Following' : 'Follow'} variant={following ? 'secondary' : 'primary'} onPress={() => actions.toggleFollow(user.id)} />
              )}
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  tabs: { paddingBottom: spacing.md },
  searchWrap: { paddingBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  handle: { ...typography.small, color: colors.textFaint },
});
