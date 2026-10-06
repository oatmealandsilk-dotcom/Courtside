import React, { forwardRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View, type NativeSyntheticEvent, type StyleProp, type TextInputKeyPressEventData, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, typography } from '@/theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  /** The keyboard's Search key. */
  onSubmit?: () => void;
  /** The ⓧ: the box is emptied (focus stays); this hears it to reset anything else. */
  onClear?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyPress?: (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  /** Where the page puts it: in a row beside a Back button, `{ flex: 1 }`; in a column it needs nothing. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The search pill: a glass in front, what you typed, and a clear button once
 * there is something to clear. The inbox's search recipe (a surface pill on
 * a hairline that darkens while you type), set up for searching: the
 * keyboard's key says Search, nothing is autocorrected or capitalised (it
 * offered "grinding" for "griffin"), and the text is 16 so a phone browser
 * never zooms in on it.
 *
 * Sized by its padding, the way the inbox's and Find Players' boxes are, not
 * by a fixed height: on an iPhone a fixed-height box with no padding, in a
 * column that stretched it (the Groups sheet, Oct 6), drew "Search groups"
 * half below its bottom edge. The border is on the text box itself, so the
 * words sit in the middle of what you see on every phone and in a browser.
 */
export const SearchField = forwardRef<TextInput, Props>(function SearchField(
  { value, onChangeText, onSubmit, onClear, onFocus, onBlur, onKeyPress, placeholder = 'Search', accessibilityLabel = 'Search CourtSide', style },
  ref,
) {
  const styles = useThemedStyles(styleDefinitions);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, style]}>
      <Ionicons name="search" size={17} color={colors.textFaint} style={styles.glass} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        onFocus={() => { setFocused(true); onFocus?.(); }}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        onKeyPress={onKeyPress}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.brand}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        textContentType="none"
        returnKeyType="search"
        enterKeyHint="search"
        // A search field to VoiceOver; on the web the role would make the box a page landmark instead.
        accessibilityRole={Platform.OS === 'web' ? undefined : 'search'}
        accessibilityLabel={accessibilityLabel}
        style={[styles.input, focused && styles.inputFocused]}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={12}
          onPress={() => { onChangeText(''); onClear?.(); }}
          style={styles.clear}
        >
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styleDefinitions = StyleSheet.create({
  wrap: { position: 'relative', justifyContent: 'center' },
  glass: { position: 'absolute', left: 16, zIndex: 1 },
  input: {
    ...typography.body,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingLeft: 42,
    paddingRight: 40,
    // At least the box's 46, with room to spare around the line: an iPhone centres the words in it.
    minHeight: 46,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  } as object,
  inputFocused: { borderColor: colors.borderStrong },
  clear: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
});
