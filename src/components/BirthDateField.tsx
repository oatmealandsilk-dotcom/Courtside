import React, { useRef } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * A date of birth as three short boxes — month, day, year — the way most
 * sign-ups ask it. Typing a full month or day moves on to the next box.
 */
export function BirthDateField({ month, day, year, onChange, label = 'Date of birth', onSubmit }: {
  month: string; day: string; year: string;
  onChange: (next: { month: string; day: string; year: string }) => void;
  label?: string;
  onSubmit?: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const dayRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const digits = (text: string, max: number) => text.replace(/\D/g, '').slice(0, max);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Month" placeholder="MM" placeholderTextColor={colors.textFaint} value={month} keyboardType="number-pad" maxLength={2}
          onChangeText={(t) => { const v = digits(t, 2); onChange({ month: v, day, year }); if (v.length === 2) dayRef.current?.focus(); }}
          style={[styles.box, styles.short]}
        />
        <TextInput
          ref={dayRef} accessibilityLabel="Day" placeholder="DD" placeholderTextColor={colors.textFaint} value={day} keyboardType="number-pad" maxLength={2}
          onChangeText={(t) => { const v = digits(t, 2); onChange({ month, day: v, year }); if (v.length === 2) yearRef.current?.focus(); }}
          style={[styles.box, styles.short]}
        />
        <TextInput
          ref={yearRef} accessibilityLabel="Year" placeholder="YYYY" placeholderTextColor={colors.textFaint} value={year} keyboardType="number-pad" maxLength={4}
          onChangeText={(t) => onChange({ month, day, year: digits(t, 4) })}
          onSubmitEditing={onSubmit}
          style={[styles.box, styles.long]}
        />
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...typography.smallStrong, color: colors.textMuted },
  row: { flexDirection: 'row', gap: spacing.sm },
  box: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.text, fontSize: 16, textAlign: 'center' },
  short: { width: 64 },
  long: { width: 92 },
});
