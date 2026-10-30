import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { DragSheet } from '@/components/DragSheet';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CapsLabel, setupLook } from '@/components/setup/SetupBits';
import { Button, Field } from '@/components/ui';
import { Chips, Fine, Section, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import type { CourtAccess, CourtDayPart, CourtReview } from '@/data/types';
import { isMapCourtId } from '@/features/places/courtName';
import { COURT_REPORT_V2 } from '@/features/places/courtReportV2';
import { notKnownAdult } from '@/features/players/age';
import { ACCESS_CHOICE } from '@/features/players/courtSummary';
import { show as showToast } from '@/lib/toast';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { trackCorner } from '@/theme/look';
import { PRESS_DIM } from '@/theme/press';
import { TextScale } from '@/theme/textScale';

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
  // COURT_REPORT_V2: Share tapped with nothing picked yet, so the sheet says what it needs.
  const [nudge, setNudge] = useState(false);
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

  if (COURT_REPORT_V2) {
    const lightsValue = lights === undefined ? undefined : lights ? 'yes' : 'no';
    return (
      <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.9}
        header={<SheetTitle title="Tell players about this court" titleSize={21} line={name} onClose={() => setCloseSignal((n) => n + 1)} />}>
        <ScrollView contentContainerStyle={[formBody, styles.v2Body]} keyboardShouldPersistTaps="handled">
          {/* The court itself: three label-left rows, each a small switch. Tap the chosen side again to take it back. */}
          <View style={styles.inset}>
            <View style={styles.row}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowLabel}>Lights</Text>
              <Switch label="Lights" value={lightsValue} onChange={(v) => touch(setLights)(v === undefined ? undefined : v === 'yes')} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
            </View>
            <View style={styles.hairline} />
            <View style={styles.row}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowLabel}>Nets</Text>
              <Switch label="Nets" value={nets} onChange={touch(setNets)} options={[{ value: 'good', label: 'Good' }, { value: 'bad', label: 'Bad' }]} />
            </View>
            <View style={styles.hairline} />
            <View style={styles.row}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowLabel}>Surface</Text>
              <Switch label="Surface" value={surface} onChange={touch(setSurface)} options={[{ value: 'good', label: 'Good' }, { value: 'cracked', label: 'Cracked' }, { value: 'wet-prone', label: 'Puddles', a11y: 'Puddles after rain' }]} />
            </View>
          </View>
          {/* When it gets busy: six real cells, any number ticked, or "Never seen it busy" on its own. */}
          <View style={styles.group}>
            <View style={styles.caps}><CapsLabel>When is it busy?</CapsLabel></View>
            <View style={[styles.inset, styles.busyCard]}>
              <View style={styles.busyRow}>
                <View style={styles.busyLabel} />
                {PARTS.map((p) => <Text key={p.key} maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.busyHead}>{p.label}</Text>)}
              </View>
              {WHEN.map((w) => (
                <View key={w.key} style={styles.busyRow}>
                  <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.busyLabel}>{w.label}</Text>
                  {PARTS.map((p) => {
                    const part = `${w.key}-${p.key}` as CourtDayPart;
                    const on = !!busy?.includes(part);
                    return (
                      <Pressable key={part} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Busy on ${w.label.toLowerCase()} in the ${p.label.toLowerCase()}`} hitSlop={2} onPress={() => flipPart(part)} style={({ pressed }) => [styles.busyCell, on && styles.busyCellOn, pressed && !on && styles.pressed]}>
                        {on ? <Ionicons name="checkmark" size={18} color={colors.brandInk} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              <View style={styles.neverRow}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: never }} accessibilityLabel="Never seen it busy" hitSlop={4} onPress={() => { haptics.tap(); flipNever(!never); }} style={({ pressed }) => [styles.chip, never && styles.chipOn, pressed && !never && styles.pressed]}>
                  <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[styles.chipText, never && styles.chipTextOn]}>Never seen it busy</Text>
                </Pressable>
              </View>
            </View>
          </View>
          {/* Who may play: asked of adults only, as before (only their answers can grey a court out). */}
          {adult ? (
            <View style={styles.group}>
              <View style={styles.caps}><CapsLabel>Who can play here?</CapsLabel></View>
              <View style={styles.accessGrid} accessibilityRole="radiogroup" accessibilityLabel="Who can play here?">
                {entries(ACCESS_CHOICE).map(([value, label]) => {
                  const on = access === value;
                  return (
                    <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: on, selected: on }} accessibilityLabel={label} hitSlop={2} onPress={() => { haptics.tap(); touch(setAccess)(on ? undefined : value); }} style={({ pressed }) => [styles.chip, styles.accessChip, on && styles.chipOn, pressed && !on && styles.pressed]}>
                      <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          <View style={[styles.inset, styles.noteCard]}>
            <Field bare multiline minHeight={52} accessibilityLabel="Rules or anything else" value={notes} onChangeText={(t) => { touched.current = true; setNotes(t.slice(0, 280)); }} placeholder="Rules or anything else (optional)" />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.footer}>
            {nudge && !anything && courtId ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.nudge}>Pick at least one</Text> : null}
            {courtId ? (
              <Button full label={mine ? 'Update' : 'Share'} dim={!anything} loading={saving} onPress={() => {
                if (!anything) { haptics.tap(); setNudge(true); return; }
                void save();
              }} />
            ) : (
              <Button full label="This place isn’t on the map yet" disabled onPress={() => {}} />
            )}
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.privacy}>{adult ? 'Your name never shows. Notes appear as written.' : 'Your name never shows. Only adults’ notes appear.'}</Text>
          </View>
        </ScrollView>
      </DragSheet>
    );
  }

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

/**
 * COURT_REPORT_V2's small switch: the Edit profile Rating's NTRP | UTR look (a hairline track, the chosen side
 * filled in green), right of a row's label. Unlike that one it can sit with nothing chosen, and tapping the chosen
 * side again takes it back, as the chips it replaces did.
 */
function Switch<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string; a11y?: string }[]; value: T | undefined; onChange: (v: T | undefined) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on, selected: on }} accessibilityLabel={o.a11y ?? o.label} hitSlop={{ top: 6, bottom: 6 }} onPress={() => { haptics.tap(); onChange(on ? undefined : o.value); }} style={({ pressed }) => [styles.seg, on && styles.segOn, pressed && !on && styles.pressed]}>
            <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
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
  // COURT_REPORT_V2: the sign-up and Edit profile redraw's inset lists, label-left rows on hairlines.
  v2Body: { gap: setupLook.sectionGap, paddingTop: spacing.lg },
  group: { gap: spacing.sm },
  caps: { paddingHorizontal: spacing.lg },
  inset: { ...setupLook.inset },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: spacing.lg, paddingVertical: 6 },
  rowLabel: { ...typography.body, color: colors.textMuted, width: 80 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg },
  track: { flex: 1, flexDirection: 'row', padding: 3, gap: 3, borderRadius: trackCorner(3), borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.bg },
  seg: { flex: 1, minHeight: 32, paddingHorizontal: 4, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.brand },
  segText: { ...typography.smallStrong, fontSize: 14, color: colors.textMuted },
  segTextOn: { color: colors.brandInk },
  pressed: { opacity: PRESS_DIM },
  // Its labels and cells start where the rows' labels and switches above them do.
  busyCard: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  busyLabel: { width: 80 - spacing.sm, ...typography.body, fontSize: 15, color: colors.textMuted },
  busyHead: { flex: 1, textAlign: 'center', ...typography.small, ...font('500'), color: colors.textMuted },
  // A real cell: the page's shade inside the card, a hairline round it; ticked, the brand's green.
  busyCell: { flex: 1, height: 42, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  busyCellOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  neverRow: { flexDirection: 'row', paddingTop: spacing.xs },
  chip: { ...setupLook.chip, minHeight: 40 },
  chipOn: { ...setupLook.chipOn },
  chipText: { ...setupLook.chipText },
  chipTextOn: { color: colors.brandInk },
  accessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  accessChip: { flexBasis: '47%', flexGrow: 1, paddingHorizontal: spacing.sm },
  noteCard: { paddingHorizontal: spacing.lg, paddingVertical: 4 },
  footer: { gap: spacing.sm, marginTop: -spacing.xs },
  nudge: { ...typography.small, ...font('500'), color: colors.textMuted, textAlign: 'center' },
  privacy: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
});
