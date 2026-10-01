import React, { forwardRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';
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
}

/**
 * The search pill: a glass in front, what you typed, and a clear button once
 * there is something to clear. The inbox's search recipe (a surface pill on
 * a hairline that darkens while you type), set up for searching: the
 * keyboard's key says Search, nothing is autocorrected or capitalised (it
 * offered "grinding" for "griffin"), and the text is 16 so a phone browser
 * never zooms in on it.
 */
export const SearchField = forwardRef<TextInput, Props>(function SearchField(
  { value, onChangeText, onSubmit, onClear, onFocus, onBlur, onKeyPress, placeholder = 'Search', accessibilityLabel = 'Search CourtSide' },
  ref,
) {
  const styles = useThemedStyles(styleDefinitions);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, focused && styles.wrapFocused]}>
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
        style={styles.input}
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
  wrap: { flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  wrapFocused: { borderColor: colors.borderStrong },
  glass: { position: 'absolute', left: 16, zIndex: 1 },
  input: {
    ...typography.body,
    fontSize: 16,
    color: colors.text,
    height: 44,
    paddingLeft: 42,
    paddingRight: 40,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  } as object,
  clear: { position: 'absolute', right: 12, height: 44, justifyContent: 'center' },
});
