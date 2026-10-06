import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { Button, EmptyState, Screen } from '@/components/ui';
import { fetchCoachMemory, clearCoachMemory, type CoachMemory } from '@/data/api';
import { useAiCoachOn } from '@/features/aiCoach/switch';
import { useAiCoachConsent } from '@/features/aiCoach/consent';
import { CourtSpinner } from '@/components/CourtSpinner';
import { relativeTime } from '@/lib/format';
import { confirm } from '@/lib/confirm';
import { colors, radius, spacing, typography, lift } from '@/theme';

/** Nothing is kept until the coach is switched on, so the screen says so. */
export default function CoachMemoryRoute() {
  const on = useAiCoachOn();
  if (on === undefined) {
    return <Screen title="Coach memory" compactTitle onBack={() => goBack()}><View style={{ paddingVertical: 60, alignItems: 'center' }}><CourtSpinner size={28} /></View></Screen>;
  }
  if (!on) {
    return (
      <Screen title="Coach memory" compactTitle onBack={() => goBack()}>
        <EmptyState icon="sparkles-outline" title="AI coach is coming soon" body="Once it is on, whatever it keeps about you shows here, with a button to wipe it." />
      </Screen>
    );
  }
  return <CoachMemoryScreen />;
}

/** What the AI coach has kept about you, in full, with the one button that wipes it. */
function CoachMemoryScreen() {
  const styles = useThemedStyles(styleDefinitions);
  const [memory, setMemory] = useState<CoachMemory | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(false);
  const consent = useAiCoachConsent();
  const [stopping, setStopping] = useState(false);

  // Takes back the yes given before first use: nothing more goes to Anthropic until it is given again.
  const stop = () => {
    confirm({ title: 'Stop using the AI coach?', message: 'Nothing more is sent to Anthropic. The coach asks again before you next use it.', confirmLabel: 'Stop', destructive: true, onConfirm: async () => {
      setStopping(true);
      setError('');
      const ok = await consent.withdraw().catch(() => false);
      setStopping(false);
      if (!ok) setError('That did not go through. Check your connection and try again.');
    } });
  };

  useEffect(() => {
    fetchCoachMemory().then(setMemory).catch(() => { setMemory(null); setFailed(true); });
  }, []);

  const clear = () => {
    confirm({ title: 'Clear coach memory?', message: 'Its notes and your recent chats are deleted, so it starts fresh.', confirmLabel: 'Clear', destructive: true, onConfirm: async () => {
      setBusy(true);
      setError('');
      try {
        await clearCoachMemory();
        setMemory({ summary: '', exchanges: [], updatedAt: null, remaining: memory?.remaining ?? 20 });
      } catch {
        setError('That did not clear. Check your connection and try again.');
      } finally {
        setBusy(false);
      }
    } });
  };

  const empty = !memory || (!memory.summary && memory.exchanges.length === 0);

  return (
    <Screen title="Coach memory" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>
        The coach keeps short notes so it does not start from zero each time: what you are working on, what it told you, and whether you said it helped. Only you can see this here; the coach is powered by Anthropic, which receives what it needs to answer you.
      </Text>
      {memory === undefined ? <View style={{ paddingVertical: 48, alignItems: 'center' }}><CourtSpinner size={28} /></View> : failed ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn’t load the notes" body="Check your connection and open this again." />
      ) : empty ? (
        <EmptyState icon="sparkles-outline" title="Nothing remembered yet" body="Ask the coach something and its notes start here." />
      ) : (
        <>
          {memory.summary ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Notes</Text>
              <Text style={styles.summary}>{memory.summary}</Text>
              {memory.updatedAt ? <Text style={styles.meta}>Updated {relativeTime(memory.updatedAt)}</Text> : null}
            </View>
          ) : null}
          <Text style={styles.cardTitle}>Recent conversation</Text>
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
      {/* Said whatever is above: a Stop that did not go through, with nothing remembered yet, said nothing before. */}
      {error ? <Text style={[styles.error, { paddingTop: spacing.md }]}>{error}</Text> : null}
      {consent.agreed ? (
        <View style={{ paddingTop: spacing.lg }}>
          <Button label="Stop using the AI coach" variant="secondary" loading={stopping} onPress={stop} full />
        </View>
      ) : null}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  card: { ...lift, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface, gap: spacing.sm, marginBottom: spacing.lg },
  cardTitle: { ...typography.smallStrong, color: colors.textMuted, paddingBottom: spacing.xs },
  error: { ...typography.small, color: colors.danger, textAlign: 'center', paddingBottom: spacing.sm },
  summary: { ...typography.body, color: colors.text, lineHeight: 22 },
  meta: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  thread: { gap: spacing.sm, paddingBottom: spacing.xl },
  bubble: { maxWidth: '85%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.brand },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt },
  bubbleText: { ...typography.small, color: colors.text, lineHeight: 19 },
});
