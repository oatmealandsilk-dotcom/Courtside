import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { FollowPill } from '@/components/FollowPill';
import { LevelPill } from '@/components/LevelPill';
import { Avatar } from '@/components/ui';
import { Wash } from '@/components/Wash';
import type { User } from '@/data/types';
import { useAutoLog } from '@/features/activity/autoLog';
import { useInviterToFollow } from '@/features/activity/nearYou';
import { useSuggestedPlayers } from '@/features/people/suggestions';
import { confirmUnfollow } from '@/lib/confirm';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, spacing, typography } from '@/theme';

/** People offered to follow on the page. */
const PICKS = 3;

/**
 * Activities' first page for a new player (following fewer than five people,
 * owner Oct 6): the two ways in, then people to follow.
 *  - "Connect Apple Health to log automatically" (or WHOOP), a slim row,
 *    while nothing brings sessions in: the setup card's quiet second home
 *    after "Not now" (features/activity/autoLog).
 *  - "Log a session", for anything played without a watch.
 *  - A few people to follow, whoever invited you first (by migration 84's
 *    rule, see useInviterToFollow), then the suggestions' own (teen-safe).
 * Below it, the sessions of the people you follow and, marked "Near you",
 * players in your town (features/activity/nearYou).
 */
export function ActivitiesStart({ topInset, bottomInset, nearCount }: { topInset: number; bottomInset: number; nearCount: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const { followingIds, actions } = useApp();
  const auto = useAutoLog();
  const [busy, setBusy] = useState(false);
  const inviter = useInviterToFollow();
  // Someone followed from here stays, saying Following (as the feed's strip does).
  const [kept, setKept] = useState<string[]>([]);
  const suggested = useSuggestedPlayers({ keep: kept, exclude: inviter ? [inviter.id] : [] });
  const people: { user: User; reason: string }[] = [
    ...(inviter ? [{ user: inviter, reason: 'Invited you' }] : []),
    ...suggested,
  ].slice(0, PICKS);

  const source = auto.apple ? 'apple-health' : auto.whoop ? 'whoop' : null;
  const offer = auto.ready && !auto.connected && !!source;
  const connect = async () => {
    if (!source || busy) return;
    haptics.tap();
    setBusy(true);
    try {
      await auto.connect(source);
      showToast({ title: source === 'whoop' ? 'WHOOP connected' : 'Apple Health connected', body: 'Your past week’s workouts show up in Notifications, ready to log.', icon: 'checkmark-circle-outline' });
    } catch (err) {
      showToast({ title: 'Couldn’t connect', body: err instanceof Error ? err.message : 'Try again in a moment.', icon: 'alert-circle-outline' });
    } finally {
      setBusy(false);
    }
  };
  const follow = (who: User) => {
    setKept((k) => (k.includes(who.id) ? k : [...k, who.id]));
    if (followingIds.includes(who.id)) confirmUnfollow(who, () => actions.toggleFollow(who.id));
    else actions.toggleFollow(who.id);
  };

  return (
    <View style={[styles.page, { paddingTop: topInset, paddingBottom: bottomInset }]}>
      <Wash height={300} strength={0.6} />
      <View style={styles.head}>
        <Text style={styles.title}>Start logging</Text>
        <Text style={styles.lead}>Your sessions and the people you follow show up here.</Text>
      </View>

      <View style={styles.card}>
        {offer ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Connect ${source === 'whoop' ? 'WHOOP' : 'Apple Health'} to log automatically`} disabled={busy} onPress={() => { void connect(); }} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={styles.tile}><Ionicons name="pulse" size={18} color={colors.brand} /></View>
            <Text style={styles.rowText} numberOfLines={2}>{busy ? 'Connecting…' : `Connect ${source === 'whoop' ? 'WHOOP' : 'Apple Health'} to log automatically`}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Log a session" onPress={() => router.push('/log-session')} style={({ pressed }) => [styles.row, offer && styles.rowLine, pressed && styles.pressed]}>
          <View style={styles.tile}><Ionicons name="add" size={20} color={colors.brand} /></View>
          <Text style={styles.rowText}>Log a session</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>
      </View>

      {people.length ? (
        <View style={styles.people}>
          <Text style={styles.label}>People to follow</Text>
          <View style={styles.card}>
            {people.map(({ user, reason }, i) => (
              <View key={user.id} style={[styles.person, i > 0 && styles.rowLine]}>
                <Pressable accessibilityRole="link" accessibilityLabel={`${user.name}'s profile`} onPress={() => router.push(`/user/${user.id}`)} style={styles.personTap}>
                  <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={40} ring={user.isCoach} />
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={styles.personMeta}><Text style={styles.personName} numberOfLines={1}>{user.name}</Text><LevelPill profile={user.profile} small /></View>
                    <Text style={styles.reason} numberOfLines={1}>{reason}</Text>
                  </View>
                </Pressable>
                <FollowPill small following={followingIds.includes(user.id)} userId={user.id} onPress={() => follow(user)} name={user.name.split(' ')[0]} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.more}>
        <Ionicons name="chevron-down" size={16} color={colors.textFaint} />
        <Text style={styles.moreText}>{nearCount ? 'Swipe up for sessions near you' : 'Sessions you and they post show up here'}</Text>
      </View>
    </View>
  );
}

/**
 * "Near you" on a session from a player you don't follow yet, with Follow:
 * in the page's own flow over a written post, or as a small tile over a
 * picture (`over`).
 */
export function NearYouTag({ user, over = false }: { user: User; over?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { followingIds, actions } = useApp();
  const following = followingIds.includes(user.id);
  return (
    <View style={[styles.near, over && styles.nearOver]}>
      <Ionicons name="location" size={14} color={colors.brand} />
      <Text style={styles.nearText}>Near you</Text>
      <FollowPill small following={following} userId={user.id} name={user.name.split(' ')[0]} onPress={() => (following ? confirmUnfollow(user, () => actions.toggleFollow(user.id)) : actions.toggleFollow(user.id))} />
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.lg, backgroundColor: colors.bg, maxWidth: 520, width: '100%', alignSelf: 'center' },
  head: { gap: 4, paddingHorizontal: spacing.xs },
  title: { ...typography.title, color: colors.text },
  lead: { ...typography.small, color: colors.textMuted },
  card: { ...lift, borderRadius: 18, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 12, minHeight: 56 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.surfaceAlt },
  tile: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  rowText: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  people: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.xs },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  personTap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  personName: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  personMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reason: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: spacing.sm },
  moreText: { ...typography.small, color: colors.textFaint },
  near: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: spacing.sm },
  nearOver: { position: 'absolute', left: spacing.lg, zIndex: 5, backgroundColor: colors.surface, borderRadius: 999, paddingLeft: 10, paddingRight: 4, paddingVertical: 4, marginBottom: 0, ...lift },
  nearText: { ...typography.smallStrong, color: colors.text, marginRight: 4 },
});
