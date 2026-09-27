import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { ChallengeEntries } from '@/components/ChallengeEntries';
import { Wash } from '@/components/Wash';
import { challengeFor, entriesFor, timeLeft, type Challenge } from '@/features/challenge/weekly';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

/** Opens the Create menu with the challenge's tag already in the caption. */
export const enterChallenge = (challenge: Challenge) => router.push({ pathname: '/compose', params: { challenge: challenge.tag } });

/**
 * This week's challenge, as a page of the Home feed: the prompt, the top
 * three entries so far, and a way in. Its top clips follow it in the feed.
 */
export function ChallengePage({ challenge }: { challenge: Challenge }) {
  const styles = useThemedStyles(styleDefinitions);
  const { posts, users } = useApp();
  const entries = useMemo(() => entriesFor(challenge, posts), [challenge, posts]);
  const last = useMemo(() => {
    const previous = challengeFor(challenge.startsAt, -1);
    const winner = entriesFor(previous, posts)[0];
    const who = winner ? users.find((u) => u.id === winner.authorId) : undefined;
    return who ? { title: previous.title, handle: who.handle } : null;
  }, [challenge, posts, users]);
  return (
    <View style={styles.page}>
      <Wash height={460} />
      <View style={styles.center}>
        <View style={styles.column}>
          <View style={styles.head}>
            <View style={styles.eyebrow}>
              <Ionicons name="trophy-outline" size={14} color={colors.brand} />
              <Text style={styles.eyebrowText}>Weekly challenge · {timeLeft(challenge)}</Text>
            </View>
            <Text style={styles.title}>{challenge.title}</Text>
            <Text style={styles.lead}>{challenge.ask} Post a clip with <Text style={styles.tag}>#{challenge.tag}</Text> in the caption. The most-liked are featured here.</Text>
          </View>
          {entries.length ? (
            <ChallengeEntries entries={entries.slice(0, 3)} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="videocam-outline" size={20} color={colors.textFaint} />
              <Text style={styles.emptyText}>No entries yet. Yours could be the first.</Text>
            </View>
          )}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Enter the ${challenge.title} challenge with a clip`} onPress={() => enterChallenge(challenge)} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
              <Ionicons name="add" size={18} color={colors.brandInk} />
              <Text style={styles.primaryText}>Enter with a clip</Text>
            </Pressable>
            {entries.length ? (
              <Pressable accessibilityRole="link" accessibilityLabel={`See all ${entries.length} entries`} onPress={() => router.push('/challenge')} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}>
                <Text style={styles.secondaryText}>{entries.length > 3 ? `All ${entries.length}` : 'See all'}</Text>
              </Pressable>
            ) : null}
          </View>
          {last ? <Text style={styles.last}>Last week, {last.title.toLowerCase()}: won by @{last.handle}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { flex: 1, alignSelf: 'stretch', backgroundColor: colors.bg, overflow: 'hidden' },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  column: { alignSelf: 'center', width: '100%', maxWidth: 460, gap: spacing.lg },
  head: { gap: spacing.sm },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowText: { ...typography.smallStrong, color: colors.brand },
  title: { ...typography.display, color: colors.text },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  tag: { ...font('600'), color: colors.text },
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  emptyText: { ...typography.small, color: colors.textMuted, flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  primary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: radius.pill, backgroundColor: colors.brand },
  primaryText: { ...typography.bodyStrong, color: colors.brandInk },
  secondary: { height: 48, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.bodyStrong, color: colors.text },
  last: { ...typography.caption, color: colors.textFaint, textAlign: 'center', letterSpacing: 0 },
});
