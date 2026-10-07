import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useModalSheetBottom } from '@/lib/modalSheet';
import { colors, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

export interface MenuSheetItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** A few words under the label, only where the label alone would not say what happens. */
  note?: string;
  /** Red, for what reports, blocks or can't be taken back. */
  danger?: boolean;
  onPress: () => void;
}

/**
 * The "…" menu a page opens from its header: the same sheet a player's
 * profile and a coach question already open (a grabber, an optional small
 * title, one row per choice on hairlines, red for Report and Block). It
 * closes before a row's action runs, so a question asked next should use
 * confirmAfterMenu (or confirmReport / confirmBlock with fromMenu).
 * A row may carry a short note under its label (the Create box's Session
 * card: Start now, or Log a past one).
 */
export function MenuSheet({ visible, onClose, title, items }: { visible: boolean; onClose: () => void; title?: string; items: MenuSheetItem[] }) {
  const styles = useThemedStyles(styleDefinitions);
  // Clears Android's navigation bar, and a message meanwhile shows as the phone's own alert (modalSheet).
  const bottom = useModalSheetBottom(visible, spacing.xxl);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* The backdrop is a plain surface, not a button: a button here would
          wrap the menu's buttons, which the web refuses to nest. */}
      <Pressable accessibilityLabel="Close menu" onPress={onClose} style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: bottom }]}>
          <View style={styles.grabber} />
          {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
          {items.map((item, index) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.note ? `${item.label}. ${item.note}` : undefined}
              onPress={() => { onClose(); item.onPress(); }}
              style={({ pressed }) => [styles.row, index > 0 && styles.border, pressed && styles.pressed]}
            >
              <Ionicons name={item.icon} size={21} color={item.danger ? colors.danger : colors.text} />
              {item.note ? (
                <View style={styles.words}>
                  <Text style={[styles.label, item.danger && styles.danger]}>{item.label}</Text>
                  <Text style={styles.note}>{item.note}</Text>
                </View>
              ) : <Text style={[styles.label, item.danger && styles.danger]}>{item.label}</Text>}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styleDefinitions = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.sm,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.md },
  title: { ...typography.caption, color: colors.textFaint, textAlign: 'center', paddingBottom: spacing.sm, paddingHorizontal: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.surfaceAlt },
  label: { ...typography.body, color: colors.text },
  words: { flex: 1, gap: 2 },
  note: { ...typography.small, color: colors.textMuted },
  danger: { color: colors.danger },
});
