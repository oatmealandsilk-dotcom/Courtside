import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AchievementGrid } from '@/components/AchievementGrid';
import { DragSheet } from '@/components/DragSheet';
import { Chips, Fine, Section, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import { Field } from '@/components/ui';
import type { Constraint, PlayerGoal } from '@/data/types';
import { shortDate } from '@/features/players/tennisProfile';
import { evaluateAchievements } from '@/lib/badges';
import { goBack } from '@/lib/goBack';
import { showUndo } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';

type Kind = 'limit' | 'goal' | 'achievements';
type IconName = keyof typeof Ionicons.glyphMap;

/** When a goal is for, as a few taps rather than a calendar: none, a month, three, six, or the year's end. */
type When = 'none' | 'keep' | '1m' | '3m' | '6m' | 'year';
function dateFor(when: When, kept?: string): string | undefined {
  if (when === 'none') return undefined;
  if (when === 'keep') return kept;
  const d = new Date();
  if (when === 'year') return new Date(d.getFullYear(), 11, 31, 12).toISOString();
  d.setMonth(d.getMonth() + (when === '1m' ? 1 : when === '3m' ? 3 : 6));
  return d.toISOString();
}

/**
 * The Tennis profile's small sheets (Oct 5), over the page:
 *
 * - `kind=limit`: an injury or a time limit coaches plan around. With `id`,
 *   what to do with it (Edit, Mark as better, Remove); without, Add. Only
 *   ever yours: the database keeps these off the public profile.
 * - `kind=goal`: a goal, the same way (Mark done, Edit, Remove; or Add), with
 *   an optional "by when".
 * - `kind=achievements`: every achievement, with how far along the locked ones are.
 *
 * Everything saves through updateProfile, as the setup steps do.
 *
 * Opened before your account has come down (a browser refresh, a link
 * straight to it), it waits for it: the form below fills from the item once,
 * when it first draws, so it must first have the item to fill from.
 */
export default function TennisSheet() {
  const params = useLocalSearchParams<{ kind?: string; id?: string }>();
  const kind: Kind = params.kind === 'goal' || params.kind === 'achievements' ? params.kind : 'limit';
  const { currentUser } = useApp();
  if (!currentUser) return null;
  return <Sheet key={`${kind}:${params.id ?? 'new'}`} kind={kind} id={params.id} />;
}

function Sheet({ kind, id }: { kind: Kind; id?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, actions } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);
  const profile = currentUser?.profile;
  const limit = kind === 'limit' && id ? profile?.constraints.find((c) => c.id === id) : undefined;
  const goal = kind === 'goal' && id ? profile?.goals.find((g) => g.id === id) : undefined;
  const existing = limit ?? goal;
  // An item opens on what to do with it; Edit (or a new one) opens the form.
  const [editing, setEditing] = useState(!existing);

  // The form's fields, filled from the item being edited.
  const [label, setLabel] = useState(limit?.label ?? goal?.label ?? '');
  const [note, setNote] = useState(limit?.note ?? '');
  const [limitKind, setLimitKind] = useState<Constraint['kind']>(limit?.kind ?? 'injury');
  const [when, setWhen] = useState<When>(goal?.targetDate ? 'keep' : 'none');

  const onDismissed = () => goBack('/profile-details');

  let title = '';
  let line: string | undefined;
  let body: React.ReactNode = null;

  if (kind === 'achievements') {
    const all = currentUser ? evaluateAchievements(currentUser) : [];
    title = 'Achievements';
    line = `${all.filter((a) => a.unlocked).length} of ${all.length} unlocked`;
    body = <View style={styles.grid}><AchievementGrid items={all} /></View>;
  } else if (!editing && existing) {
    // What to do with one you have.
    const isLimit = kind === 'limit';
    const remove = () => {
      if (!profile) return;
      if (isLimit) {
        const before = profile.constraints;
        actions.updateProfile({ constraints: before.filter((c) => c.id !== existing.id) });
        showUndo(`Removed ${existing.label}`, () => actions.updateProfile({ constraints: before }), { icon: 'trash-outline' });
      } else {
        const before = profile.goals;
        actions.updateProfile({ goals: before.filter((g) => g.id !== existing.id) });
        showUndo('Goal removed', () => actions.updateProfile({ goals: before }), { icon: 'trash-outline' });
      }
      close();
    };
    const options: { icon: IconName; label: string; danger?: boolean; onPress: () => void }[] = isLimit
      ? [
          { icon: 'pencil-outline', label: 'Edit', onPress: () => setEditing(true) },
          {
            icon: 'checkmark-circle-outline',
            label: limit?.kind === 'injury' ? 'Mark as better' : 'No longer applies',
            onPress: () => {
              if (!profile) return;
              const before = profile.constraints;
              actions.updateProfile({ constraints: before.map((c) => (c.id === existing.id ? { ...c, active: false } : c)) });
              showUndo(limit?.kind === 'injury' ? 'Glad it’s better' : 'Taken off your limits', () => actions.updateProfile({ constraints: before }), { icon: 'checkmark-circle-outline' });
              close();
            },
          },
          { icon: 'trash-outline', label: 'Remove', danger: true, onPress: remove },
        ]
      : [
          {
            icon: goal?.done ? 'ellipse-outline' : 'checkmark-circle-outline',
            label: goal?.done ? 'Mark as not done' : 'Mark done',
            onPress: () => {
              if (!profile) return;
              actions.updateProfile({ goals: profile.goals.map((g) => (g.id === existing.id ? { ...g, done: !g.done } : g)) });
              close();
            },
          },
          { icon: 'pencil-outline', label: 'Edit', onPress: () => setEditing(true) },
          { icon: 'trash-outline', label: 'Remove', danger: true, onPress: remove },
        ];
    title = existing.label;
    line = limit ? limit.note || (limit.kind === 'injury' ? 'Injury' : 'Time limit') : goal?.targetDate ? `By ${shortDate(goal.targetDate)}` : goal?.done ? 'Done' : 'In progress';
    body = (
      <View style={styles.options}>
        {options.map((o, i) => (
          <Pressable key={o.label} accessibilityRole="button" onPress={o.onPress} style={({ pressed }) => [styles.option, i > 0 && styles.optionLine, pressed && styles.pressed]}>
            <Ionicons name={o.icon} size={21} color={o.danger ? colors.danger : colors.text} />
            <Text style={[styles.optionText, o.danger && { color: colors.danger }]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    );
  } else if (kind === 'limit') {
    const ready = label.trim().length >= 2;
    const save = () => {
      if (!profile || !ready) return;
      const item: Constraint = { id: limit?.id ?? `c-${Date.now().toString(36)}`, kind: limitKind, label: label.trim().slice(0, 80), note: note.trim().slice(0, 280) || undefined, active: true };
      actions.updateProfile({ constraints: limit ? profile.constraints.map((c) => (c.id === limit.id ? item : c)) : [...profile.constraints, item] });
      close();
    };
    title = limit ? (limitKind === 'injury' ? 'Edit injury' : 'Edit limit') : 'Add to your limits';
    line = 'Coaches plan around it. Only you see it.';
    body = (
      <>
        <Section title="What kind">
          <Chips options={[{ value: 'injury', label: 'Injury' }, { value: 'schedule', label: 'Time limit' }, ...(limitKind === 'equipment' || limitKind === 'other' ? [{ value: limitKind, label: limitKind === 'equipment' ? 'Equipment' : 'Other' }] : [])]} value={limitKind} onChange={(v) => { if (v) setLimitKind(v as Constraint['kind']); }} />
        </Section>
        <Section title={limitKind === 'injury' ? 'Where' : 'What'}>
          <Field soft value={label} onChangeText={setLabel} placeholder={limitKind === 'injury' ? 'Like a right shoulder' : 'Like courts only before 8am'} accessibilityLabel={limitKind === 'injury' ? 'Where the injury is' : 'The limit'} autoCapitalize="sentences" />
        </Section>
        <Section title="A note for your coach" hint="Optional">
          <Field soft value={note} onChangeText={setNote} placeholder={limitKind === 'injury' ? 'What to go easy on, and when' : 'Anything that helps plan the week'} accessibilityLabel="A note for your coach" multiline minHeight={88} />
        </Section>
        <Submit label={limit ? 'Save' : 'Add'} onPress={save} disabled={!ready} waiting={limitKind === 'injury' ? 'Say where first' : 'Say what it is first'} />
        <Fine>Training notes only, never medical advice.</Fine>
      </>
    );
  } else {
    const ready = label.trim().length >= 2;
    const save = () => {
      if (!profile || !ready) return;
      const item: PlayerGoal = { id: goal?.id ?? `g-${Date.now().toString(36)}`, label: label.trim().slice(0, 120), done: goal?.done ?? false, targetDate: dateFor(when, goal?.targetDate) };
      actions.updateProfile({ goals: goal ? profile.goals.map((g) => (g.id === goal.id ? item : g)) : [...profile.goals, item] });
      close();
    };
    const yearEnd = new Date(new Date().getFullYear(), 11, 31, 12).toISOString();
    title = goal ? 'Edit goal' : 'Add a goal';
    line = 'Coaches plan toward it.';
    body = (
      <>
        <Section title="Your goal">
          <Field soft value={label} onChangeText={setLabel} placeholder="What are you working toward?" accessibilityLabel="Your goal" autoCapitalize="sentences" />
        </Section>
        <Section title="By when" hint="Optional">
          <Chips
            options={[
              ...(goal?.targetDate ? [{ value: 'keep' as When, label: shortDate(goal.targetDate) }] : []),
              { value: 'none' as When, label: 'No date' },
              { value: '1m' as When, label: 'In a month' },
              { value: '3m' as When, label: 'In 3 months' },
              { value: '6m' as When, label: 'In 6 months' },
              { value: 'year' as When, label: `By ${shortDate(yearEnd)}` },
            ]}
            value={when}
            onChange={(v) => setWhen(v ?? 'none')}
          />
        </Section>
        <Submit label={goal ? 'Save' : 'Add goal'} onPress={save} disabled={!ready} waiting="Write your goal first" />
      </>
    );
  }

  return (
    <DragSheet fitContent peekFraction={kind === 'achievements' ? 0.85 : 0.7} closeSignal={closeSignal} onDismissed={onDismissed}
      header={<SheetTitle title={title} line={line} lines={2} onClose={close} />}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={!editing && existing && kind !== 'achievements' ? styles.menuBody : formBody} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
          {body}
        </ScrollView>
      </KeyboardAvoidingView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  grid: { paddingTop: spacing.xs },
  menuBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  options: { borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, minHeight: 54 },
  optionLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  optionText: { ...typography.body, ...font('500'), color: colors.text },
  pressed: { opacity: 0.6 },
});
