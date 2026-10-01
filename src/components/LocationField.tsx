import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Field } from '@/components/ui';
import { PLACES, searchPlaces } from '@/data/locations';
import { searchCitiesRemote, type CityHit } from '@/features/places/search';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography, font } from '@/theme';

/**
 * A city box that offers places as you type — the built-in list at once,
 * then any town in the world a beat later — and, when Location is on in
 * Settings, a one-tap "use where I am". Picking a place hands back where
 * it is too, so the map can put this person in their own town.
 */
/** How many leading letters of a place the typed text already covers. */
const matchLength = (name: string, typed: string) => {
  const t = typed.trim().toLowerCase();
  return t && name.toLowerCase().startsWith(t) ? t.length : 0;
};

type At = { lat: number; lng: number };
export function LocationField({ value, onChange }: { value: string; onChange: (next: string, at: At | null) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { locationEnabled, detectedLocation, detectedCoords } = useApp();
  const [focused, setFocused] = useState(false);
  const [remote, setRemote] = useState<CityHit[]>([]);
  // The world's towns arrive a beat after typing stops; a newer search cancels an older one.
  useEffect(() => {
    const typed = value.trim();
    if (!focused || typed.length < 2) { setRemote([]); return; }
    const control = new AbortController();
    const t = setTimeout(() => {
      searchCitiesRemote(typed, detectedCoords, control.signal).then(setRemote).catch(() => {});
    }, 300);
    return () => { clearTimeout(t); control.abort(); };
  }, [value, focused, detectedCoords]);
  const options = useMemo<CityHit[]>(() => {
    const local = searchPlaces(value).map((p) => ({ name: p.name, lat: p.lat, lng: p.lng }));
    const names = new Set(local.map((p) => p.name.toLowerCase()));
    return [...local, ...remote.filter((r) => !names.has(r.name.toLowerCase()))].filter((p) => p.name !== value).slice(0, 6);
  }, [value, remote]);
  const showDetected = locationEnabled && detectedLocation && detectedLocation !== value;

  return (
    <View style={styles.wrap}>
      <View style={[styles.box, focused && options.length > 0 && styles.boxOpen]}>
        <Field
          label="Location"
          value={value}
          onChangeText={(next) => { setFocused(true); onChange(next, null); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
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
                onPress={() => { onChange(place.name, { lat: place.lat, lng: place.lng }); setFocused(false); }}
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
      {showDetected ? (
        <Pressable accessibilityRole="button" onPress={() => { const bank = PLACES.find((p) => p.name === detectedLocation); onChange(detectedLocation, detectedCoords ?? (bank ? { lat: bank.lat, lng: bank.lng } : null)); setFocused(false); }} style={styles.detected}>
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
