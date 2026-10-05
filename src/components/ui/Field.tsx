import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View, useWindowDimensions, type KeyboardTypeOptions } from 'react-native';

import { colors, lift, radius, spacing, typography } from '@/theme';
import { MentionSuggestions } from '@/components/MentionSuggestions';
import { useMentionCandidates } from '@/features/mentions/useMentionCandidates';
import { activeMention, applyMention } from '@/lib/mentions';
import { useRevealOnFocus } from '@/lib/keyboardScroll';

interface Props {
  inputRef?: React.Ref<TextInput>;
  label?: string;
  /**
   * What a screen reader calls the box when it has no label of its own (one
   * sitting under a section title, say). Falls back to the label, then to the
   * placeholder, so a box with neither still gets a name.
   */
  accessibilityLabel?: string;
  /** Something small on the label's line, at the right: a link, a count. */
  labelRight?: React.ReactNode;
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
  /** Tapping in selects what is there, so typing replaces it (a prefilled number, say). */
  selectTextOnFocus?: boolean;
  onBlur?: () => void;
  autoCorrect?: boolean;
  /** Square off the bottom corners so a list can hang straight off the box. */
  flush?: boolean;
  /** Typing "@" offers people to mention, following first. */
  mentions?: boolean;
  /** The soft look of the app's own ask boxes: white, lifted on a shadow, no outline. Used in sheets. */
  soft?: boolean;
  /** A slim one-line pill that grows as you type (a comment box, a message box). */
  compact?: boolean;
  /** No box at all: the words on the page, beside an avatar (a session's caption). */
  bare?: boolean;
  /** A quiet filled box with no outline, for a field sitting inside a card's grouped list (a settings page). */
  well?: boolean;
  /**
   * What the box holds, for the phone's password manager and autofill
   * ('email', 'password', 'new-password', 'name', 'username-new'). Passed on
   * Android only by its callers: on an iPhone React Native turns it into
   * iOS's own content type, which would change its autofill and strong
   * password suggestions.
   */
  autoComplete?: React.ComponentProps<typeof TextInput>['autoComplete'];
}

/**
 * The web toolkit only fires onSubmitEditing for a multiline box when it is
 * told to blur on submit, so that is what "Enter sends" means on the web.
 */
const submitOnEnter = Platform.OS === 'web';

export function Field({
  inputRef,
  label,
  accessibilityLabel,
  labelRight,
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
  selectTextOnFocus,
  onBlur,
  autoCorrect,
  flush = false,
  mentions = false,
  soft = false,
  compact = false,
  bare = false,
  well = false,
  autoComplete,
}: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const submits = Boolean(onSubmitEditing) && (submitOnEnter || !multiline);
  // Where the caret is, so the @ being typed is the one at the caret rather
  // than any @ in the text. Read from the box's own selection events.
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const candidatesFor = useMentionCandidates();
  const own = useRef<TextInput>(null);
  const reveal = useRevealOnFocus();
  const box = () => ((inputRef && typeof inputRef === 'object' && inputRef.current) || own.current) as unknown as Parameters<typeof reveal>[0];
  const mention = mentions ? activeMention(value, caret) : null;
  const candidates = mention ? candidatesFor(mention.query) : [];
  // When the @ list opens under the box, the box and the list together are
  // lifted above the keyboard: lifting only the box left the names behind the keys.
  const wrap = useRef<View>(null);
  const listing = focused && !!mention && candidates.length > 0;
  // On a short phone (an iPhone SE) the box and a full list do not fit
  // between the top of the screen and the keyboard: the list shows about
  // three names and scrolls for the rest.
  const { height: windowHeight } = useWindowDimensions();
  const listHeight = windowHeight < 700 ? 150 : undefined;
  useEffect(() => {
    if (!listing) return undefined;
    if (Platform.OS !== 'web') { reveal(wrap.current); return undefined; }
    // A browser only moves the page if the list is not already in view.
    const node = wrap.current as unknown as { scrollIntoView?: (options: object) => void } | null;
    const t = setTimeout(() => node?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }), 30);
    return () => clearTimeout(t);
  }, [listing]); // eslint-disable-line react-hooks/exhaustive-deps
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
    <View ref={wrap} style={styles.wrap}>
      {label || labelRight ? (
        <View style={styles.labelRow}>
          {label ? <Text style={styles.label}>{label}</Text> : <View />}
          {labelRight}
        </View>
      ) : null}
      <TextInput
        ref={inputRef ?? own}
        accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
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
        autoComplete={autoComplete}
        selectTextOnFocus={selectTextOnFocus}
        onFocus={() => { setFocused(true); reveal(box()); onFocus?.(); }}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        autoCorrect={autoCorrect}
        onSubmitEditing={submits ? onSubmitEditing : undefined}
        blurOnSubmit={submits && multiline ? true : undefined}
        returnKeyType={submits ? 'send' : undefined}
        // One row to start with on the web, where a box would otherwise open two lines tall.
        numberOfLines={compact ? 1 : undefined}
        style={[
          styles.input,
          focused && styles.inputFocused,
          soft && (multiline ? styles.softArea : styles.softLine),
          well && styles.well,
          well && focused && styles.inputFocused,
          multiline && { minHeight: minHeight ?? 110, textAlignVertical: 'top' },
          compact && styles.compact,
          flush && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
          bare && styles.bare,
        ]}
      />
      {mention && candidates.length ? <MentionSuggestions candidates={candidates} onPick={pick} maxHeight={listHeight} /> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
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
    // The browser's own blue ring; the border darkening is the focus mark instead.
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  inputFocused: { borderColor: colors.borderStrong },
  bare: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0, paddingVertical: 6, fontSize: 16, lineHeight: 22 },
  hint: { ...typography.small, color: colors.textFaint },
  softLine: { ...lift, borderWidth: 0, borderRadius: radius.pill, minHeight: 52, paddingVertical: 14, fontSize: 16 },
  softArea: { ...lift, borderWidth: 0, borderRadius: 20, paddingVertical: 14, fontSize: 16, lineHeight: 22 },
  well: { backgroundColor: colors.surfaceAlt, borderColor: 'transparent', borderRadius: 14 },
  compact: { minHeight: 44, maxHeight: 120, borderRadius: 22, paddingTop: 11, paddingBottom: 11, paddingHorizontal: 16, fontSize: 16, lineHeight: 22 },
});
