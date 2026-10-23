import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { RisingSheet } from '@/components/RisingSheet';
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
  // While it fades out it keeps what it showed, rather than emptying to a bare strip.
  const last = useRef({ title, options });
  if (visible) last.current = { title, options };
  const shown = visible ? { title, options } : last.current;
  // In a browser, lifting the finger from the long press that opened it lands a
  // click on whatever the sheet put under it: only a new touch, click or key counts.
  const armed = useRef(Platform.OS !== 'web');
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    armed.current = false;
    const arm = () => { armed.current = true; };
    // A click with no press behind it (detail 0) comes from a screen reader or the keyboard, never a lifted finger.
    const armClick = (e: MouseEvent) => { if (e.detail === 0) armed.current = true; };
    window.addEventListener('pointerdown', arm, true);
    window.addEventListener('keydown', arm, true);
    window.addEventListener('click', armClick, true);
    return () => {
      window.removeEventListener('pointerdown', arm, true);
      window.removeEventListener('keydown', arm, true);
      window.removeEventListener('click', armClick, true);
    };
  }, [visible]);
  return (
    // Rises from the bottom and drops away on close; Mute's durations glide the sheet's height (RisingSheet, Oct 22).
    <RisingSheet
      visible={visible}
      onClose={onClose}
      onBackdropPress={() => { if (armed.current) onClose(); }}
      sheetStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md }]}
    >
      <View style={styles.grabber} />
      {shown.title ? <Text style={styles.title} numberOfLines={1}>{shown.title}</Text> : null}
      {shown.options.map((option, index) => (
        <Pressable
          key={option.key}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!option.disabled }}
          disabled={option.disabled}
          onPress={() => { if (!armed.current) return; onClose(); option.onPress(); }}
          style={({ pressed }) => [styles.row, index > 0 && styles.rule, pressed && styles.pressed, option.disabled && styles.off]}
        >
          {option.icon ? <Ionicons name={option.icon} size={21} color={option.danger ? colors.danger : colors.text} /> : null}
          <View style={styles.words}>
            <Text style={[styles.label, option.danger && { color: colors.danger }]}>{option.label}</Text>
            {option.detail ? <Text style={styles.detail}>{option.detail}</Text> : null}
          </View>
        </Pressable>
      ))}
    </RisingSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
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
