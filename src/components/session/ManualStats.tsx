import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextInput, type ViewStyle } from 'react-native';
import Reanimated, { Easing, FadeInDown } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Field } from '@/components/ui';
import { AVG_HR_MAX, KCAL_MAX, digitsOnly, readManualStats } from '@/features/activity/manualStats';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * "+ Add calories & heart rate" (Oct 8, owner: "yes add it"): a quiet link
 * on Log a session and on the "Log it" page a timed session's Finish opens,
 * for a session with no tracker. Closed by default, so logging stays two
 * taps; opened, two number boxes side by side, calories and average heart
 * rate, either or both. The caller keeps the words typed and reads them with
 * readManualStats on Save, which says why when a number is out of range.
 *
 * A number out of range is called out once its box is left (a heart rate
 * of "14" is only "142" half typed), or straight away when no more typing
 * could fix it (over the top), or when Save asked (`showProblem`).
 * "Remove" empties both and folds it away again.
 */
export function ManualStats({ open, onOpen, kcal, avgHr, onKcal, onAvgHr, showProblem = false, note, style }: {
  open: boolean;
  onOpen: (open: boolean) => void;
  /** What is typed in each box, digits only. */
  kcal: string;
  avgHr: string;
  onKcal: (text: string) => void;
  onAvgHr: (text: string) => void;
  /** Save was tapped with a number out of range: say why now. */
  showProblem?: boolean;
  /** A line under the boxes while nothing is wrong (where nothing else on the page says who sees them). */
  note?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const first = useRef<TextInput>(null);
  // Opened by a tap (not on the page's first draw): the caret goes straight into Calories.
  const tapped = useRef(false);
  useEffect(() => {
    if (!open || !tapped.current) return undefined;
    const t = setTimeout(() => first.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open]);
  const [left, setLeft] = useState<{ kcal: boolean; hr: boolean }>({ kcal: false, hr: false });
  const read = readManualStats(kcal, avgHr);
  const past = (read.problemIn === 'kcal' && Number(kcal) > KCAL_MAX) || (read.problemIn === 'hr' && Number(avgHr) > AVG_HR_MAX);
  const problem = read.problem && read.problemIn && (showProblem || past || left[read.problemIn]) ? read.problem : undefined;

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add calories and heart rate"
        hitSlop={8}
        onPress={() => { tapped.current = true; onOpen(true); }}
        style={({ pressed }) => [styles.add, style, pressed && styles.pressed]}
      >
        <Ionicons name="add" size={15} color={colors.textMuted} />
        <Text style={styles.addText}>Add calories & heart rate</Text>
      </Pressable>
    );
  }

  const line = problem ?? note;
  return (
    <Reanimated.View entering={tapped.current ? FadeInDown.duration(220).easing(Easing.bezier(0.32, 0.72, 0, 1)) : undefined} style={[styles.box, style]}>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Field
            inputRef={first}
            soft
            label="Calories"
            accessibilityLabel="Calories, in kilocalories"
            value={kcal}
            onChangeText={(t) => onKcal(digitsOnly(t, 4))}
            placeholder="kcal"
            keyboardType="number-pad"
            maxLength={4}
            autoComplete="off"
            autoCorrect={false}
            onBlur={() => setLeft((was) => ({ ...was, kcal: true }))}
          />
        </View>
        <View style={styles.cell}>
          <Field
            soft
            label="Avg heart rate"
            accessibilityLabel="Average heart rate, in beats per minute"
            value={avgHr}
            onChangeText={(t) => onAvgHr(digitsOnly(t, 3))}
            placeholder="bpm"
            keyboardType="number-pad"
            maxLength={3}
            autoComplete="off"
            autoCorrect={false}
            onBlur={() => setLeft((was) => ({ ...was, hr: true }))}
          />
        </View>
      </View>
      <View style={styles.foot}>
        <Text accessibilityLiveRegion="polite" style={[styles.line, problem ? styles.problem : null]}>{line ?? ''}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove calories and heart rate"
          hitSlop={8}
          onPress={() => { onKcal(''); onAvgHr(''); setLeft({ kcal: false, hr: false }); onOpen(false); }}
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        >
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>
    </Reanimated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  // The link: AddScore's look, so the two quiet extras on a session read as one family.
  add: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3, paddingVertical: 2 },
  addText: { ...typography.smallStrong, color: colors.textMuted },
  pressed: { opacity: 0.7 },
  box: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  cell: { flex: 1, minWidth: 0 },
  foot: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  line: { ...typography.small, color: colors.textFaint, flex: 1 },
  problem: { color: colors.danger },
  remove: { paddingVertical: 1 },
  removeText: { ...typography.smallStrong, color: colors.textMuted },
});
