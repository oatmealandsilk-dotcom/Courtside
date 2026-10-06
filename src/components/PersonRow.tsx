import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Highlighted } from '@/components/CourtSearch';
import { FollowPill } from '@/components/FollowPill';
import { LevelPill } from '@/components/LevelPill';
import { StreakFlame } from '@/components/StreakFlame';
import { shownStreak, streakWords } from '@/features/practice/streakFlame';
import { Avatar } from '@/components/ui';
import type { User } from '@/data/types';
import { levelBadge } from '@/lib/badges';
import { highlightParts, snippet } from '@/features/search/match';
import { confirmUnfollow } from '@/lib/confirm';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';

/**
 * One person in a list, the way Instagram's search shows them: picture
 * (with the coach badge), name and level, then their handle and why they
 * came up, and Follow on the right. The hairline runs from the words, not
 * the picture. Given `words`, the matched letters of the name and handle
 * are bold. A coach found only through their coaching listing (`via`): the
 * second line shows those words, with the match in bold, so the row says
 * why it is there. No row shows a town.
 */
export function PersonRow({ user, reason, via, words = [], first = false, onPress, follow = true, onFollowed }: {
  user: User;
  /** Why they are here: "2 mutual", "Coach", "Near you". Never their town. */
  reason?: string;
  /** The words of theirs that matched, when it was not their name or handle. */
  via?: string;
  words?: string[];
  /** The first row of a list draws no hairline above it. */
  first?: boolean;
  onPress: () => void;
  follow?: boolean;
  /** Heard when Follow is tapped (not Unfollow), so a list can keep the row in place. */
  onFollowed?: (userId: string) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { followingIds, currentUserId, actions } = useApp();
  const following = followingIds.includes(user.id);
  const streak = shownStreak(user, currentUserId);
  // The reason only, never their town: a search row says nothing about where
  // anyone is (the same for every account, so it says nothing about age).
  const why = reason ?? '';
  const bold = (parts: { s: string; on: boolean }[]) => parts.map((p, i) => (p.on ? <Text key={i} style={styles.handleMatch}>{p.s}</Text> : p.s));
  const label = `${user.name}${streakWords(streak)}, @${user.handle}, ${levelBadge(user.profile).label}${user.isCoach ? ', coach' : ''}`;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Avatar uri={user.avatarUrl} name={user.name} seed={user.avatarSeed} size={44} ring={user.isCoach} />
      <View style={[styles.body, !first && styles.rule]}>
        <View style={styles.words}>
          <View style={styles.nameLine}>
            <Highlighted text={user.name} words={words} style={styles.name} strong={styles.nameMatch} lines={1} wordStart />
            {/* The small flame here, close after the name: the row also holds the level and Follow. */}
            <StreakFlame days={streak} size="small" style={styles.flame} />
            {streak ? (
              // With a flame, the name and its flame keep their room and the level gives way: it shows
              // when it fits beside them, and otherwise drops to a hidden second line (it is on their profile).
              <View style={styles.levelRoom}>
                <View style={styles.levelGate} />
                <LevelPill profile={user.profile} small />
              </View>
            ) : <LevelPill profile={user.profile} small />}
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            @{bold(highlightParts(user.handle, words, { inside: 2 }))}
            {via ? <> · {bold(highlightParts(snippet(via, words, 12, 60), words))}</> : why ? ` · ${why}` : ''}
          </Text>
        </View>
        {follow ? (
          <FollowPill
            small
            following={following}
            userId={user.id}
            name={user.name}
            onPress={() => {
              if (following) { confirmUnfollow(user, () => actions.toggleFollow(user.id)); return; }
              onFollowed?.(user.id);
              actions.toggleFollow(user.id);
            }}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.lg },
  pressed: { backgroundColor: colors.bgElevated },
  body: { flex: 1, minWidth: 0, minHeight: 60, paddingVertical: spacing.sm, paddingRight: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  words: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  name: { ...font('500'), fontSize: 16, color: colors.text, flexShrink: 1 },
  flame: { marginLeft: -2 },
  // The rest of the line after the flame, one small level pill tall: a pill that does not fit wraps out of sight.
  levelRoom: { flex: 1, minWidth: 0, height: 19, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', overflow: 'hidden' },
  levelGate: { width: 0, height: 19 },
  nameMatch: { ...font('700') },
  meta: { ...typography.small, color: colors.textFaint },
  handleMatch: { ...font('600'), color: colors.textMuted },
});
