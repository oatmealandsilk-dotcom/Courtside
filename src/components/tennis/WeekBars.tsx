import React from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { spokenDuration } from '@/features/activity/format';
import type { WeekDay } from '@/features/players/tennisProfile';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, withAlpha } from '@/theme';

/** The tallest bar; the busiest day of the seven reaches it. */
const TALL = 56;
/** Half the space between two bars: each column's tap reaches across it, so there is no dead strip between days. */
const HALF_GAP = 5;
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (day: string) => new Date(`${day}T12:00:00`).getDay();
const spokenDay = (d: WeekDay) => `${d.today ? 'Today' : WEEKDAYS[weekday(d.day)]}, ${d.minutes ? spokenDuration(d.minutes) : 'nothing'}`;

/**
 * The last seven days as small bars, today last and in the brand colour, the
 * others a whisper of it, each day's initial under its bar. A day with
 * nothing on court keeps a short grey stub, so the week always reads as
 * seven days.
 *
 * With `onSelect` (Oct 6, owner: "almost like iphone screen time") each day
 * is a button the height of its whole column: tapping one lights its bar in
 * the brand colour and quiets the rest, and the card above shows that day.
 * Each bar says its day and time to a screen reader ("Thursday, 1 hour 20
 * minutes"). Without it, the chart is one sentence for a screen reader.
 */
export function WeekBars({ days, selected = null, onSelect }: {
  days: WeekDay[];
  /** The tapped day ("2026-10-01"), or none for the whole week. */
  selected?: string | null;
  onSelect?: (day: string) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const most = Math.max(1, ...days.map((d) => d.minutes));
  const picking = !!selected && days.some((d) => d.day === selected);
  // The bar in the brand colour: the tapped day, otherwise today.
  const lit = picking ? selected : days.find((d) => d.today)?.day;
  const column = (d: WeekDay) => {
    const on = d.day === lit;
    return (
      <>
        <View style={styles.space}>
          <View
            style={[
              styles.bar,
              {
                height: d.minutes ? Math.max(8, Math.round((d.minutes / most) * TALL)) : 4,
                // While a day is tapped the other days step back a little further.
                backgroundColor: !d.minutes ? colors.surfaceAlt : on ? colors.brand : withAlpha(colors.brand, picking ? 0.16 : 0.24),
              },
            ]}
          />
        </View>
        <Text style={[styles.letter, on && styles.letterOn]}>{LETTERS[weekday(d.day)]}</Text>
      </>
    );
  };
  if (!onSelect) {
    return (
      <View style={styles.bars} accessible accessibilityLabel={`Each day: ${days.map(spokenDay).join('. ')}`}>
        {days.map((d) => <View key={d.day} style={styles.column}>{column(d)}</View>)}
      </View>
    );
  }
  return (
    <View style={styles.bars}>
      {days.map((d) => (
        <Pressable
          key={d.day}
          style={styles.column}
          hitSlop={{ left: HALF_GAP, right: HALF_GAP, top: 8, bottom: 8 }}
          accessibilityRole="button"
          accessibilityLabel={spokenDay(d)}
          accessibilityHint={d.day === selected ? 'Shows the whole week again' : 'Shows this day'}
          accessibilityState={{ selected: d.day === selected }}
          onPress={(e: GestureResponderEvent) => {
            // The card around the chart goes back to the week on a tap; this tap is the bar's alone.
            e.stopPropagation?.();
            onSelect(d.day);
          }}
        >
          {column(d)}
        </Pressable>
      ))}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  bars: { flexDirection: 'row', gap: HALF_GAP * 2, marginTop: 18 },
  column: { flex: 1, alignItems: 'center', gap: 6 },
  space: { height: TALL, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', maxWidth: 30, borderRadius: 6 },
  letter: { ...font('500'), fontSize: 11, lineHeight: 14, color: colors.textMuted },
  letterOn: { ...font('700'), color: colors.text },
});
