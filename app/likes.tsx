import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { LevelPill } from '@/components/LevelPill';
import { Avatar, Button, EmptyState, Field, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

/**
 * Who liked a post or a hit, the way Instagram shows it: opened by holding
 * the heart. Newest likes first, with the people you follow at the top, a
 * search box, and a Follow button on each row.
 */
export default function Likes() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  const { users, posts, stories, currentUserId, followingIds, blockedIds, actions } = useApp();
  const [search, setSearch] = useState('');
  const isHit = params.kind === 'hit';
  const item = isHit ? stories.find((s) => s.id === params.id) : posts.find((p) => p.id === params.id);

  const people = useMemo(() => {
    if (!item) return [];
    // Likes are stored oldest first; the newest go on top, and within that the people you follow lead.
    const newestFirst = [...item.likedBy].reverse().filter((id) => !blockedIds.includes(id));
    const ordered = [...newestFirst.filter((id) => followingIds.includes(id) || id === currentUserId), ...newestFirst.filter((id) => !followingIds.includes(id) && id !== currentUserId)];
    return ordered.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => Boolean(u));
  }, [item, users, followingIds, blockedIds, currentUserId]);

  const wanted = search.trim().toLowerCase().replace(/^@/, '');
  const shown = wanted ? people.filter((u) => `${u.name} ${u.handle}`.toLowerCase().includes(wanted)) : people;
  const count = item?.likedBy.length ?? 0;

  return (
    <Screen title="Likes" compactTitle onBack={() => goBack()}>
      {!item ? (
        <EmptyState icon="heart-dislike-outline" title="This post is gone" body="It was deleted, or it is no longer shared with you." />
      ) : (
        <>
          <Text style={styles.count}>{count === 1 ? '1 like' : `${count.toLocaleString()} likes`}</Text>
          {people.length > 6 ? (
            <View style={styles.searchWrap}>
              <Field value={search} onChangeText={setSearch} placeholder="Search" autoCapitalize="none" />
            </View>
          ) : null}
          {shown.length === 0 ? (
            <EmptyState
              icon="heart-outline"
              title={wanted ? 'No one by that name' : 'No likes yet'}
              body={wanted ? 'Try another name or @handle.' : `When people like this ${isHit ? 'hit' : 'post'}, they show up here.`}
            />
          ) : (
            shown.map((user) => {
              const isMe = user.id === currentUserId;
              const following = followingIds.includes(user.id);
              return (
                <Pressable key={user.id} accessibilityRole="link" onPress={() => router.push(isMe ? '/profile' : `/user/${user.id}`)} style={styles.row}>
                  <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={48} ring={user.isCoach} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
                    <View style={styles.meta}>
                      <Text style={styles.handle} numberOfLines={1}>@{user.handle}</Text>
                      <LevelPill profile={user.profile} small />
                    </View>
                  </View>
                  {isMe ? <Text style={styles.you}>You</Text> : (
                    <Button label={following ? 'Following' : 'Follow'} variant={following ? 'secondary' : 'primary'} onPress={() => actions.toggleFollow(user.id)} />
                  )}
                </Pressable>
              );
            })
          )}
        </>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  count: { ...typography.small, color: colors.textMuted, paddingBottom: spacing.sm },
  searchWrap: { paddingBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  handle: { ...typography.small, color: colors.textFaint },
  you: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.sm },
});
