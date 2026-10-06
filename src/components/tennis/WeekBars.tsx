import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spokenDuration } from '@/features/activity/format';
import type { WeekDay } from '@/features/players/tennisProfile';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, withAlpha } from '@/theme';

/** The tallest bar; the busiest day of the seven reaches it. */
const TALL = 56;
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (day: string) => new Date(`${day}T12:00:00`).getDay();

/**
 * The last seven days as small bars, today last and in the brand colour, the
 * others a whisper of it, each day's initial under its bar. A day with
 * nothing on court keeps a short grey stub, so the week always reads as
 * seven days. One sentence for a screen reader.
 */
export function WeekBars({ days }: { days: WeekDay[] }) {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const most = Math.max(1, ...days.map((d) => d.minutes));
  const spoken = days.map((d) => `${d.today ? 'Today' : WEEKDAYS[weekday(d.day)]}, ${d.minutes ? spokenDuration(d.minutes) : 'nothing'}`).join('. ');
  return (
    <View style={styles.bars} accessible accessibilityLabel={`Each day: ${spoken}`}>
      {days.map((d) => (
        <View key={d.day} style={styles.column}>
          <View style={styles.space}>
            <View
              style={[
                styles.bar,
                {
                  height: d.minutes ? Math.max(8, Math.round((d.minutes / most) * TALL)) : 4,
                  backgroundColor: !d.minutes ? colors.surfaceAlt : d.today ? colors.brand : withAlpha(colors.brand, 0.24),
                },
              ]}
            />
          </View>
          <Text style={[styles.letter, d.today && styles.letterToday]}>{LETTERS[weekday(d.day)]}</Text>
        </View>
      ))}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  bars: { flexDirection: 'row', gap: 10, marginTop: 18 },
  column: { flex: 1, alignItems: 'center', gap: 6 },
  space: { height: TALL, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', maxWidth: 30, borderRadius: 6 },
  letter: { ...font('500'), fontSize: 11, lineHeight: 14, color: colors.textMuted },
  letterToday: { ...font('700'), color: colors.text },
});
