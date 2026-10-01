import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { setConfirmHost, type ConfirmOptions } from '@/lib/confirm';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * The browser's half of `confirm` (src/lib/confirm.ts), rendered once by the
 * root layout. A phone asks with its own system alert and never draws this.
 *
 * A small card in the middle of a dimmed page: the question, one muted line,
 * Cancel and the action side by side, the action outlined in red when it
 * deletes. It sits over everything, sheets and menus included, because a
 * Modal in the browser is drawn on top of whatever is already open. Escape or
 * a click on the dimmed page is Cancel; the keyboard starts on Cancel, so a
 * stray Enter never deletes anything.
 */
export function ConfirmHost() {
  const styles = useThemedStyles(styleDefinitions);
  // What is being asked, and whether it is up. Kept apart so the card keeps its
  // words while it fades out, instead of going blank on the way.
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    setConfirmHost((next) => { setRequest(next); setOpen(true); });
    return () => setConfirmHost(null);
  }, []);

  if (Platform.OS !== 'web' || !request) return null;

  const cancel = () => setOpen(false);
  const yes = () => {
    setOpen(false);
    void request.onConfirm();
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.backdrop}>
        {/* The card comes first so the keyboard lands on Cancel, not on the dimmed page; it is raised above the page instead. */}
        <View role="alertdialog" aria-modal accessibilityLabel={request.title} style={styles.card}>
          <Text style={styles.title}>{request.title}</Text>
          {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
          <View style={styles.actions}>
            <View style={styles.action}><Button label="Cancel" variant="secondary" onPress={cancel} full /></View>
            <View style={styles.action}><Button label={request.confirmLabel} variant={request.destructive ? 'danger' : 'primary'} onPress={yes} full /></View>
          </View>
        </View>
        {/* A click on the dimmed page is Cancel. Kept out of the Tab order and out of a screen reader's way: Cancel and Escape already say it. */}
        <Pressable tabIndex={-1} aria-hidden onPress={cancel} style={styles.page} />
      </View>
    </Modal>
  );
}

const styleDefinitions = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  page: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // Floats over the page, so it takes the overlay shadow rather than the page's hairline alone.
  card: {
    zIndex: 1,
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.bg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.sm,
    boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.18)',
  },
  title: { ...typography.heading, color: colors.text },
  message: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1 },
});
