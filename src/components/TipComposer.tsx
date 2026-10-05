import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useRevealOnFocus } from '@/lib/keyboardScroll';
import { colors, font, radius, spacing, typography, lift } from '@/theme';

/** Tips and the AI coach box stop here; a coach's answer to a booking passes its own, longer limit. */
const MAX = 500;

/**
 * A box to write in, with a small Send pill tucked in its corner that wakes
 * up once there is something to send: a shade off the page, no outline.
 * Tips use it (the feed's tip page and the board), and so does the AI coach.
 */
export function TipComposer({ onSubmit, onSent, initial = '', placeholder = 'Your tip', accessibilityLabel = 'Your tip', maxLength = MAX }: {
  onSubmit: (body: string) => Promise<void> | void;
  onSent?: () => void;
  /** Text to start with (a suggestion tapped above it). */
  initial?: string;
  placeholder?: string;
  /** What a screen reader calls the box: a tip by default, but the same box takes a coach's answer and an AI coach question. */
  accessibilityLabel?: string;
  /** How many characters the box takes: 500 for a tip unless a screen says otherwise. */
  maxLength?: number;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const input = useRef<TextInput>(null);
  const reveal = useRevealOnFocus();
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const text = body.trim();
  const ready = !!text && !busy;
  const send = async () => {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(text);
      setBody('');
      input.current?.blur();
      onSent?.();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'That did not send. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.box}>
        <TextInput
          ref={input}
          value={body}
          onChangeText={setBody}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={maxLength}
          accessibilityLabel={accessibilityLabel}
          onFocus={() => reveal(input.current as unknown as Parameters<typeof reveal>[0])}
          style={styles.input}
        />
        <View style={styles.foot}>
          <Text style={styles.left}>{body.length > maxLength - Math.max(80, maxLength * 0.1) ? `${maxLength - body.length} left` : ''}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !ready, busy }}
            disabled={!ready}
            onPress={send}
            hitSlop={6}
            style={({ pressed }) => [styles.send, !ready && styles.sendOff, pressed && { opacity: 0.8 }]}
          >
            {busy ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Text style={[styles.sendText, !ready && styles.sendTextOff]}>Send</Text>}
          </Pressable>
        </View>
      </View>
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm },
  box: { ...lift, borderRadius: 20, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  input: { ...typography.body, color: colors.text, minHeight: 72, maxHeight: 180, paddingTop: 0, paddingBottom: 0, textAlignVertical: 'top' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.xs },
  left: { ...typography.caption, color: colors.textFaint },
  send: { minWidth: 72, height: 34, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: colors.surfaceAlt },
  sendText: { fontSize: 14, ...font('600'), color: colors.brandInk },
  sendTextOff: { color: colors.textFaint },
  error: { ...typography.small, color: colors.danger, paddingHorizontal: spacing.sm },
});
