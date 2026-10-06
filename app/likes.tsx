import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { LevelPill } from '@/components/LevelPill';
import { Avatar, Button, EmptyState, Field, Screen } from '@/components/ui';
import { CourtSpinner } from '@/components/CourtSpinner';
import { PeopleSkeleton } from '@/components/Skeleton';
import { useApp } from '@/store/AppContext';
import { confirmUnfollow } from '@/lib/confirm';
import { colors, spacing, typography } from '@/theme';
import { openPlayer } from '@/features/navigation/openPlayer';

/**
 * Who liked a post or a hit, the way Instagram shows it: opened by holding
 * the heart. Newest likes first, with the people you follow at the top, a
 * search box, and a Follow button on each row. With `set=tagged`, the same
 * list shows everyone tagged in the post instead; with `set=played`, the
 * players who accepted their tag on the session the post carries.
 */
export default function Likes() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ id?: string; kind?: string; set?: string }>();
  // "played": the players who accepted their tag on the post's session (migration 62), the "+2" over a clip.
  const played = params.set === 'played';
  const tagged = params.set === 'tagged' || played;
  const { users, posts, stories, currentUserId, followingIds, blockedIds, ready, actions } = useApp();
  // Opened from a link before the app has the post: fetch it, and only then decide it is gone.
  const [looked, setLooked] = useState(false);
  const [search, setSearch] = useState('');
  const isHit = params.kind === 'hit';
  const item = isHit ? stories.find((s) => s.id === params.id) : posts.find((p) => p.id === params.id);
  useEffect(() => {
    if (!ready || item || looked || !params.id) { if (ready && !params.id) setLooked(true); return; }
    if (isHit) { setLooked(true); return; }
    void actions.loadPost(params.id).finally(() => setLooked(true));
  }, [ready, item, looked, params.id, isHit, actions]);

  const people = useMemo(() => {
    if (!item) return [];
    // Likes are stored oldest first; the newest go on top, and within that the people you follow lead.
    // Tagged people keep the order they were tagged in.
    const source = played ? ('session' in item ? (item.session?.with ?? []).map((w) => w.id) : [])
      : tagged ? ('taggedUserIds' in item ? item.taggedUserIds ?? [] : []) : [...item.likedBy].reverse();
    const newestFirst = source.filter((id) => !blockedIds.includes(id));
    const ordered = [...newestFirst.filter((id) => followingIds.includes(id) || id === currentUserId), ...newestFirst.filter((id) => !followingIds.includes(id) && id !== currentUserId)];
    return ordered.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => Boolean(u));
  }, [item, users, followingIds, blockedIds, currentUserId, tagged]);

  const wanted = search.trim().toLowerCase().replace(/^@/, '');
  const shown = wanted ? people.filter((u) => `${u.name} ${u.handle}`.toLowerCase().includes(wanted)) : people;
  const count = tagged ? people.length : item?.likedBy.length ?? 0;

  return (
    <Screen title={played ? 'Who played' : tagged ? 'Tagged' : 'Likes'} compactTitle onBack={() => goBack()}>
      {!item && !looked ? (
        <PeopleSkeleton />
      ) : !item ? (
        <EmptyState icon="lock-closed-outline" title="This post isn't available" body="It was deleted, or it's from a private account you don't follow." />
      ) : (
        <>
          <Text style={styles.count}>{played ? (count === 1 ? '1 player' : `${count} players`) : tagged ? (count === 1 ? '1 person tagged' : `${count} people tagged`) : count === 1 ? '1 like' : `${count.toLocaleString()} likes`}</Text>
          {people.length > 6 ? (
            <View style={styles.searchWrap}>
              <Field value={search} onChangeText={setSearch} placeholder="Search" autoCapitalize="none" />
            </View>
          ) : null}
          {shown.length === 0 ? (
            <EmptyState
              icon={tagged ? 'person-outline' : 'heart-outline'}
              title={wanted ? 'No one by that name' : tagged ? 'No one tagged' : 'No likes yet'}
              body={wanted ? 'Try another name or @handle.' : tagged ? 'People tagged in this post show up here.' : `When people like this ${isHit ? 'instant' : 'post'}, they show up here.`}
            />
          ) : (
            shown.map((user) => {
              const isMe = user.id === currentUserId;
              const following = followingIds.includes(user.id);
              return (
                <Pressable key={user.id} accessibilityRole="link" onPress={() => openPlayer(user.id, currentUserId)} style={styles.row}>
                  <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={48} ring={user.isCoach} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
                    <View style={styles.meta}>
                      <Text style={styles.handle} numberOfLines={1}>@{user.handle}</Text>
                      <LevelPill profile={user.profile} small />
                    </View>
                  </View>
                  {isMe ? <Text style={styles.you}>You</Text> : (
                    <Button label={following ? 'Following' : 'Follow'} variant={following ? 'secondary' : 'primary'} onPress={following ? () => confirmUnfollow(user, () => actions.toggleFollow(user.id)) : () => actions.toggleFollow(user.id)} />
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
