import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { searchPlaces } from '@/data/locations';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Where a post was, kept small: a link at the right end of the caption's
 * label ("Add location"), which becomes the place once one is picked, with
 * an × to take it off. Tapping it opens LocationSearch under the caption.
 */
export function LocationLink({ value, onPress, onClear }: { value: string; onPress: () => void; onClear: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!value) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Add location" hitSlop={8} onPress={onPress} style={styles.link}>
        <Ionicons name="location-outline" size={14} color={colors.brand} />
        <Text style={styles.linkText}>Add location</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.link}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Location: ${value}. Tap to change it`} hitSlop={8} onPress={onPress} style={styles.set}>
        <Ionicons name="location" size={14} color={colors.brand} />
        <Text style={styles.setText} numberOfLines={1}>{value}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Remove location" hitSlop={10} onPress={onClear}>
        <Ionicons name="close-circle" size={16} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

/**
 * A short search for a place: what you type, the places it matches, "where
 * you are" first when Location is on, and "Use what I typed" for anywhere
 * the bank does not know. Picking one closes it.
 */
export function LocationSearch({ value, onChange, onCancel }: { value: string; onChange: (next: string) => void; onCancel: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { locationEnabled, detectedLocation } = useApp();
  const [query, setQuery] = useState(value);
  const input = useRef<TextInput>(null);
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 40); return () => clearTimeout(t); }, []);

  const typed = query.trim();
  const options = useMemo(() => searchPlaces(query).filter((p) => p.name !== detectedLocation), [query, detectedLocation]);
  const exact = options.some((p) => p.name.toLowerCase() === typed.toLowerCase());

  return (
    <View style={styles.panel}>
      <View style={styles.searchRow}>
        <Ionicons name="location-outline" size={18} color={colors.textMuted} />
        <TextInput
          ref={input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search for a place"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => (typed ? onChange(typed) : onCancel())}
          accessibilityLabel="Place"
          style={styles.input}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={8} onPress={onCancel}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
      {locationEnabled && detectedLocation && detectedLocation !== value ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Use ${detectedLocation}, where you are`} onPress={() => onChange(detectedLocation)} style={styles.option}>
          <Ionicons name="navigate" size={15} color={colors.brand} />
          <Text style={styles.optionText}>{detectedLocation}<Text style={styles.optionNote}> · where you are</Text></Text>
        </Pressable>
      ) : null}
      {options.map((place) => (
        <Pressable key={place.name} accessibilityRole="button" accessibilityLabel={`Use ${place.name}`} onPress={() => onChange(place.name)} style={styles.option}>
          <Ionicons name="location-outline" size={15} color={colors.textMuted} />
          <Text style={styles.optionText}>{place.name}</Text>
        </Pressable>
      ))}
      {typed && !exact ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Use ${typed}`} onPress={() => onChange(typed)} style={styles.option}>
          <Ionicons name="add" size={16} color={colors.textMuted} />
          <Text style={styles.optionText}>Use “{typed}”</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  linkText: { ...typography.small, color: colors.brand },
  set: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  setText: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  // One small panel: the search line, then the places under it.
  panel: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  input: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 8 },
  cancel: { ...typography.smallStrong, color: colors.brand },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  optionText: { ...typography.small, color: colors.text, flexShrink: 1 },
  optionNote: { color: colors.textMuted },
});
