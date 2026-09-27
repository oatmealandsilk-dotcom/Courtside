import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { Field, SegmentedControl } from '@/components/ui';
import { localDay } from '@/features/practice/stats';
import type { PracticeSession } from '@/data/types';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

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
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.62} header={
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Log a session</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setCloseSignal((n) => n + 1)}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
    }>
      <View style={styles.body}>
        <View style={styles.chips}>
          {KINDS.map((k) => (
            <Pressable key={k.value} accessibilityRole="radio" accessibilityState={{ selected: kind === k.value }} onPress={() => setKind(k.value)} style={[styles.chip, kind === k.value && styles.chipOn]}>
              <Text style={[styles.chipText, kind === k.value && styles.chipTextOn]}>{k.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>How long</Text>
        <View style={styles.lengths}>
          {LENGTHS.map((m) => (
            <Pressable key={m} accessibilityRole="radio" accessibilityState={{ selected: minutes === m }} onPress={() => setMinutes(m)} style={[styles.length, minutes === m && styles.chipOn]}>
              <Text style={[styles.lengthText, minutes === m && styles.chipTextOn]}>{lengthLabel(m)}</Text>
            </Pressable>
          ))}
        </View>
        {kind === 'match' ? (
          <View style={{ gap: spacing.md }}>
            <SegmentedControl value={won ?? ''} onChange={(v) => setWon(v as 'won' | 'lost')} segments={[{ value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }]} />
            <Field label="Against (optional)" value={opponent} onChangeText={setOpponent} placeholder="Who you played" />
          </View>
        ) : null}
        <SegmentedControl value={when} onChange={(v) => setWhen(v as 'today' | 'yesterday')} segments={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }]} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !minutes || saving }} disabled={!minutes || saving} onPress={save} style={[styles.save, (!minutes || saving) && { opacity: 0.45 }]}>
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
        <Text style={styles.fine}>Only you see your log. It keeps your streak, hours and win rate.</Text>
      </View>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  heading: { ...typography.title, color: colors.text },
  body: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  label: { ...typography.smallStrong, color: colors.textMuted, marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 16, height: 38, borderRadius: radius.pill, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.brand },
  chipText: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.brandInk },
  lengths: { flexDirection: 'row', gap: spacing.sm },
  length: { flex: 1, height: 48, borderRadius: 14, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  lengthText: { ...typography.body, ...font('600'), color: colors.text, fontVariant: ['tabular-nums'] },
  save: { height: 50, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  saveText: { ...typography.bodyStrong, color: colors.brandInk },
  error: { ...typography.small, color: colors.danger },
  fine: { ...typography.caption, letterSpacing: 0, color: colors.textFaint, textAlign: 'center' },
});
