import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { searchPlaces } from '@/data/locations';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * "Add location", the way Instagram does it: one quiet row under the caption,
 * not a box asking to be filled. Tap it and it becomes a short search for a
 * place; pick one and the row shows it, with an × to take it off again.
 */
export function LocationChip({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { locationEnabled, detectedLocation } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const input = useRef<TextInput>(null);
  useEffect(() => { if (open) { const t = setTimeout(() => input.current?.focus(), 40); return () => clearTimeout(t); } }, [open]);

  const typed = query.trim();
  const options = useMemo(() => searchPlaces(query).filter((p) => p.name !== detectedLocation), [query, detectedLocation]);
  const exact = options.some((p) => p.name.toLowerCase() === typed.toLowerCase());
  const choose = (place: string) => { onChange(place); setOpen(false); setQuery(''); };
  const close = () => { setOpen(false); setQuery(''); };

  if (open) {
    return (
      <View style={styles.open}>
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
            onSubmitEditing={() => (typed ? choose(typed) : close())}
            accessibilityLabel="Place"
            style={styles.input}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={8} onPress={close}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
        {locationEnabled && detectedLocation && detectedLocation !== value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Use ${detectedLocation}, where you are`} onPress={() => choose(detectedLocation)} style={styles.option}>
            <Ionicons name="navigate" size={15} color={colors.brand} />
            <Text style={styles.optionText}>{detectedLocation}<Text style={styles.optionNote}> · where you are</Text></Text>
          </Pressable>
        ) : null}
        {options.map((place) => (
          <Pressable key={place.name} accessibilityRole="button" accessibilityLabel={`Use ${place.name}`} onPress={() => choose(place.name)} style={styles.option}>
            <Ionicons name="location-outline" size={15} color={colors.textMuted} />
            <Text style={styles.optionText}>{place.name}</Text>
          </Pressable>
        ))}
        {typed && !exact ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Use ${typed}`} onPress={() => choose(typed)} style={styles.option}>
            <Ionicons name="add" size={16} color={colors.textMuted} />
            <Text style={styles.optionText}>Use “{typed}”</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (value) {
    return (
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Location: ${value}. Tap to change it`} onPress={() => { setQuery(value); setOpen(true); }} style={styles.set}>
          <Ionicons name="location" size={16} color={colors.brand} />
          <Text style={styles.setText} numberOfLines={1}>{value}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Remove location" hitSlop={8} onPress={() => onChange('')}>
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Add location" onPress={() => setOpen(true)} style={styles.row}>
      <Ionicons name="location-outline" size={18} color={colors.textMuted} />
      <Text style={styles.label}>Add location</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  // The closed row matches the form's other quiet lines (an icon, muted words).
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  label: { ...typography.small, color: colors.textMuted, flex: 1 },
  set: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  setText: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  // Open, it is one small panel: the search line, then the places under it.
  open: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  input: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 8 },
  cancel: { ...typography.smallStrong, color: colors.brand },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  optionText: { ...typography.small, color: colors.text, flexShrink: 1 },
  optionNote: { color: colors.textMuted },
});
