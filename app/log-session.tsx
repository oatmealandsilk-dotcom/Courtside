import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import { DragSheet } from '@/components/DragSheet';
import { Field } from '@/components/ui';
import { Chips, Section, SheetTitle, Submit, Tiles, formBody } from '@/components/sheet/SheetForm';
import { activityDay, activityWhen, fromWho, privateLine, statsSourceOf } from '@/features/activity/format';
import { localDay } from '@/features/practice/stats';
import type { DetectedActivity, PracticeSession } from '@/data/types';
import { confirm } from '@/lib/confirm';
import { duration } from '@/lib/format';
import { isSupabaseConfigured } from '@/lib/supabase';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

const KINDS: { value: PracticeSession['kind']; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'match', label: 'Match' },
  { value: 'drills', label: 'Drills' },
  { value: 'fitness', label: 'Fitness' },
];
const LENGTHS = [30, 60, 90, 120];
const lengthLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}½ hr` : `${m / 60} hr`);
const lengthTile = (m: number) => ({ value: m, top: m < 60 ? 'min' : m === 60 ? 'hour' : 'hours', main: m < 60 ? String(m) : m % 60 ? `${Math.floor(m / 60)}½` : String(m / 60), label: lengthLabel(m) });

/** The usual lengths, with the nearest one swapped for the tracker's own minutes, so it sits where it belongs and is picked already. */
function lengthsFor(a: DetectedActivity) {
  const nearest = LENGTHS.reduce((best, m, i) => (Math.abs(m - a.minutes) < Math.abs(LENGTHS[best] - a.minutes) ? i : best), 0);
  const top = a.source === 'whoop' ? 'WHOOP' : statsSourceOf(a) === 'apple-watch' ? 'Watch' : 'Health';
  return LENGTHS.map((m, i) => (i === nearest ? { value: a.minutes, top, main: duration(a.minutes), label: duration(a.minutes) } : lengthTile(m)));
}

/**
 * Log a session in two taps: what it was (practice is picked already) and
 * how long, then Save. A match can say whether you won. Yesterday is one
 * more tap, for the session you forgot to log.
 *
 * Opened from a "Tennis detected" alert (?activity=), it comes filled in
 * from the tracker's session: its day, its exact length, and a private line
 * of its numbers. Save counts it toward the streak, once; "Not tennis?"
 * hides it instead (migration 58).
 */
export default function LogSession() {
  const styles = useThemedStyles(styleDefinitions);
  const { activity } = useLocalSearchParams<{ activity?: string }>();
  const { actions, detectedActivities, remoteLoaded } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);

  // The tracker session it was opened for. A copy of one already waiting
  // (the same game from the watch and from WHOOP) opens that one instead.
  const found = activity ? detectedActivities.find((x) => x.id === activity) : undefined;
  const twin = found?.status === 'duplicate' && found.duplicateOf ? detectedActivities.find((x) => x.id === found.duplicateOf && x.status === 'new') : undefined;

  // An alert opened from cold lands here before the sessions have loaded:
  // the sheet waits for them, asks once more if it is still not there, and
  // gives up after a while rather than spinning for ever.
  const [looked, setLooked] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!activity || found || !remoteLoaded || looked) return;
    void actions.refreshActivities().finally(() => setLooked(true));
  }, [activity, found, remoteLoaded, looked, actions]);
  useEffect(() => {
    if (!activity) return;
    const t = setTimeout(() => setGaveUp(true), 10_000);
    return () => clearTimeout(t);
  }, [activity]);
  const waiting = !!activity && !found && isSupabaseConfigured && !gaveUp && (!remoteLoaded || !looked);

  // Once saved or hidden, the sheet keeps showing what it was while it slides away.
  const [frozen, setFrozen] = useState<DetectedActivity | null>(null);
  const a = frozen ?? twin ?? found;
  const fresh = a?.status === 'new' ? a : undefined;
  const done = !fresh && (a?.status === 'logged' || a?.status === 'duplicate') ? a : undefined;
  const gone = !!activity && !waiting && !fresh && !done;

  const [kind, setKind] = useState<PracticeSession['kind']>('practice');
  const [minutes, setMinutes] = useState<number | null>(fresh ? fresh.minutes : null);
  // A session that arrives after the sheet opened starts on its own length too.
  const [preset, setPreset] = useState(fresh?.id);
  if (fresh && preset !== fresh.id) { setPreset(fresh.id); setMinutes(fresh.minutes); }
  const [won, setWon] = useState<'won' | 'lost' | null>(null);
  const [opponent, setOpponent] = useState('');
  const [when, setWhen] = useState<'today' | 'yesterday'>('today');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!minutes || saving) return;
    setSaving(true);
    setError('');
    const day = fresh ? activityDay(fresh) : when === 'today' ? localDay(new Date()) : localDay(Date.now() - 86_400_000);
    if (fresh) setFrozen(fresh);
    try {
      await actions.logSession({ minutes, kind, won: won === 'won' ? true : won === 'lost' ? false : undefined, opponent, day, ...(fresh ? { activityId: fresh.id } : {}) });
      showToast({ title: 'Session logged', body: 'Your streak and numbers are up to date.', icon: 'checkmark-circle-outline' });
      close();
    } catch (e) {
      setFrozen(null);
      const said = e instanceof Error ? e.message : 'That session didn’t save. Try again.';
      // Logged already (on another phone, say): the sheet catches up and says so.
      if (said === 'Already logged.') void actions.refreshActivities();
      setError(said);
      setSaving(false);
    }
  };

  const hide = (x: DetectedActivity) => confirm({
    title: 'Hide this session?',
    message: 'It won’t count toward your streak.',
    confirmLabel: 'Hide',
    destructive: true,
    onConfirm: () => { setFrozen(x); actions.dismissActivity(x.id); close(); },
  });

  const header = waiting ? (
    <SheetTitle title="Log your tennis" onClose={close} />
  ) : fresh ? (
    <SheetTitle title="Log your tennis" line={`From ${fromWho(fresh)} · ${activityWhen(fresh)}. Only you see this.`} lines={2} onClose={close} />
  ) : done ? (
    <SheetTitle title="Log your tennis" line={done.status === 'logged' ? 'Logged. It counts toward your streak and hours.' : 'You already logged this session.'} lines={2} onClose={close} />
  ) : (
    <SheetTitle title="Log a session" line="Keeps your streak, hours and win rate. Only you see it." onClose={close} />
  );
  const numbers = fresh ? privateLine(fresh) : '';

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.7} header={header}>
      {waiting ? (
        <View style={styles.wait}><CourtSpinner size={34} /></View>
      ) : done ? (
        <ScrollView contentContainerStyle={formBody}>
          <Submit label="Close" onPress={close} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled">
          {gone ? <Text style={styles.notice}>That session is no longer here.</Text> : null}
          {numbers ? <Text style={styles.numbers}>{numbers}</Text> : null}
          <Section title="What was it">
            <Chips value={kind} onChange={(k) => { if (k) setKind(k); }} options={KINDS} />
          </Section>
          <Section title="How long">
            <Tiles value={minutes ?? 0} onChange={(m) => setMinutes(m)} options={fresh ? lengthsFor(fresh) : LENGTHS.map(lengthTile)} />
            {fresh ? <Text style={styles.hint}>Change the length if you took a break.</Text> : null}
          </Section>
          {kind === 'match' ? (
            <Section title="Result">
              <Chips clearable value={won ?? undefined} onChange={(v) => setWon(v ?? null)} options={[{ value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }]} />
              <Field soft value={opponent} onChangeText={setOpponent} placeholder="Opponent (optional)" />
            </Section>
          ) : null}
          {/* A tracker's session already knows its day. */}
          {fresh ? null : (
            <Section title="When">
              <Chips value={when} onChange={(v) => { if (v) setWhen(v); }} options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }]} />
            </Section>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Submit label="Save" onPress={() => { void save(); }} disabled={!minutes} busy={saving} waiting="Pick how long" />
          {fresh ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Not tennis? Hide this session" hitSlop={8} onPress={() => hide(fresh)} style={({ pressed }) => [styles.hide, pressed && { opacity: 0.6 }]}>
              <Text style={styles.hideText}>Not tennis? Hide it</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  error: { ...typography.small, color: colors.danger },
  wait: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  notice: { ...typography.smallStrong, color: colors.text },
  numbers: { ...typography.caption, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  hint: { ...typography.small, color: colors.textFaint },
  hide: { alignSelf: 'center', paddingVertical: spacing.xs },
  hideText: { ...typography.smallStrong, color: colors.textMuted },
});
