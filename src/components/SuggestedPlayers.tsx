import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { FollowPill } from '@/components/FollowPill';
import { Avatar } from '@/components/ui';
import { useSuggestedPlayers } from '@/features/people/suggestions';
import { confirmUnfollow } from '@/lib/confirm';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, radius, spacing, typography } from '@/theme';

/**
 * "Suggested for you", the way Instagram fills the space under a private
 * account: a sideways row of cards, each a face, a name, why they are here
 * and a Follow button. `near` leans it toward the town of the profile it sits
 * on; `exclude` keeps that profile itself out.
 */
export function SuggestedPlayers({ near, exclude }: { near?: string; exclude?: string[] }) {
  const styles = useThemedStyles(styleDefinitions);
  const { followingIds, actions } = useApp();
  const [followedHere, setFollowedHere] = useState<string[]>([]);
  const list = useSuggestedPlayers({ keep: followedHere, near, exclude }).slice(0, 10);
  if (!list.length) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Suggested for you</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.row}>
        {list.map(({ user, reason }) => {
          const following = followingIds.includes(user.id);
          return (
            <View key={user.id} style={styles.card}>
              <Pressable accessibilityRole="link" accessibilityLabel={`${user.name}, ${reason}`} onPress={() => router.push(`/user/${user.id}`)} style={styles.body}>
                <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={60} ring={user.isCoach} />
                <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
                <Text style={styles.reason} numberOfLines={1}>{reason}</Text>
              </Pressable>
              <FollowPill
                small
                wide
                following={following}
                userId={user.id}
                name={user.name}
                onPress={() => {
                  setFollowedHere((h) => (h.includes(user.id) ? h : [...h, user.id]));
                  if (following) confirmUnfollow(user, () => actions.toggleFollow(user.id));
                  else actions.toggleFollow(user.id);
                }}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const CARD = 150;

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md, paddingTop: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.text },
  // The row runs to the screen's edges, so a card half in view says "there is more this way".
  scroller: { marginHorizontal: -spacing.lg, flexGrow: 0 },
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  card: { ...lift, width: CARD, padding: spacing.md, gap: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  body: { alignItems: 'center', gap: 4 },
  name: { ...typography.smallStrong, color: colors.text, marginTop: 6, maxWidth: CARD - spacing.md * 2 },
  reason: { ...typography.caption, color: colors.textMuted, maxWidth: CARD - spacing.md * 2 },
});
