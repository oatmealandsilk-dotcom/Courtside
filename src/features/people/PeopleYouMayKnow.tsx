import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Reanimated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, Button } from '@/components/ui';
import type { ID, User } from '@/data/types';
import { useSuggestedPlayers } from '@/features/people/suggestions';
import { pymkOn, usePymkMemory } from '@/features/people/pymk';
import { useApp } from '@/store/AppContext';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, radius, spacing, typography } from '@/theme';
import { PRESS_DIM } from '@/theme/press';
import { TextScale } from '@/theme/textScale';

/*
 * People you may know (owner, Oct 28, picking B1 of the mutuals mocks: "I
 * like b1 but it should say you may know. Instead of follow back"). A row of
 * person cards you swipe across, under Up to hit on Find Players: first the
 * people who follow you that you don't follow back ("Follows you", Follow
 * back), then the app's own suggestions (src/features/people/suggestions.ts)
 * with their real reason ("Followed by Sam", "Liked your clip", "Plays in
 * Raleigh"), Follow.
 *
 * Who may be on it is the suggestions' rule, unchanged: never you, anyone
 * blocked either way, a suspended account or anyone you already follow; a
 * teen is never put in front of an adult stranger (only a follow back, or an
 * adult the server says may be reached), and a teen sees only the people who
 * follow them. Left out here too: anyone you muted and anyone you have
 * already asked to follow (a private account). Never a court, a spot or a
 * distance: a follow back's second line is only something you did together,
 * never their town.
 *
 * Follow (or Follow back) follows with the app's own action; the card says
 * Following (or Requested, for a private account) and then slides out. The x
 * hides that person here for 30 days, Not now rests the whole row (pymk.ts).
 */

/** How long a card says Following before it slides out. */
const LINGER_MS = 1100;
/** At most this many cards in the row. */
const MOST = 12;

/** A reason that says something you did together, or who you know in common (a follow back's second line). Not a town. */
const together = (reason: string) => !/^Plays in /.test(reason) && reason !== 'Suggested for you' && reason !== 'Knows you';

export interface PymkCard { user: User; followsYou: boolean; line: string; second: string | null }

/** The row's people and what it can do, or null when it is not shown (flag off, resting, nobody to show). */
export function usePeopleYouMayKnow() {
  const { currentUser, currentUserId, followingIds, followEdges, followRequests, mutedIds, actions } = useApp();
  const on = pymkOn(currentUser);
  const { memory, hide, notNow } = usePymkMemory(on ? currentUserId : null);
  // Followed from this row: kept on it (saying Following) until it slides out.
  const [kept, setKept] = useState<ID[]>([]);
  // Gone from the row in this open (followed here; hidden ones are in `memory`).
  const [gone, setGone] = useState<ID[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const suggested = useSuggestedPlayers({ keep: kept, exclude: on ? mutedIds : [], friendsOf: on ? followingIds : [] });

  const cards = useMemo<PymkCard[]>(() => {
    if (!on || !memory || !currentUserId) return [];
    const followsMe = new Set(followEdges.filter((e) => e.followingId === currentUserId).map((e) => e.followerId));
    const asked = new Set(followRequests.filter((r) => r.fromId === currentUserId).map((r) => r.toId));
    const keptSet = new Set(kept);
    const out: PymkCard[] = [];
    for (const { user, reason } of suggested) {
      if (gone.includes(user.id) || memory.hidden[user.id]) continue;
      if (!keptSet.has(user.id) && (followingIds.includes(user.id) || asked.has(user.id))) continue;
      const followsYou = followsMe.has(user.id);
      out.push({ user, followsYou, line: followsYou ? 'Follows you' : reason, second: followsYou && together(reason) ? reason : null });
    }
    // Follow backs first, each list in the suggestions' own order.
    return [...out.filter((c) => c.followsYou), ...out.filter((c) => !c.followsYou)].slice(0, MOST);
  }, [on, memory, currentUserId, followEdges, followRequests, followingIds, suggested, kept, gone]);

  const follow = useCallback((id: ID) => {
    if (kept.includes(id)) return;
    setKept((k) => [...k, id]);
    actions.toggleFollow(id);
    timers.current.push(setTimeout(() => setGone((g) => [...g, id]), LINGER_MS));
  }, [kept, actions]);

  const resting = !!memory && memory.restUntil > Date.now();
  const [closed, setClosed] = useState(false);
  const close = useCallback(() => { setClosed(true); notNow(); }, [notNow]);

  if (!on || !memory || resting || closed || !cards.length) return null;
  return { cards, follow, hide, close };
}

export type PymkModel = NonNullable<ReturnType<typeof usePeopleYouMayKnow>>;

export function PeopleYouMayKnow({ model }: { model: PymkModel }) {
  useTheme();
  const styles = useThemedStyles(styleDefinitions);
  const { followingIds, followRequests, currentUserId } = useApp();
  const { cards, follow, hide, close } = model;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.headWords}>
          <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title}>People you may know</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.sub}>Follow each other to see each other on the map and the leaderboard</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" accessibilityHint="Hides People you may know for a few days" hitSlop={10} onPress={close} style={({ pressed }) => pressed && { opacity: PRESS_DIM }}>
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.notNow}>Not now</Text>
        </Pressable>
      </View>
      {/* The row runs to the screen's edges, so a card half in view says "there is more this way". */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.strip}>
        {cards.map(({ user, followsYou, line, second }) => {
          const following = followingIds.includes(user.id);
          const requested = !following && !!currentUserId && followRequests.some((r) => r.fromId === currentUserId && r.toId === user.id);
          const label = following ? 'Following' : requested ? 'Requested' : followsYou ? 'Follow back' : 'Follow';
          return (
            <Reanimated.View key={user.id} layout={LinearTransition.duration(240)} exiting={FadeOut.duration(160)} style={styles.card}>
              <Pressable accessibilityRole="link" accessibilityLabel={[user.name, line, second].filter(Boolean).join(', ')} onPress={() => router.push(`/user/${user.id}`)} style={styles.who}>
                <Avatar uri={user.avatarUrl} name={user.name} seed={user.avatarSeed} size={68} ring={user.isCoach} />
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{user.name}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.line} numberOfLines={1}>{line}</Text>
                {second ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.second} numberOfLines={1}>{second}</Text> : null}
              </Pressable>
              <Button
                label={label}
                accessibilityLabel={`${label} ${user.name}`}
                variant={following || requested ? 'secondary' : 'primary'}
                size="sm"
                full
                onPress={() => { if (!following && !requested) follow(user.id); }}
              />
              {/* After the face, so a screen reader meets the person first. */}
              <Pressable accessibilityRole="button" accessibilityLabel={`Hide ${user.name}`} hitSlop={8} onPress={() => hide(user.id)} style={({ pressed }) => [styles.hide, pressed && { opacity: PRESS_DIM }]}>
                <Ionicons name="close" size={16} color={colors.textFaint} />
              </Pressable>
            </Reanimated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const CARD = 158;

const styleDefinitions = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, marginBottom: spacing.md },
  headWords: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.heading, color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
  notNow: { ...typography.smallStrong, color: colors.textMuted, paddingBottom: 1 },
  scroller: { marginHorizontal: -spacing.lg, flexGrow: 0 },
  strip: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: 6 },
  card: { ...lift, width: CARD, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md, justifyContent: 'space-between', gap: spacing.md },
  hide: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  who: { alignItems: 'center', gap: 2 },
  name: { ...typography.smallStrong, fontSize: 15, color: colors.text, marginTop: spacing.sm, maxWidth: CARD - spacing.md * 2 },
  line: { ...typography.small, color: colors.textMuted, maxWidth: CARD - spacing.md * 2 },
  second: { ...typography.small, fontSize: 12, color: colors.textFaint, maxWidth: CARD - spacing.md * 2 },
});
