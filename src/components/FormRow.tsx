import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View, type AccessibilityRole, type AccessibilityState } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, spacing, typography } from '@/theme';

/**
 * One line of a form's settings list, the same size as the rows on the
 * Settings page but without the card behind them: an icon, the words, and
 * on the right a value, a switch or a chevron. A thin line sits above every
 * row after the first, starting where the words start.
 *
 * Something you can tap on its own (a clear ×, a number box) goes in
 * `control`, beside the row's tap area rather than inside it: a button
 * inside a button is not allowed in a browser, and a phone's screen reader
 * cannot reach one either.
 */
export const FormRow = React.forwardRef<View, {
  /** The icon at the left, muted. Ignored when `lead` is given. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Something else at the left (a brand-coloured pin once a place is set). */
  lead?: React.ReactNode;
  label: string;
  /** A short value at the right ("Maya, Jonah"), muted, cut short past 150 wide. */
  value?: string;
  /** Shown at the right inside the tap area, for show only (a switch the whole row flips). */
  accessory?: React.ReactNode;
  /** Its own control at the far right, beside the tap area. */
  control?: React.ReactNode;
  chevron?: boolean;
  /** Draw the thin line above it (every row but the first). */
  line?: boolean;
  onPress?: () => void;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
}>(function FormRow({ icon, lead, label, value, accessory, control, chevron = false, line = false, onPress, accessible, accessibilityLabel, accessibilityRole = 'button', accessibilityState }, ref) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View ref={ref} style={styles.row}>
      <Pressable
        accessible={accessible}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
        accessibilityState={accessibilityState}
        // A browser reads the switch's state from this, not from accessibilityState.
        aria-checked={accessibilityState?.checked}
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [styles.main, pressed && onPress ? styles.pressed : null]}
      >
        <View style={styles.lead}>{lead ?? (icon ? <Ionicons name={icon} size={20} color={colors.textMuted} /> : null)}</View>
        <View style={[styles.body, line && styles.line]}>
          {/* Two lines at most: on a narrow phone, or with larger text on, a long label wraps rather than being cut mid-word. */}
          <Text style={styles.label} numberOfLines={2}>{label}</Text>
          {value ? <Text style={styles.value} numberOfLines={1}>{value}</Text> : null}
          {accessory}
          {chevron ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} /> : null}
        </View>
      </Pressable>
      {control ? <View style={[styles.control, line && styles.line]}>{control}</View> : null}
    </View>
  );
});

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
  pressed: { opacity: 0.6 },
  lead: { width: 26, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 50, paddingVertical: 11 },
  control: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.sm },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { ...typography.body, color: colors.text, flex: 1 },
  value: { ...typography.body, color: colors.textMuted, maxWidth: 150 },
});
