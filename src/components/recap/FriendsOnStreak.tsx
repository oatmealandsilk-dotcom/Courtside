import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { StreakFlame } from '@/components/StreakFlame';
import { Avatar } from '@/components/ui';
import type { FriendStreak } from '@/data/types';
import { openPlayer } from '@/features/navigation/openPlayer';
import { streakAtRisk } from '@/features/practice/stats';
import { streakBoard } from '@/features/practice/streakBoard';
import { shownStreak, streakLabel } from '@/features/practice/streakFlame';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, spacing, typography } from '@/theme';

/**
 * "Friends on a streak" (owner, Oct 5: "go for streak board"), at the foot
 * of the weekly recap: up to 5 people you follow who are on a streak right
 * now, longest first, each with their flame and number; you in your place
 * ("You", your flame) when you are on one, or one quiet line, "Keep yours
 * going", when you are not. A tap opens their profile (on your row, your
 * Profile tab, as everywhere else: openPlayer). The flames sit in one
 * column down the card, whatever the number's length. Nobody you follow on
 * a streak: nothing at all, never an empty box.
 *
 * Who may be on it is the server's call (friends_on_streak, migration
 * 20261006000137): never anyone blocked either way, muted or suspended, a
 * private account only for its followers, a teen only when the teen
 * follows you back, and never anyone whose activity status is off. Before
 * that migration runs, friends who follow each other with you only. Only
 * you see it: it is never on the shared picture.
 */
export function FriendsOnStreak() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, currentUserId, currentUser, users, followingIds, blockedIds, blockedMeIds, mutedIds, sessions, posts, stories } = useApp();
  const [friends, setFriends] = useState<FriendStreak[] | null>(null);
  useEffect(() => {
    if (!currentUserId) { setFriends(null); return undefined; }
    let on = true;
    void actions.friendsOnStreak().then((got) => { if (on) setFriends(got); }).catch(() => undefined);
    return () => { on = false; };
  }, [currentUserId, actions]);

  const myDays = shownStreak(currentUser, currentUserId);
  const board = useMemo(() => (currentUserId && friends
    ? streakBoard({ me: currentUserId, myDays, friends, users, followingIds, hiddenIds: [...blockedIds, ...blockedMeIds, ...mutedIds] })
    : null), [currentUserId, myDays, friends, users, followingIds, blockedIds, blockedMeIds, mutedIds]);
  // Alive, but nothing yet today: your own row says what keeps it.
  const atRisk = useMemo(() => (currentUserId && board?.onStreak ? streakAtRisk(currentUserId, sessions, posts, stories) > 0 : false), [currentUserId, board, sessions, posts, stories]);
  // Each row's flame and number as wide as they draw; the column takes the widest, so every flame
  // starts at the same place and the longest number ends under "Days in a row" (larger text too).
  const [flameWidths, setFlameWidths] = useState<Record<string, number>>({});
  const measureFlame = (id: string) => (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setFlameWidths((had) => (had[id] === w ? had : { ...had, [id]: w }));
  };
  const flameColumn = board ? Math.max(0, ...board.rows.map((r) => flameWidths[r.user.id] ?? 0)) : 0;

  if (!board) return null;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text accessibilityRole="header" accessibilityLabel="Friends on a streak" style={styles.label}>FRIENDS ON A STREAK</Text>
        <Text style={styles.headNote} numberOfLines={1}>Days in a row</Text>
      </View>
      {board.rows.map(({ user, days, mine }) => {
        const keep = mine && atRisk;
        return (
          <Pressable
            key={user.id}
            accessibilityRole="link"
            accessibilityLabel={mine
              ? `You, ${streakLabel(days)}${keep ? '. Play or post today to keep it' : ''}. Open your profile`
              : `${user.name}, ${streakLabel(days)}. Open profile`}
            onPress={() => openPlayer(user.id, currentUserId)}
            style={({ pressed }) => [styles.row, mine && styles.mine, pressed && styles.pressed]}
          >
            <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={40} />
            <View style={styles.words}>
              <Text style={styles.name} numberOfLines={1}>{mine ? 'You' : user.name}</Text>
              <Text style={[styles.sub, keep && styles.keep]} numberOfLines={1}>{keep ? 'Play or post today to keep it' : `@${user.handle}`}</Text>
            </View>
            <View style={[styles.flame, flameColumn > 0 && { minWidth: flameColumn }]}>
              <View onLayout={measureFlame(user.id)}>
                <StreakFlame days={days} size="large" silent textStyle={styles.digits} maxFontSizeMultiplier={1.4} />
              </View>
            </View>
          </Pressable>
        );
      })}
      {board.onStreak ? null : (
        <View style={styles.foot}>
          <Ionicons name="flame-outline" size={15} color={colors.textMuted} />
          <Text style={styles.footText}>Keep yours going</Text>
        </View>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // The same card as the recap's highlights above it.
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden', marginTop: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  label: { ...typography.caption, fontSize: 12, letterSpacing: 1.4, color: colors.brand },
  headNote: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  mine: { backgroundColor: colors.brandDim },
  pressed: { opacity: 0.7 },
  words: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...font('600'), fontSize: 15, color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
  keep: { ...font('500'), color: colors.brand },
  // One column of flames down the card: "12" and "9" start at the same place.
  flame: { alignItems: 'flex-start' },
  digits: { fontVariant: ['tabular-nums'] },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footText: { flex: 1, ...typography.small, color: colors.textMuted },
});
