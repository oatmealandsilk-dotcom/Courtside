import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useModalOpenWhile } from '@/lib/modalOpen';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

export interface SheetOption {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Red, for something that removes someone or takes you out. */
  danger?: boolean;
  /** Shown, but cannot be picked (with `detail` saying why). */
  disabled?: boolean;
  /** One small line under the label. */
  detail?: string;
  onPress: () => void;
}

/**
 * The short list of choices that rises from the bottom in the chat screens:
 * what to do with someone in a group, how long to mute a chat, what to do
 * with a chat held in the inbox. Drawn the way a profile's "…" menu is (a
 * grabber, a small title, rows on hairlines), and the same on a phone and in
 * a browser. Picking a row closes the sheet first, then runs the choice.
 */
export function ChatSheet({ visible, title, options, onClose }: {
  visible: boolean;
  /** Who or what the choices are about ("Dev Patel", "Mute messages"). */
  title?: string;
  options: SheetOption[];
  onClose: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  useModalOpenWhile(visible);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* The backdrop is a plain surface, not a button: a button here would
          wrap the sheet's buttons, which the web refuses to nest. */}
      <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop}>
        {/* A tap on the sheet's own blank space stays on the sheet instead of closing it. */}
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md }]} onStartShouldSetResponder={() => true}>
          <View style={styles.grabber} />
          {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
          {options.map((option, index) => (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!option.disabled }}
              disabled={option.disabled}
              onPress={() => { onClose(); option.onPress(); }}
              style={({ pressed }) => [styles.row, index > 0 && styles.rule, pressed && styles.pressed, option.disabled && styles.off]}
            >
              {option.icon ? <Ionicons name={option.icon} size={21} color={option.danger ? colors.danger : colors.text} /> : null}
              <View style={styles.words}>
                <Text style={[styles.label, option.danger && { color: colors.danger }]}>{option.label}</Text>
                {option.detail ? <Text style={styles.detail}>{option.detail}</Text> : null}
              </View>
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
    paddingTop: spacing.sm,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.md },
  title: { ...typography.caption, color: colors.textFaint, textAlign: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.surfaceAlt },
  off: { opacity: 0.45 },
  words: { flex: 1, minWidth: 0, gap: 2 },
  label: { ...typography.body, color: colors.text },
  detail: { ...typography.small, color: colors.textMuted },
});
