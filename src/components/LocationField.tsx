import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Field } from '@/components/ui';
import { searchPlaces } from '@/data/locations';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * A city box that offers places from the bank as you type, and — when
 * Location is on in Settings — a one-tap "use where I am".
 */
export function LocationField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { locationEnabled, detectedLocation } = useApp();
  const [focused, setFocused] = useState(false);
  const options = useMemo(() => searchPlaces(value).filter((p) => p.name !== value), [value]);
  const showDetected = locationEnabled && detectedLocation && detectedLocation !== value;

  return (
    <View style={styles.wrap}>
      <Field
        label="Location"
        value={value}
        onChangeText={(next) => { setFocused(true); onChange(next); }}
        placeholder="City, state"
        autoCapitalize="words"
        hint={locationEnabled ? undefined : 'Turn on Location in Settings to fill this from your phone or computer.'}
      />
      {showDetected ? (
        <Pressable accessibilityRole="button" onPress={() => { onChange(detectedLocation); setFocused(false); }} style={styles.detected}>
          <Ionicons name="navigate" size={16} color={colors.brand} />
          <Text style={styles.detectedText}>Use my location · {detectedLocation}</Text>
        </Pressable>
      ) : null}
      {focused && options.length ? (
        <View style={styles.list}>
          {options.map((place, index) => (
            <Pressable
              key={place.name}
              accessibilityRole="button"
              accessibilityLabel={`Use ${place.name}`}
              onPress={() => { onChange(place.name); setFocused(false); }}
              style={({ pressed }) => [styles.option, index > 0 && styles.optionBorder, pressed && { backgroundColor: colors.surfaceAlt }]}
            >
              <Ionicons name="location-outline" size={16} color={colors.textMuted} />
              <Text style={styles.optionText}>{place.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm },
  detected: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  detectedText: { ...typography.smallStrong, color: colors.brand },
  list: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  optionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  optionText: { ...typography.body, color: colors.text },
});
