import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { HitGlyph } from '@/components/HitGlyph';
import { PersonRow } from '@/components/PersonRow';
import { useSuggestedPlayers } from '@/features/people/suggestions';
import { notKnownAdult } from '@/features/players/age';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * Design options for the Notifications page of a player with nothing yet (Nov 3, for the owner to pick from;
 * shown only on the website with ?var=notifications-empty:A … D, see features/design/variant). Each one fills
 * the space under the welcome row a different way; today's centred "Nothing else yet" stays the default.
 */

const EXAMPLE_LINE = 'Likes, replies and hits will show here.';

/** A: three sample rows in the real row's shape, faint and marked as examples, so the bell's use is plain. */
export function ExampleRows() {
  const styles = useThemedStyles(styleDefinitions);
  const rows: { key: string; icon: React.ReactNode; who: string; verb: string }[] = [
    { key: 'like', icon: <Ionicons name="heart-outline" size={20} color={colors.textMuted} />, who: 'Someone', verb: 'liked your clip' },
    { key: 'court', icon: <Ionicons name="location-outline" size={20} color={colors.textMuted} />, who: 'A friend', verb: 'is playing at a court' },
    { key: 'hit', icon: <HitGlyph size={20} color={colors.textMuted} />, who: 'Someone', verb: 'wants to hit' },
  ];
  return (
    <View style={styles.block}>
      <Text style={styles.heading}>What shows up here</Text>
      <View accessible accessibilityLabel="Examples: someone liked your clip, a friend is playing at a court, someone wants to hit" style={styles.faint}>
        {rows.map((r, i) => (
          <View key={r.key} style={[styles.row, i > 0 && styles.rowLine]}>
            <View style={styles.disc}>{r.icon}</View>
            <View style={styles.body}>
              <Text style={styles.text}><Text style={styles.who}>{r.who}</Text> {r.verb}</Text>
              <Text style={styles.time}>Example</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * B: three players to follow, the Search page's rows and quiet Follow. Who may be shown is useSuggestedPlayers'
 * (never you, anyone blocked either way, or someone the teen rules keep from you), and only adults on top of that.
 */
export function PeopleToFollow() {
  const styles = useThemedStyles(styleDefinitions);
  const [followedHere, setFollowedHere] = useState<string[]>([]);
  const noteFollowed = useCallback((id: string) => setFollowedHere((cur) => (cur.includes(id) ? cur : [...cur, id])), []);
  const suggested = useSuggestedPlayers({ keep: followedHere }).filter((s) => !notKnownAdult(s.user)).slice(0, 3);
  if (!suggested.length) return <QuietLine />;
  return (
    <View style={styles.block}>
      <Text style={styles.heading}>Players to follow</Text>
      <Text style={[styles.preview, styles.headingLine]}>Their likes, replies and hits come here once you follow.</Text>
      <View style={styles.bleed}>
        {suggested.map((s, i) => (
          <PersonRow key={s.user.id} user={s.user} first={i === 0} onPress={() => router.push(`/user/${s.user.id}`)} onFollowed={noteFollowed} />
        ))}
      </View>
    </View>
  );
}

/** C: a short first-steps list, each step ticking off once it is done (worked out from what the app holds). */
export function FirstSteps({ onFindPlayers }: { onFindPlayers: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, currentUserId, followingIds, sessions, posts } = useApp();
  const steps = useMemo(() => {
    const following = followingIds.length;
    const logged = (currentUser?.stats.sessionsLogged ?? 0) > 0 || sessions.some((x) => x.userId === currentUserId);
    const posted = posts.some((p) => p.authorId === currentUserId);
    return [
      { key: 'photo', title: 'Add a photo', done: !!currentUser?.avatarUrl, go: () => router.push('/edit-profile') },
      { key: 'follow', title: 'Follow 3 players', note: following < 3 ? `${following} of 3` : undefined, done: following >= 3, go: onFindPlayers },
      { key: 'log', title: 'Log your first session', done: logged, go: () => router.push('/log-session') },
      { key: 'post', title: 'Post your first clip', done: posted, go: () => router.push('/compose') },
    ];
  }, [currentUser, currentUserId, followingIds.length, sessions, posts, onFindPlayers]);
  return (
    <View style={styles.block}>
      <Text style={styles.heading}>First steps</Text>
      {steps.map((s, i) => (
        <Pressable
          key={s.key}
          accessibilityRole="button"
          accessibilityLabel={s.title}
          accessibilityState={{ checked: s.done }}
          onPress={s.go}
          style={({ pressed }) => [styles.step, i > 0 && styles.rowLine, pressed && styles.pressed]}
        >
          <Ionicons name={s.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={s.done ? colors.brand : colors.borderStrong} />
          <Text style={[styles.stepTitle, s.done && styles.stepDone]}>{s.title}</Text>
          {s.note && !s.done ? <Text style={styles.time}>{s.note}</Text> : null}
          {s.done ? null : <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
        </Pressable>
      ))}
    </View>
  );
}

/** D: no centred bell; one small grey line under the welcome, at the top, so the page reads finished. */
export function QuietLine() {
  const styles = useThemedStyles(styleDefinitions);
  return <Text style={[styles.preview, styles.quiet]}>{EXAMPLE_LINE}</Text>;
}

const DISC = 44;

const styleDefinitions = StyleSheet.create({
  block: { marginTop: spacing.lg },
  heading: { ...typography.smallStrong, color: colors.text, paddingHorizontal: spacing.sm, paddingBottom: spacing.xs },
  headingLine: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  faint: { opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  disc: { width: DISC, height: DISC, borderRadius: DISC / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  body: { flex: 1, gap: 2 },
  text: { ...typography.small, color: colors.text, lineHeight: 19 },
  who: { ...typography.smallStrong, color: colors.text },
  preview: { ...typography.small, color: colors.textMuted },
  time: { ...typography.caption, color: colors.textFaint },
  // The Search rows carry their own side gutter; the page already has one.
  bleed: { marginHorizontal: -spacing.lg },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.sm },
  stepTitle: { ...typography.body, color: colors.text, flex: 1 },
  stepDone: { color: colors.textMuted },
  pressed: { backgroundColor: colors.surfaceAlt },
  // Lined up with the welcome's words: the row's gutter, its 44pt mark and the gap after it.
  quiet: { marginTop: spacing.xs, paddingLeft: spacing.sm + DISC + spacing.md, paddingRight: spacing.sm },
});
