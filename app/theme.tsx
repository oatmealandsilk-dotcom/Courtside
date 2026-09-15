import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '@/components/ui';
import { useTheme, themeList, themes } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

/** Every court, with a swatch and a line on what it is, on its own page. */
export default function ThemePage() {
  const styles = useThemedStyles(styleDefinitions);
  const { theme, setTheme } = useTheme();

  return (
    <Screen title="Theme" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>Applies everywhere straight away. Pick the court you would rather be on.</Text>
      <View style={styles.list}>
        {themeList.map((option) => {
          const palette = themes[option.name];
          const active = theme === option.name;
          return (
            <Pressable
              key={option.name}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${option.label} theme`}
              onPress={() => setTheme(option.name)}
              style={[styles.card, active && styles.cardActive]}
            >
              <View style={[styles.swatch, { backgroundColor: palette.bg, borderColor: palette.border }]}>
                <View style={[styles.swatchBar, { backgroundColor: palette.brand }]} />
                <View style={styles.swatchRow}>
                  <View style={[styles.swatchDot, { backgroundColor: palette.court }]} />
                  <View style={[styles.swatchDot, { backgroundColor: palette.hard }]} />
                  <View style={[styles.swatchDot, { backgroundColor: palette.clay }]} />
                </View>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name}>{option.label}</Text>
                <Text style={styles.blurb}>{option.blurb}</Text>
              </View>
              {active ? <Ionicons name="checkmark-circle" size={22} color={colors.brand} /> : <View style={styles.ring} />}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  list: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  cardActive: { borderColor: colors.brand },
  swatch: {
    width: 58,
    height: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 8,
    justifyContent: 'space-between',
  },
  swatchBar: { height: 6, borderRadius: 3 },
  swatchRow: { flexDirection: 'row', gap: 4 },
  swatchDot: { width: 10, height: 10, borderRadius: 5 },
  name: { ...typography.bodyStrong, color: colors.text },
  blurb: { ...typography.small, color: colors.textMuted },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong },
});
