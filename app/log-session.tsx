import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';

import { DragSheet } from '@/components/DragSheet';
import { Field } from '@/components/ui';
import { Chips, Section, SheetTitle, Submit, Tiles, formBody } from '@/components/sheet/SheetForm';
import { localDay } from '@/features/practice/stats';
import type { PracticeSession } from '@/data/types';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, typography } from '@/theme';

const KINDS: { value: PracticeSession['kind']; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'match', label: 'Match' },
  { value: 'drills', label: 'Drills' },
  { value: 'fitness', label: 'Fitness' },
];
const LENGTHS = [30, 60, 90, 120];
const lengthLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}½ hr` : `${m / 60} hr`);

/**
 * Log a session in two taps: what it was (practice is picked already) and
 * how long, then Save. A match can say whether you won. Yesterday is one
 * more tap, for the session you forgot to log.
 */
export default function LogSession() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const [kind, setKind] = useState<PracticeSession['kind']>('practice');
  const [minutes, setMinutes] = useState<number | null>(null);
  const [won, setWon] = useState<'won' | 'lost' | null>(null);
  const [opponent, setOpponent] = useState('');
  const [when, setWhen] = useState<'today' | 'yesterday'>('today');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!minutes || saving) return;
    setSaving(true);
    setError('');
    const day = when === 'today' ? localDay(new Date()) : localDay(Date.now() - 86_400_000);
    try {
      await actions.logSession({ minutes, kind, won: won === 'won' ? true : won === 'lost' ? false : undefined, opponent, day });
      showToast({ title: 'Session logged', body: 'Your streak and numbers are up to date.', icon: 'checkmark-circle-outline' });
      setCloseSignal((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That session didn’t save. Try again.');
      setSaving(false);
    }
  };

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.7}
      header={<SheetTitle title="Log a session" line="Keeps your streak, hours and win rate. Only you see it." onClose={() => setCloseSignal((n) => n + 1)} />}>
      <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled">
        <Section title="What was it">
          <Chips value={kind} onChange={(k) => { if (k) setKind(k); }} options={KINDS} />
        </Section>
        <Section title="How long">
          <Tiles value={minutes ?? 0} onChange={(m) => setMinutes(m)} options={LENGTHS.map((m) => ({ value: m, top: m < 60 ? 'min' : m === 60 ? 'hour' : 'hours', main: m < 60 ? String(m) : m % 60 ? `${Math.floor(m / 60)}½` : String(m / 60), label: lengthLabel(m) }))} />
        </Section>
        {kind === 'match' ? (
          <Section title="Result">
            <Chips clearable value={won ?? undefined} onChange={(v) => setWon(v ?? null)} options={[{ value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }]} />
            <Field soft value={opponent} onChangeText={setOpponent} placeholder="Who you played (optional)" />
          </Section>
        ) : null}
        <Section title="When">
          <Chips value={when} onChange={(v) => { if (v) setWhen(v); }} options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }]} />
        </Section>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Submit label="Save" onPress={() => { void save(); }} disabled={!minutes} busy={saving} waiting="Pick how long" />
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  error: { ...typography.small, color: colors.danger },
});
