import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ChallengeEntries } from '@/components/ChallengeEntries';
import { enterChallenge } from '@/components/ChallengePage';
import { EmptyState, Screen } from '@/components/ui';
import { challengeFor, entriesFor, timeLeft } from '@/features/challenge/weekly';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

/** Every entry in this week's challenge, in its standing, with a way to enter. */
export default function ChallengeScreen() {
  const styles = useThemedStyles(styleDefinitions);
  const { posts } = useApp();
  const challenge = useMemo(() => challengeFor(), []);
  const entries = useMemo(() => entriesFor(challenge, posts), [challenge, posts]);
  return (
    <Screen title={challenge.title} onBack={() => goBack('/')}>
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.eyebrow}>
            <Ionicons name="trophy-outline" size={14} color={colors.brand} />
            <Text style={styles.eyebrowText}>Weekly challenge · {timeLeft(challenge)} · {entries.length} {entries.length === 1 ? 'entry' : 'entries'}</Text>
          </View>
          <Text style={styles.lead}>{challenge.ask} Post a clip with <Text style={styles.tag}>#{challenge.tag}</Text> in the caption. The most-liked are featured on Home.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Enter the ${challenge.title} challenge with a clip`} onPress={() => enterChallenge(challenge)} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
            <Ionicons name="add" size={18} color={colors.brandInk} />
            <Text style={styles.primaryText}>Enter with a clip</Text>
          </Pressable>
        </View>
        {entries.length ? <ChallengeEntries entries={entries} /> : <EmptyState icon="videocam-outline" title="No entries yet" body="Yours could be the first." />}
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
  primaryText: { ...typography.bodyStrong, color: colors.brandInk },
});
