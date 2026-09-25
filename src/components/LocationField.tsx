import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Field } from '@/components/ui';
import { searchPlaces } from '@/data/locations';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography, font } from '@/theme';

/**
 * A city box that offers places from the bank as you type, and — when
 * Location is on in Settings — a one-tap "use where I am".
 */
/** How many leading letters of a place the typed text already covers. */
const matchLength = (name: string, typed: string) => {
  const t = typed.trim().toLowerCase();
  return t && name.toLowerCase().startsWith(t) ? t.length : 0;
};

export function LocationField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { locationEnabled, detectedLocation } = useApp();
  const [focused, setFocused] = useState(false);
  const options = useMemo(() => searchPlaces(value).filter((p) => p.name !== value), [value]);
  const showDetected = locationEnabled && detectedLocation && detectedLocation !== value;

  return (
    <View style={styles.wrap}>
      <View style={[styles.box, focused && options.length > 0 && styles.boxOpen]}>
        <Field
          label="Location"
          value={value}
          onChangeText={(next) => { setFocused(true); onChange(next); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="City, state"
          autoCapitalize="words"
          autoCorrect={false}
          flush={focused && options.length > 0}
        />
        {focused && options.length ? (
          <View style={styles.list}>
            {options.map((place, index) => (
              <Pressable
                key={place.name}
                accessibilityRole="button"
                accessibilityLabel={`Use ${place.name}`}
                onPress={() => { onChange(place.name); setFocused(false); }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                <Text style={styles.optionText}>
                  <Text style={styles.match}>{place.name.slice(0, matchLength(place.name, value))}</Text>
                  {place.name.slice(matchLength(place.name, value))}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      {locationEnabled ? null : <Text style={styles.hint}>Turn on Location in Settings to fill this from your phone or computer.</Text>}
      {showDetected ? (
        <Pressable accessibilityRole="button" onPress={() => { onChange(detectedLocation); setFocused(false); }} style={styles.detected}>
          <Ionicons name="navigate" size={16} color={colors.brand} />
          <Text style={styles.detectedText}>Use my location · {detectedLocation}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm },
  detected: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  detectedText: { ...typography.smallStrong, color: colors.brand },
  box: {},
  boxOpen: {},
  hint: { ...typography.small, color: colors.textFaint },
  // Continues the input's own frame downward, so the list reads as part of
  // the box rather than a second panel.
  list: {
    marginTop: -1,
    borderWidth: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 11 },
  optionText: { ...typography.body, color: colors.text },
  match: { ...font('700'), color: colors.text },
});
