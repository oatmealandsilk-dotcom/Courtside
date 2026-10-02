import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { DragSheet } from '@/components/DragSheet';
import { Field } from '@/components/ui';
import { Chips, Fine, Section, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import type { CourtAccess, CourtDayPart, CourtReview } from '@/data/types';
import { isMapCourtId } from '@/features/places/courtName';
import { notKnownAdult } from '@/features/players/age';
import { ACCESS_CHOICE } from '@/features/players/courtSummary';
import { show as showToast } from '@/lib/toast';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

const entries = <K extends string>(labels: Record<K, string>) => Object.entries(labels) as [K, string][];
const WHEN: { key: 'weekday' | 'weekend'; label: string }[] = [{ key: 'weekday', label: 'Weekdays' }, { key: 'weekend', label: 'Weekends' }];
const PARTS: { key: 'morning' | 'afternoon' | 'evening'; label: string }[] = [{ key: 'morning', label: 'Morning' }, { key: 'afternoon', label: 'Afternoon' }, { key: 'evening', label: 'Evening' }];

/**
 * "Add what you know" about a court, in a few taps: lights, nets, the
 * surface, when it gets busy, who may play there, and its rules. Tap a
 * chosen answer again to take it back. Saving again replaces your earlier
 * answers. Everyone sees what most players say, never who said it; notes
 * show as written, without a name, and only from adults. Who may play is
 * asked of adults only: only their answers can grey a court out (the
 * server's rule), so a teen is not asked something that would not count.
 * Opened after a hit (?hit=…), the answers are linked to it (the server
 * keeps the link only for a hit you were in).
 */
export default function CourtReport() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ id?: string; name?: string; hit?: string }>();
  const { actions, myCourtReviews, hitRequests, currentUser } = useApp();
  const courtId = isMapCourtId(params.id) ? params.id : null;
  // The court's name: the one it was opened with, else the hit's place.
  const name = params.name?.trim() || hitRequests.find((h) => h.id === params.hit)?.place.name || 'This court';
  const had = courtId ? myCourtReviews[courtId] : undefined;
  const [closeSignal, setCloseSignal] = useState(0);
  const [lights, setLights] = useState<boolean | undefined>(had?.lights);
  const [nets, setNets] = useState<CourtReview['nets']>(had?.nets);
  const [surface, setSurface] = useState<CourtReview['surface']>(had?.surface);
  // The busy parts picked (undefined: none), and "Never seen it busy" on its
  // own, so unticking the last part never turns into "never busy".
  const [busy, setBusy] = useState<CourtDayPart[] | undefined>(had?.busy?.length ? had.busy : undefined);
  const [never, setNever] = useState(!!had?.busy && had.busy.length === 0);
  const [access, setAccess] = useState<Exclude<CourtAccess, 'unknown'> | undefined>(had?.access);
  const [notes, setNotes] = useState(had?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Your earlier answers fill the sheet in once they arrive, unless you have already started.
  const touched = useRef(false);
  const touch = <T,>(set: (v: T) => void) => (v: T) => { touched.current = true; set(v); };
  const me = currentUser?.id;
  useEffect(() => {
    if (!courtId || !me) return;
    let on = true;
    void actions.loadMyCourtReview(courtId).then((mine) => {
      if (!on || !mine || touched.current) return;
      setLights(mine.lights); setNets(mine.nets); setSurface(mine.surface); setBusy(mine.busy?.length ? mine.busy : undefined); setNever(!!mine.busy && mine.busy.length === 0); setAccess(mine.access); setNotes(mine.notes ?? '');
    });
    return () => { on = false; };
  }, [courtId, me, actions]);
  const mine = !!had;
  const adult = !!currentUser && !notKnownAdult(currentUser);
  const anything = lights !== undefined || !!nets || !!surface || !!busy || never || (adult && !!access) || !!notes.trim();

  const flipPart = (part: CourtDayPart) => {
    haptics.tap();
    touched.current = true;
    setNever(false);
    setBusy((was) => { const list = was ?? []; const next = list.includes(part) ? list.filter((p) => p !== part) : [...list, part]; return next.length ? next : undefined; });
  };
  const flipNever = (on: boolean) => {
    touched.current = true;
    setNever(on);
    if (on) setBusy(undefined);
  };

  const save = async () => {
    if (!courtId || !anything || saving) return;
    setSaving(true);
    setError('');
    try {
      await actions.saveCourtReview({ courtId, lights, nets, surface, busy: never ? [] : busy, access: adult ? access : undefined, notes: notes.trim() || undefined, fromHit: params.hit || undefined });
      showToast({ title: 'Thanks', body: 'Players looking at this court will see it, without your name.', icon: 'checkmark-circle-outline' });
      setCloseSignal((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.');
      setSaving(false);
    }
  };

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.9}
      header={<SheetTitle title={mine ? 'Update what you know' : 'What do you know?'} line={name} onClose={() => setCloseSignal((n) => n + 1)} />}>
      <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled">
        {/* Lights and nets, side by side: two small things, one line. */}
        <View style={styles.pair}>
          <View style={styles.half}>
            <Section title="Lights">
              <Chips clearable value={lights === undefined ? undefined : lights ? 'yes' : 'no'} onChange={(v) => touch(setLights)(v === undefined ? undefined : v === 'yes')} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
            </Section>
          </View>
          <View style={styles.half}>
            <Section title="Nets">
              <Chips clearable value={nets} onChange={touch(setNets)} options={[{ value: 'good', label: 'Good' }, { value: 'bad', label: 'Bad' }]} />
            </Section>
          </View>
        </View>
        <Section title="Surface">
          <Chips clearable value={surface} onChange={touch(setSurface)} options={[{ value: 'good', label: 'Good' }, { value: 'cracked', label: 'Cracked' }, { value: 'wet-prone', label: 'Puddles after rain' }]} />
        </Section>
        <Section title="When is it busy?" hint="Pick any that apply">
          <View style={styles.grid} accessibilityRole="none">
            <View style={styles.gridRow}>
              <View style={styles.gridLabel} />
              {PARTS.map((p) => <Text key={p.key} style={styles.gridHead}>{p.label}</Text>)}
            </View>
            {WHEN.map((w) => (
              <View key={w.key} style={styles.gridRow}>
                <Text style={styles.gridLabel}>{w.label}</Text>
                {PARTS.map((p) => {
                  const part = `${w.key}-${p.key}` as CourtDayPart;
                  const on = !!busy?.includes(part);
                  return (
                    <Pressable key={part} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Busy on ${w.label.toLowerCase()} in the ${p.label.toLowerCase()}`} onPress={() => flipPart(part)} style={({ pressed }) => [styles.cell, on && styles.cellOn, pressed && !on && { opacity: 0.8 }]}>
                      {on ? <View style={styles.cellDot} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          <Chips clearable value={never ? 'never' : undefined} onChange={(v) => flipNever(!!v)} options={[{ value: 'never', label: 'Never seen it busy' }]} />
        </Section>
        {adult ? (
          <Section title="Who can play here?">
            <Chips clearable value={access} onChange={touch(setAccess)} options={entries(ACCESS_CHOICE).map(([value, label]) => ({ value, label }))} />
          </Section>
        ) : null}
        <Field soft value={notes} onChangeText={(t) => { touched.current = true; setNotes(t.slice(0, 280)); }} placeholder="Rules or anything else (optional)" multiline minHeight={56} />
        {adult ? <Text style={styles.noteHint}>Shown to everyone as you wrote it, without your name.</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Submit label="Save" onPress={() => { void save(); }} disabled={!anything || !courtId} busy={saving} waiting={courtId ? 'Pick anything above' : 'This place isn’t on the map yet'} />
        <Fine>{adult
          ? 'Your taps are added up with other players’. Your note may show as you wrote it. Your name never shows.'
          : 'Your taps are added up with other players’. Notes show only from adults. Your name never shows.'}</Fine>
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  pair: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  half: { flex: 1 },
  grid: { gap: 6 },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gridLabel: { width: 78, ...typography.small, color: colors.textMuted },
  gridHead: { flex: 1, textAlign: 'center', ...typography.caption, letterSpacing: 0, color: colors.textFaint },
  // The busy grid's cells: the sheet's lifted tiles, filled with ink once picked, the way its chips are.
  cell: { ...lift, flex: 1, height: 38, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  cellOn: { backgroundColor: colors.text },
  cellDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.bg },
  error: { ...typography.small, color: colors.danger, ...font('500') },
  noteHint: { ...typography.small, color: colors.textMuted, marginTop: -spacing.sm },
});
