import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { Button, EmptyState, Screen } from '@/components/ui';
import { fetchCoachMemory, clearCoachMemory, type CoachMemory } from '@/data/api';
import { relativeTime } from '@/lib/format';
import { colors, radius, spacing, typography } from '@/theme';

/** What the AI coach has kept about you, in full, with the one button that wipes it. */
export default function CoachMemoryScreen() {
  const styles = useThemedStyles(styleDefinitions);
  const [memory, setMemory] = useState<CoachMemory | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchCoachMemory().then(setMemory).catch(() => setMemory(null));
  }, []);

  const clear = async () => {
    setBusy(true);
    try {
      await clearCoachMemory();
      setMemory({ summary: '', exchanges: [], updatedAt: null, remaining: memory?.remaining ?? 20 });
    } finally {
      setBusy(false);
    }
  };

  const empty = !memory || (!memory.summary && memory.exchanges.length === 0);

  return (
    <Screen title="Coach memory" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>
        The coach keeps short notes so it does not start from zero each time: what you are working on, what it told you, and whether you said it helped. Only you and the coach can see this.
      </Text>
      {memory === undefined ? null : empty ? (
        <EmptyState icon="sparkles-outline" title="Nothing remembered yet" body="Ask the coach something and its notes start here." />
      ) : (
        <>
          {memory.summary ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>NOTES</Text>
              <Text style={styles.summary}>{memory.summary}</Text>
              {memory.updatedAt ? <Text style={styles.meta}>Updated {relativeTime(memory.updatedAt)} ago</Text> : null}
            </View>
          ) : null}
          <Text style={styles.cardTitle}>RECENT EXCHANGES</Text>
          <View style={styles.thread}>
            {memory.exchanges.slice(-10).map((e: CoachMemory['exchanges'][number], i: number) => (
              <View key={i} style={[styles.bubble, e.role === 'user' ? styles.mine : styles.theirs]}>
                <Text style={[styles.bubbleText, e.role === 'user' && { color: colors.brandInk }]}>{e.body}</Text>
              </View>
            ))}
          </View>
          <Button label="Clear everything the coach remembers" variant="danger" loading={busy} onPress={clear} full />
        </>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  card: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.sm, marginBottom: spacing.lg },
  cardTitle: { ...typography.caption, color: colors.textFaint, letterSpacing: 1, paddingBottom: spacing.xs },
  summary: { ...typography.body, color: colors.text, lineHeight: 22 },
  meta: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  thread: { gap: spacing.sm, paddingBottom: spacing.xl },
  bubble: { maxWidth: '85%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.brand },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt },
  bubbleText: { ...typography.small, color: colors.text, lineHeight: 19 },
});
