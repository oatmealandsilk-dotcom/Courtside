import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ChallengeEntries } from '@/components/ChallengeEntries';
import { enterChallenge } from '@/components/ChallengePage';
import { EmptyState, Screen } from '@/components/ui';
import { challengeFor, entriesFor, timeLeft } from '@/features/challenge/weekly';
import { useDemotedPosts } from '@/features/feed/demoted';
import { goBack } from '@/lib/goBack';
import { useTagPosting } from '@/lib/uploads';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

/** Every entry in this week's challenge, in its standing, with a way to enter. */
export default function ChallengeScreen() {
  const styles = useThemedStyles(styleDefinitions);
  const { posts } = useApp();
  const challenge = useMemo(() => challengeFor(), []);
  // One an admin pushed to the bottom stands after all the others (never your own: the list leaves those out).
  const demoted = useDemotedPosts();
  const entries = useMemo(() => entriesFor(challenge, posts, demoted), [challenge, posts, demoted]);
  // Your clip for it is still going up: it joins the list once it lands, and
  // until then the button says so (and waits), so it is not entered twice.
  const posting = useTagPosting(challenge.tag);
  return (
    <Screen title={challenge.title} onBack={() => goBack()}>
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.eyebrow}>
            <Ionicons name="trophy-outline" size={14} color={colors.brand} />
            <Text style={styles.eyebrowText}>Weekly challenge · {timeLeft(challenge)} · {entries.length} {entries.length === 1 ? 'entry' : 'entries'}</Text>
          </View>
          <Text style={styles.lead}>{challenge.ask} Post a clip with <Text style={styles.tag}>#{challenge.tag}</Text> in the caption. The most-liked are featured on the feed.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={posting ? 'Your entry is posting' : `Enter the ${challenge.title} challenge with a clip`}
            accessibilityState={{ disabled: posting }}
            disabled={posting}
            onPress={() => enterChallenge(challenge)}
            style={({ pressed }) => [styles.primary, posting && styles.primaryBusy, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name={posting ? 'cloud-upload-outline' : 'add'} size={18} color={colors.brandInk} />
            <Text style={styles.primaryText}>{posting ? 'Your entry is posting…' : 'Enter with a clip'}</Text>
          </Pressable>
        </View>
        {entries.length ? <ChallengeEntries entries={entries} /> : <EmptyState icon="videocam-outline" title={posting ? 'Yours is on its way' : 'No entries yet'} body={posting ? 'It shows here as soon as it has posted.' : 'Yours could be the first.'} />}
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  body: { gap: spacing.xl, paddingBottom: spacing.xxl },
  head: { gap: spacing.md },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowText: { ...typography.smallStrong, color: colors.brand },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  tag: { ...font('600'), color: colors.text },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: radius.pill, backgroundColor: colors.brand },
  primaryBusy: { opacity: 0.6 },
  primaryText: { ...typography.bodyStrong, color: colors.brandInk },
});
