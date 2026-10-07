import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Reanimated, { Easing, FadeInDown, FadeOut } from 'react-native-reanimated';

import { Tiles } from '@/components/sheet/SheetForm';
import { Stepper } from '@/components/session/TrackedLength';
import { spokenDuration } from '@/features/activity/format';
import { LENGTHS, lengthTile } from '@/features/activity/lengths';
import * as haptics from '@/lib/haptics';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing } from '@/theme';

/** The shortest and longest a session can be logged at: what the database takes (5 to 600 minutes, migration 39). */
const MIN = 5;
const MAX = 10 * 60;
const clamp = (m: number) => Math.max(MIN, Math.min(MAX, m));
/** Five minutes a tap, on the fives: 1h 02m goes up to 1h 05m, down to 1h 00m. */
const upFive = (m: number) => clamp(Math.floor(m / 5) * 5 + 5);
const downFive = (m: number) => clamp(Math.ceil(m / 5) * 5 - 5);
/** The Custom tile's value among the lengths (never a real length). */
const CUSTOM = -1;
/** Where Custom starts when nothing is picked yet. */
const START = 60;

/**
 * How long a session you log by hand was (Oct 6, owner: "I don't like how
 * you can only pick specific times"): the usual lengths, one tap each, as
 * before, and Custom beside them for any other. Custom opens hours and
 * minutes steppers under the row (the same pair as a tracker's Edit), an hour
 * or five minutes a tap, anywhere from 5 minutes to 10 hours. While a length
 * is not one of the usual ones, the Custom tile is the chosen one and says it
 * ("1h 45m"), so what will be saved is always on the row. Plain buttons, so
 * it is the same on a phone and in a browser; each step ticks under the
 * finger like the phone's own pickers.
 */
export function LengthPicker({ minutes, onChange }: { minutes: number | null; onChange: (minutes: number) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const [open, setOpen] = useState(false);
  const usual = minutes != null && LENGTHS.includes(minutes);
  const custom = open || (minutes != null && !usual);
  const set = (m: number) => { if (m !== minutes) { haptics.tap(); onChange(m); } };
  const pick = (v: number) => {
    if (v === CUSTOM) {
      haptics.untap();
      // A second tap folds the steppers away; the length stays as it is.
      if (open) { setOpen(false); return; }
      setOpen(true);
      if (minutes == null) onChange(START);
      return;
    }
    setOpen(false);
    if (v !== minutes) { haptics.untap(); onChange(v); }
  };
  const shown = minutes ?? START;
  const hours = Math.floor(shown / 60);
  const mins = shown % 60;
  const customTile = {
    value: CUSTOM,
    top: '',
    main: '',
    label: custom && minutes != null ? `Custom length, ${spokenDuration(minutes)}` : 'Custom length',
    draw: (on: boolean) => (custom && minutes != null ? (
      <View style={styles.customOn}>
        <Text style={[styles.customTop, { color: on ? colors.bg : colors.textMuted }]}>Custom</Text>
        {lengthTile(minutes).draw(on)}
      </View>
    ) : (
      <View style={styles.customOff}>
        <Ionicons name="options-outline" size={18} color={on ? colors.bg : colors.text} />
        <Text style={[styles.customWord, { color: on ? colors.bg : colors.textMuted }]}>Custom</Text>
      </View>
    )),
  };
  return (
    <View>
      <Tiles value={custom ? CUSTOM : minutes ?? 0} onChange={pick} options={[...LENGTHS.map(lengthTile), customTile]} />
      {open ? (
        <Reanimated.View entering={FadeInDown.duration(220).easing(Easing.bezier(0.32, 0.72, 0, 1))} exiting={FadeOut.duration(140)} style={styles.steppers}>
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
        </Reanimated.View>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  steppers: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  customOn: { alignItems: 'center', gap: 1 },
  customTop: { fontSize: 11, lineHeight: 14, ...font('500') },
  customOff: { alignItems: 'center', gap: 3 },
  customWord: { fontSize: 12, lineHeight: 15, ...font('600') },
});
