import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { StepDots } from '@/features/groups/create/StepDots';
import { colors, lift, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * The top of the group sheets (Start a group, Edit group, Invite people),
 * the same on all three: a row with Back (when there is one) and the round
 * close button, and Start a group's step dots between them; under it the
 * title, the size of every other sheet's (SheetTitle, 24), and one line.
 */
export function FlowHeader({ title, line, onClose, onBack, step, closeDisabled }: {
  title?: string; line?: string; onClose: () => void; onBack?: () => void;
  /** Start a group's step (0, 1 or 2), for its dots. */
  step?: number;
  /** While something is being saved: the sheet stays until it is done. */
  closeDisabled?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const round = (icon: 'chevron-back' | 'close', label: string, onPress: () => void, disabled = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.round, (pressed || disabled) && styles.pressed]}>
      <Ionicons name={icon} size={icon === 'close' ? 18 : 20} color={colors.textMuted} />
    </Pressable>
  );
  return (
    <View style={styles.head}>
      <View style={styles.topRow}>
        {onBack ? round('chevron-back', 'Back', onBack) : <View style={styles.roundSpace} />}
        {step !== undefined ? <StepDots step={step} /> : null}
        {round('close', 'Close', onClose, closeDisabled)}
      </View>
      {title ? (
        <View style={styles.titles}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {line ? <Text style={styles.line} numberOfLines={2}>{line}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  head: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { ...lift, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  roundSpace: { width: 34, height: 34 },
  pressed: { opacity: 0.6 },
  titles: { gap: 3 },
  // The same title as SheetTitle's, so the group sheets match every other sheet.
  title: { ...typography.title, fontSize: 24, letterSpacing: -0.8, color: colors.text },
  line: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
});
