import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import * as haptics from '@/lib/haptics';
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
        {themeList.map((option) => (
          <ThemeCard key={option.name} option={option} active={theme === option.name} onPick={() => { haptics.tap(); setTheme(option.name); }} styles={styles} />
        ))}
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

/**
 * One theme to pick. Choosing it is a small moment: the card gives a little
 * push and its edge warms to the brand colour, the empty ring fills with a
 * check that pops in, and the swatch settles. Everything runs on the
 * animation thread, so it is smooth even as the whole app recolours.
 */
function ThemeCard({ option, active, onPick, styles }: { option: (typeof themeList)[number]; active: boolean; onPick: () => void; styles: ReturnType<typeof useThemedStyles<typeof styleDefinitions>> }) {
  const palette = themes[option.name];
  const on = useSharedValue(active ? 1 : 0);
  const push = useSharedValue(1);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic) });
    if (active) push.value = withSequence(withTiming(0.985, { duration: 70 }), withSpring(1, { damping: 12, stiffness: 260 }));
  }, [active, on, push]);
  const cardStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(on.value, [0, 1], [colors.border, colors.brand]),
    transform: [{ scale: push.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ scale: 0.4 + 0.6 * on.value }, { rotate: `${(1 - on.value) * -60}deg` }],
  }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 1 - on.value, transform: [{ scale: 1 - 0.2 * on.value }] }));
  const swatchStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.04 * on.value }] }));
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={`${option.label} theme`} onPress={onPick}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Animated.View style={[styles.swatch, { backgroundColor: palette.bg, borderColor: palette.border }, swatchStyle]}>
          <View style={[styles.swatchBar, { backgroundColor: palette.brand }]} />
          <View style={styles.swatchRow}>
            <View style={[styles.swatchDot, { backgroundColor: palette.court }]} />
            <View style={[styles.swatchDot, { backgroundColor: palette.hard }]} />
            <View style={[styles.swatchDot, { backgroundColor: palette.clay }]} />
          </View>
        </Animated.View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>{option.label}</Text>
          <Text style={styles.blurb}>{option.blurb}</Text>
        </View>
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute' }, ringStyle]}><View style={styles.ring} /></Animated.View>
          <Animated.View style={[{ position: 'absolute' }, checkStyle]}><Ionicons name="checkmark-circle" size={24} color={colors.brand} /></Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
