import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { requestSection } from '@/features/navigation/swipeOrder';
import { goToTab } from '@/features/navigation/startTab';
import { goBack } from '@/lib/goBack';

import { FollowPill } from '@/components/FollowPill';
import { SectionPager } from '@/components/SectionPager';
import { LevelPill } from '@/components/LevelPill';
import { StreakFlame } from '@/components/StreakFlame';
import { shownStreak } from '@/features/practice/streakFlame';
import { Avatar, EmptyState, Field, Screen, SegmentedControl } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { confirmUnfollow } from '@/lib/confirm';
import { compactNumber } from '@/lib/format';
import { colors, spacing, typography } from '@/theme';
import { LESS_AI_ROUND2 } from '@/theme/look';

type Tab = 'followers' | 'following';
const TABS: Tab[] = ['followers', 'following'];
/**
 * The list not on show is built only as far as one screenful (enough for the
 * part that slides into view mid-swipe); the rest comes once it has been
 * opened, so a player with thousands of followers never builds both whole
 * lists at once (D10 review).
 */
const PEEK = 14;

/** Who follows a player and who they follow, the way Instagram lays it out. */
export default function Follows() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ userId?: string; tab?: string }>();
  const { users, currentUserId, followingIds, followEdges, blockedIds, actions } = useApp();
  const userId = params.userId ?? currentUserId ?? '';
  const [tab, setTab] = useState<Tab>(params.tab === 'following' ? 'following' : 'followers');
  const [search, setSearch] = useState('');
  // Which lists have been on show: those are built in full, the other only to a screenful.
  const [opened, setOpened] = useState<ReadonlySet<Tab>>(() => new Set([tab]));
  useEffect(() => {
    setOpened((was) => (was.has(tab) ? was : new Set([...was, tab])));
  }, [tab]);
  const subject = users.find((u) => u.id === userId);
  // Their followers and following come in when the list opens.
  const loadFollowsOf = actions.loadFollowsOf;
  // Until they have come in, a spinner: never "No followers yet" over someone with 9.1k.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!userId) return undefined;
    let current = true;
    setLoaded(false);
    void loadFollowsOf(userId).catch(() => undefined).then(() => { if (current) setLoaded(true); });
    return () => { current = false; };
  }, [loadFollowsOf, userId]);

  // Your own Following keeps someone you unfollow here in their place, now offering "Follow", until
  // you leave the page (Oct 22, as Instagram does): the row no longer vanishes and the list no longer jumps.
  const keptFollowing = useRef<string[] | null>(null);
  const myFollowing = useMemo(() => {
    const was = keptFollowing.current;
    const next = was ? [...was, ...followingIds.filter((id) => !was.includes(id))] : [...followingIds];
    keptFollowing.current = next;
    return next;
  }, [followingIds]);

  // Both lists at once: the two sit side by side and slide between (Oct 20 sweep, as Profile's sections do).
  const idsOf = useMemo(() => {
    const edges = followEdges.filter((e) => !blockedIds.includes(e.followerId) && !blockedIds.includes(e.followingId));
    return {
      followers: edges.filter((e) => e.followingId === userId).map((e) => e.followerId),
      following: userId === currentUserId ? myFollowing.filter((id) => !blockedIds.includes(id)) : edges.filter((e) => e.followerId === userId).map((e) => e.followingId),
    };
  }, [followEdges, userId, currentUserId, myFollowing, blockedIds]);

  const listOf = (which: Tab) => idsOf[which]
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .filter((u) => `${u.name} ${u.handle}`.toLowerCase().includes(search.trim().toLowerCase()));

  const counts = {
    followers: subject?.followers ?? 0,
    following: subject?.following ?? 0,
  };

  const pane = (tab: Tab) => {
    const whole = listOf(tab);
    const list = opened.has(tab) ? whole : whole.slice(0, PEEK);
    return (
      <View>
        {list.length === 0 && !loaded ? (
          <View style={styles.loading}><ActivityIndicator color={colors.textMuted} /></View>
        ) : list.length === 0 && search.trim() !== '' && idsOf[tab].length > 0 ? (
          // A search that matches nobody says so, not that the list itself is empty.
          <EmptyState icon="search-outline" title={`No one matches “${search.trim()}”`} />
        ) : list.length === 0 ? (
          // Your own empty list says how to change that; someone else's simply says it is empty.
          userId === currentUserId ? (
            <EmptyState
              icon="people-outline"
              title={tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
              body={tab === 'followers' ? 'Post a clip or answer a thread. That is how players find you.' : 'Follow players from Community or their profile.'}
              action={tab === 'followers' ? { label: 'Post a clip', onPress: () => router.push('/compose') } : { label: 'Find players', onPress: () => { requestSection('/discuss', 'players'); goToTab('/discuss'); } }}
            />
          ) : (
            <EmptyState icon="people-outline" title={tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'} />
          )
        ) : (
          list.map((user) => {
            const isMe = user.id === currentUserId;
            const following = followingIds.includes(user.id);
            return (
              <Pressable key={user.id} accessibilityRole="link" onPress={() => router.push(`/user/${user.id}`)} style={styles.row}>
                <Avatar name={user.name} seed={user.avatarSeed} size={48} ring={user.isCoach} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.nameLine}>
                    <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
                    <StreakFlame days={shownStreak(user, currentUserId)} />
                  </View>
                  <View style={styles.meta}>
                    <Text style={styles.handle} numberOfLines={1}>@{user.handle}</Text>
                    <LevelPill profile={user.profile} small />
                  </View>
                </View>
                {isMe ? null : (
                  // The pill knows about a request sent to a private account: it says Requested, not Follow.
                  <FollowPill soft={LESS_AI_ROUND2} following={following} userId={user.id} name={user.name} small onPress={following ? () => confirmUnfollow(user, () => actions.toggleFollow(user.id)) : () => actions.toggleFollow(user.id)} />
                )}
              </Pressable>
            );
          })
        )}
      </View>
    );
  };

  return (
    <Screen title={subject ? `@${subject.handle}` : 'Players'} compactTitle onBack={() => goBack()}>
      <View style={styles.tabs}>
        <SegmentedControl<Tab>
          slide
          value={tab}
          onChange={setTab}
          segments={[
            // Written the way the profile writes them: "9.1k followers".
            { value: 'followers', label: `${compactNumber(counts.followers)} followers` },
            { value: 'following', label: `${compactNumber(counts.following)} following` },
          ]}
        />
      </View>
      <View style={styles.searchWrap}>
        <Field value={search} onChangeText={setSearch} placeholder="Search" autoCapitalize="none" />
      </View>
      <SectionPager index={TABS.indexOf(tab)} panes={TABS.map(pane)} depth={1} edgeBack slideOnTap bleed={spacing.lg} onIndex={(i) => setTab(TABS[i])} />
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  tabs: { paddingBottom: spacing.md },
  searchWrap: { paddingBottom: spacing.sm },
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  // The name and their streak's flame (3 days or more), the name giving way first.
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  name: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  handle: { ...typography.small, color: colors.textFaint },
});
