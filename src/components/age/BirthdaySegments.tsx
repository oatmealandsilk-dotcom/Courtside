import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';
import { TextBox } from '@/components/ui/TextBox';

import { useRevealOnFocus } from '@/lib/keyboardScroll';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

type Parts = { month: string; day: string; year: string };
type Part = keyof Parts;

/**
 * A birthday typed into three big boxes, MM / DD / YYYY, in one calm card
 * (Oct 17, owner: "Make the UI of the what's your birthday ... a lot
 * better"). Typing moves on by itself: a full month goes to the day, a full
 * day to the year, and a month or day that can only be one digit ("4") is
 * taken as "04" at once. Backspace in an empty box goes back a box.
 */
export function BirthdaySegments({ value, onChange, onSubmit, label = 'Birthday (optional)' }: {
  value: Parts;
  onChange: (next: Parts) => void;
  onSubmit?: () => void;
  label?: string;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const refs = { month: useRef<TextInput>(null), day: useRef<TextInput>(null), year: useRef<TextInput>(null) };
  const [focus, setFocus] = useState<Part | null>(null);
  // Tapping a box brings the whole card above the keyboard, the way every Field does.
  const cardRef = useRef<View>(null);
  const reveal = useRevealOnFocus();
  const order: Part[] = ['month', 'day', 'year'];

  const type = (part: Part, raw: string) => {
    let v = raw.replace(/\D/g, '').slice(0, part === 'year' ? 4 : 2);
    // A first digit that can only start a one-digit month (2–9) or day (4–9) is complete already.
    if (part === 'month' && /^[2-9]$/.test(v)) v = `0${v}`;
    if (part === 'day' && /^[4-9]$/.test(v)) v = `0${v}`;
    onChange({ ...value, [part]: v });
    if (part === 'month' && v.length === 2) refs.day.current?.focus();
    if (part === 'day' && v.length === 2) refs.year.current?.focus();
  };
  const back = (part: Part) => (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key !== 'Backspace' || value[part]) return;
    const before = order[order.indexOf(part) - 1];
    if (before) { refs[before].current?.focus(); onChange({ ...value, [before]: value[before].slice(0, -1) }); }
  };

  const cell = (part: Part, caption: string, placeholder: string, wide?: boolean) => (
    <View style={[styles.cell, wide && styles.cellWide]}>
      <Text style={[styles.caption, focus === part && styles.captionOn]}>{caption}</Text>
      <TextBox
        ref={refs[part]}
        accessibilityLabel={caption}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        value={value[part]}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={part === 'year' ? 4 : 2}
        onChangeText={(t) => type(part, t)}
        onKeyPress={back(part)}
        onSubmitEditing={part === 'year' ? onSubmit : undefined}
        returnKeyType={part === 'year' ? 'done' : 'next'}
        selectTextOnFocus
        onFocus={() => { setFocus(part); reveal(cardRef.current as unknown as Parameters<typeof reveal>[0]); }}
        onBlur={() => setFocus((f) => (f === part ? null : f))}
        style={styles.input}
      />
      <View style={[styles.underline, focus === part && styles.underlineOn]} />
    </View>
  );

  return (
    <View ref={cardRef} style={[styles.card, focus && styles.cardOn]} aria-label={label}>
      {cell('month', 'Month', 'MM')}
      <Text style={styles.slash} aria-hidden>/</Text>
      {cell('day', 'Day', 'DD')}
      <Text style={styles.slash} aria-hidden>/</Text>
      {cell('year', 'Year', 'YYYY', true)}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md,
  },
  cardOn: { borderColor: colors.borderStrong },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
  cellWide: { flex: 1.6 },
  caption: { ...typography.caption, color: colors.textFaint },
  captionOn: { color: colors.brand },
  input: {
    ...typography.display, fontSize: 34, letterSpacing: 0.5, color: colors.text, textAlign: 'center',
    width: '100%', paddingVertical: spacing.sm, fontVariant: ['tabular-nums'],
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  } as object,
  underline: { height: 2, alignSelf: 'stretch', marginHorizontal: spacing.sm, borderRadius: 1, backgroundColor: colors.border },
  underlineOn: { backgroundColor: colors.brand },
  slash: { ...typography.display, fontSize: 28, color: colors.textFaint, paddingBottom: spacing.md + 4 },
});
