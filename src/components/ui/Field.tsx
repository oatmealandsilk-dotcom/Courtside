import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';
import { MentionSuggestions } from '@/components/MentionSuggestions';
import { useMentionCandidates } from '@/features/mentions/useMentionCandidates';
import { activeMention, applyMention } from '@/lib/mentions';
import { useRevealOnFocus } from '@/lib/keyboardScroll';

interface Props {
  inputRef?: React.Ref<TextInput>;
  label?: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  minHeight?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  hint?: string;
  /**
   * Called when Enter is pressed on a computer (Shift+Enter still adds a
   * line). Phones keep Enter as a new line in multiline boxes, since the
   * send button is right there.
   */
  onSubmitEditing?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  autoCorrect?: boolean;
  /** Square off the bottom corners so a list can hang straight off the box. */
  flush?: boolean;
  /** Typing "@" offers people to mention, following first. */
  mentions?: boolean;
}

/**
 * The web toolkit only fires onSubmitEditing for a multiline box when it is
 * told to blur on submit, so that is what "Enter sends" means on the web.
 */
const submitOnEnter = Platform.OS === 'web';

export function Field({
  inputRef,
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  minHeight,
  autoCapitalize = 'sentences',
  keyboardType,
  secureTextEntry = false,
  hint,
  onSubmitEditing,
  onFocus,
  onBlur,
  autoCorrect,
  flush = false,
  mentions = false,
}: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const submits = Boolean(onSubmitEditing) && (submitOnEnter || !multiline);
  // Where the caret is, so the @ being typed is the one at the caret rather
  // than any @ in the text. Read from the box's own selection events.
  const [caret, setCaret] = useState(0);
  const candidatesFor = useMentionCandidates();
  const own = useRef<TextInput>(null);
  const reveal = useRevealOnFocus();
  const box = () => ((inputRef && typeof inputRef === 'object' && inputRef.current) || own.current) as unknown as Parameters<typeof reveal>[0];
  const mention = mentions ? activeMention(value, caret) : null;
  const candidates = mention ? candidatesFor(mention.query) : [];
  const pick = (handle: string) => {
    if (!mention) return;
    const next = applyMention(value, mention.start, caret, handle);
    onChangeText(next.text);
    setCaret(next.caret);
    const box = (inputRef && typeof inputRef === 'object' && inputRef.current) || own.current;
    // Put the caret after the inserted handle, once the new text has landed.
    setTimeout(() => box?.setNativeProps?.({ selection: { start: next.caret, end: next.caret } }), 0);
  };
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={inputRef ?? own}
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => {
          onChangeText(text);
          // Typing moves the caret; the selection event that follows corrects it, but
          // this keeps the picker tracking on the same keystroke.
          if (mentions) setCaret((c) => c + (text.length - value.length));
        }}
        onSelectionChange={mentions ? (e) => setCaret(e.nativeEvent.selection.end) : undefined}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        onFocus={() => { reveal(box()); onFocus?.(); }}
        onBlur={onBlur}
        autoCorrect={autoCorrect}
        onSubmitEditing={submits ? onSubmitEditing : undefined}
        blurOnSubmit={submits && multiline ? true : undefined}
        returnKeyType={submits ? 'send' : undefined}
        style={[
          styles.input,
          multiline && { minHeight: minHeight ?? 110, textAlignVertical: 'top' },
          flush && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
        ]}
      />
      {mention && candidates.length ? <MentionSuggestions candidates={candidates} onPick={pick} /> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  hint: { ...typography.small, color: colors.textFaint },
});
