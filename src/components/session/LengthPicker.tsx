import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Stepper } from '@/components/session/TrackedLength';
import * as haptics from '@/lib/haptics';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { spacing } from '@/theme';

/** The shortest and longest a session can be logged at: what the database takes (5 to 600 minutes, migration 39). */
const MIN = 5;
const MAX = 10 * 60;
const clamp = (m: number) => Math.max(MIN, Math.min(MAX, m));
/** Five minutes a tap, on the fives: 1h 02m goes up to 1h 05m, down to 1h 00m. */
const upFive = (m: number) => clamp(Math.floor(m / 5) * 5 + 5);
const downFive = (m: number) => clamp(Math.ceil(m / 5) * 5 - 5);
/** Where it starts when nothing is picked yet. */
const START = 60;

/**
 * How long a session you log by hand was: just hours and minutes (Oct 7,
 * owner: "Can we make it just custom"; the row of usual lengths and its
 * Custom tile are gone). The same pair as a tracker's Edit, an hour or five
 * minutes a tap, anywhere from 5 minutes to 10 hours. Nothing picked yet, it
 * starts at an hour and says so, so what will be saved is always on screen.
 * Plain buttons, so it is the same on a phone and in a browser; each step
 * ticks under the finger like the phone's own pickers.
 */
export function LengthPicker({ minutes, onChange }: { minutes: number | null; onChange: (minutes: number) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  // The hour it shows is the hour it saves: nothing picked becomes an hour at once.
  useEffect(() => { if (minutes == null) onChange(START); }, [minutes, onChange]);
  const shown = minutes ?? START;
  const set = (m: number) => { if (m !== shown) { haptics.tap(); onChange(m); } };
  const hours = Math.floor(shown / 60);
  const mins = shown % 60;
  return (
    <View style={styles.steppers}>
      <Stepper
        label="Hours"
        value={String(hours)}
        unit="h"
        onMinus={() => set(clamp(shown - 60))}
        onPlus={() => set(clamp(shown + 60))}
        minusOff={shown - 60 < MIN}
        plusOff={shown + 60 > MAX}
      />
      <Stepper
        label="Minutes"
        value={String(mins).padStart(2, '0')}
        unit="m"
        onMinus={() => set(downFive(shown))}
        onPlus={() => set(upFive(shown))}
        minusOff={shown <= MIN}
        plusOff={shown >= MAX}
      />
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  steppers: { flexDirection: 'row', gap: spacing.sm },
});
