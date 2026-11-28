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
import { TextScale } from '@/theme/textScale';
import { InkButton, TextAction } from '@/components/plain/Plain';
import { noBoxes } from '@/features/noBoxes/noBoxes';

/** No boxes (demo only, features/noBoxes): each person plain on the page, Follow in ink sized to its word. */
const PLAIN = noBoxes();

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
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>Suggested for you</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={[styles.row, PLAIN && styles.plainStrip]}>
        {list.map(({ user, reason }) => {
          const following = followingIds.includes(user.id);
          return (
            <View key={user.id} style={[styles.card, PLAIN && styles.plainCard]}>
              <Pressable accessibilityRole="link" accessibilityLabel={`${user.name}, ${reason}`} onPress={() => router.push(`/user/${user.id}`)} style={[styles.body, PLAIN && styles.plainBody]}>
                <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={PLAIN ? 56 : 60} ring={user.isCoach} />
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{user.name}</Text>
                <Text style={styles.reason} numberOfLines={1}>{reason}</Text>
              </Pressable>
              {PLAIN ? (
                // No boxes (demo only): Follow in ink sized to its word, at the left; Following as quiet words.
                <View style={styles.plainFollow}>
                  {following
                    ? <TextAction small tone="muted" label="Following" accessibilityLabel={`Following ${user.name}`} onPress={() => confirmUnfollow(user, () => actions.toggleFollow(user.id))} style={styles.plainFlush} />
                    : <InkButton small label="Follow" accessibilityLabel={`Follow ${user.name}`} onPress={() => { setFollowedHere((h) => (h.includes(user.id) ? h : [...h, user.id])); actions.toggleFollow(user.id); }} />}
                </View>
              ) : (
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
              )}
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
  // No boxes (demo only): a person on the page, not a card.
  plainCard: { backgroundColor: 'transparent', borderWidth: 0, boxShadow: 'none', shadowOpacity: 0, elevation: 0, width: 132, paddingHorizontal: 0, gap: spacing.sm },
  plainBody: { alignItems: 'flex-start' },
  plainFollow: { alignItems: 'flex-start' },
  plainFlush: { paddingHorizontal: 0 },
  plainStrip: { gap: spacing.lg },
});
