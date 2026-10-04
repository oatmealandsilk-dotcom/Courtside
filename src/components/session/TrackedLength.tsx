import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Reanimated, { Easing, FadeInDown, FadeOut } from 'react-native-reanimated';

import * as haptics from '@/lib/haptics';
import { duration } from '@/lib/format';
import { colors, radius, spacing, typography } from '@/theme';

/** The shortest and longest a session can be logged at. */
const MIN = 1;
const MAX = 10 * 60;
const clamp = (m: number) => Math.max(MIN, Math.min(MAX, m));
/** The next or previous whole five minutes: 157 goes up to 160, down to 155. */
// One minute a tap (Oct 3, owner).
const upOne = (m: number) => clamp(m + 1);
const downOne = (m: number) => clamp(m - 1);

/**
 * How long a tracker's session was, in your log (Oct 3): the tracker's time
 * on one line ("2h 35m from WHOOP", with Edit). Edit opens hours and minutes
 * steppers under it (minutes by five, hours by one) for a break taken off;
 * Done, or a tap on the line again, closes them. Once changed, "Use WHOOP's
 * time" puts the tracker's own time back. Plain buttons, so it is the same
 * on a phone and in a browser.
 */
export function TrackedLength({ minutes, trackerMinutes, tracker, open, onOpen, onChange, hint }: {
  minutes: number;
  trackerMinutes: number;
  /** The tracker's short name: "WHOOP", "Watch". */
  tracker: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  onChange: (minutes: number) => void;
  hint?: string;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const edited = minutes !== trackerMinutes;
  const set = (m: number) => { if (m !== minutes) { haptics.tap(); onChange(m); } };
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${duration(minutes)} ${edited ? 'edited' : `from ${tracker}`}. ${open ? 'Done editing' : 'Edit how long'}`}
        accessibilityState={{ expanded: open }}
        onPress={() => onOpen(!open)}
        style={styles.row}
      >
        <Text style={styles.time}>{duration(minutes)}</Text>
        <Text style={styles.from}>{edited ? 'edited' : `from ${tracker}`}</Text>
        <View style={[styles.pill, open && styles.pillDone]}>
          <Text style={[styles.pillText, open && styles.pillDoneText]}>{open ? 'Done' : 'Edit'}</Text>
        </View>
      </Pressable>
      {open ? (
        <Reanimated.View entering={FadeInDown.duration(220).easing(Easing.bezier(0.32, 0.72, 0, 1))} exiting={FadeOut.duration(140)} style={styles.editor}>
          <View style={styles.steppers}>
            <Stepper
              label="Hours"
              value={String(hours)}
              unit="h"
              onMinus={() => set(clamp(minutes - 60))}
              onPlus={() => set(clamp(minutes + 60))}
              minusOff={minutes - 60 < MIN}
              plusOff={minutes + 60 > MAX}
            />
            <Stepper
              label="Minutes"
              value={String(mins).padStart(2, '0')}
              unit="m"
              onMinus={() => set(downOne(minutes))}
              onPlus={() => set(upOne(minutes))}
              minusOff={minutes <= MIN}
              plusOff={minutes >= MAX}
            />
          </View>
          <View style={styles.foot}>
            <Text style={styles.hint}>{hint ?? 'Change it if you took a break.'}</Text>
            {edited ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Use ${tracker}’s time, ${duration(trackerMinutes)}`} hitSlop={10} onPress={() => { haptics.untap(); onChange(trackerMinutes); }}>
                {({ pressed }) => <Text style={[styles.reset, pressed && styles.pressed]}>Use {tracker}’s time</Text>}
              </Pressable>
            ) : null}
          </View>
        </Reanimated.View>
      ) : null}
    </View>
  );
}

/** One of the two: − and + either side of the number, which a screen reader can also swipe up and down. */
function Stepper({ label, value, unit, onMinus, onPlus, minusOff, plusOff }: {
  label: string; value: string; unit: string; onMinus: () => void; onPlus: () => void; minusOff: boolean; plusOff: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: `${Number(value)} ${label.toLowerCase()}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'increment' && !plusOff) onPlus(); if (e.nativeEvent.actionName === 'decrement' && !minusOff) onMinus(); }}
    >
      <Pressable hitSlop={6} disabled={minusOff} onPress={onMinus} style={({ pressed }) => [styles.step, minusOff && styles.off, pressed && styles.pressed]}>
        <Ionicons name="remove" size={18} color={colors.text} />
      </Pressable>
      <View style={styles.figure}>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>
      <Pressable hitSlop={6} disabled={plusOff} onPress={onPlus} style={({ pressed }) => [styles.step, plusOff && styles.off, pressed && styles.pressed]}>
        <Ionicons name="add" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  time: { ...typography.title, color: colors.text, fontVariant: ['tabular-nums'] },
  from: { ...typography.small, color: colors.textMuted, flex: 1 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  pillText: { ...typography.smallStrong, color: colors.text },
  pillDone: { backgroundColor: colors.brand },
  pillDoneText: { color: colors.brandInk },
  editor: { gap: spacing.sm, marginTop: spacing.md },
  steppers: { flexDirection: 'row', gap: spacing.sm },
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 6, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  step: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  value: { ...typography.title, color: colors.text, fontVariant: ['tabular-nums'] },
  unit: { ...typography.smallStrong, color: colors.textMuted },
  foot: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  hint: { ...typography.small, color: colors.textFaint, flex: 1 },
  reset: { ...typography.smallStrong, color: colors.brand },
  off: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
});
