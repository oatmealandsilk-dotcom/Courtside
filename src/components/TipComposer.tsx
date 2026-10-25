import { PRESS_DIM } from '@/theme/press';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useRevealOnFocus } from '@/lib/keyboardScroll';
import { colors, font, radius, spacing, typography, lift, buttonShape } from '@/theme';
import { corner } from '@/theme/look';

/** Tips and the AI coach box stop here; a coach's answer to a booking passes its own, longer limit. */
const MAX = 500;

/**
 * A box to write in, with a small Send pill tucked in its corner that wakes
 * up once there is something to send: a shade off the page, no outline.
 * Tips use it (the feed's tip page and the board), and so does the AI coach.
 */
export function TipComposer({ onSubmit, onSent, initial = '', placeholder = 'Your tip', accessibilityLabel = 'Your tip', maxLength = MAX, line = false }: {
  onSubmit: (body: string) => Promise<void> | void;
  onSent?: () => void;
  /** Text to start with (a suggestion tapped above it). */
  initial?: string;
  placeholder?: string;
  /** What a screen reader calls the box: a tip by default, but the same box takes a coach's answer and an AI coach question. */
  accessibilityLabel?: string;
  /** How many characters the box takes: 500 for a tip unless a screen says otherwise. */
  maxLength?: number;
  /**
   * One line, like Messages' box (Oct 25, "D all for less ai", item 9: the AI coach): a rounded field with a
   * hairline that grows with the words, and a round Send arrow at its end instead of the Send pill under it.
   */
  line?: boolean;
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
  const left = body.length > maxLength - Math.max(80, maxLength * 0.1) ? `${maxLength - body.length} left` : '';
  if (line) return (
    <View style={styles.wrap}>
      <View style={styles.lineBox}>
        <TextInput
          ref={input}
          value={body}
          onChangeText={setBody}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          multiline
          // A browser's box starts one line tall, as Messages' does.
          {...(Platform.OS === 'web' ? ({ rows: 1 } as object) : null)}
          maxLength={maxLength}
          accessibilityLabel={accessibilityLabel}
          onFocus={() => reveal(input.current as unknown as Parameters<typeof reveal>[0])}
          style={styles.lineInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !ready, busy }}
          disabled={!ready}
          onPress={send}
          hitSlop={6}
          style={({ pressed }) => [styles.lineSend, !ready && styles.sendOff, pressed && { opacity: PRESS_DIM }]}
        >
          {busy ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Ionicons name="arrow-up" size={18} color={ready ? colors.brandInk : colors.textFaint} />}
        </Pressable>
      </View>
      {left ? <Text style={[styles.left, styles.lineLeft]}>{left}</Text> : null}
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
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
          <Text style={styles.left}>{left}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !ready, busy }}
            disabled={!ready}
            onPress={send}
            hitSlop={6}
            style={({ pressed }) => [styles.send, !ready && styles.sendOff, pressed && { opacity: PRESS_DIM }]}
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
  box: { ...lift, borderRadius: corner(20), backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  input: { ...typography.body, color: colors.text, minHeight: 72, maxHeight: 180, paddingTop: 0, paddingBottom: 0, textAlignVertical: 'top' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.xs },
  left: { ...typography.caption, color: colors.textFaint },
  send: { minWidth: 72, height: buttonShape.smallHeight, paddingHorizontal: 16, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: colors.surfaceAlt },
  sendText: { fontSize: 14, ...font('600'), color: colors.brandInk },
  sendTextOff: { color: colors.textFaint },
  error: { ...typography.small, color: colors.danger, paddingHorizontal: spacing.sm },
  // The one-line box (`line`): Messages' rounded field, flat, with a hairline; the words and the arrow share its foot.
  lineBox: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, minHeight: 46, borderRadius: corner(23), backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, paddingLeft: spacing.lg, paddingRight: 6, paddingVertical: 5 },
  lineInput: { ...typography.body, flex: 1, minWidth: 0, color: colors.text, maxHeight: 140, paddingTop: 7, paddingBottom: 7, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', resize: 'none' } as object) : null) },
  lineSend: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  lineLeft: { paddingHorizontal: spacing.lg },
});
