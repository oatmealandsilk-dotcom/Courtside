import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import * as haptics from '@/lib/haptics';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/ui';
import { Wash } from '@/components/Wash';
import { useTheme, themeList, themes, type ThemeName } from '@/theme/ThemeProvider';
import { tapPoint, type TapPoint } from '@/theme/themeSwitch';
import { colors, radius, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

/** Every court, with a swatch and a line on what it is, on its own page. */
export default function ThemePage() {
  const styles = useThemedStyles(styleDefinitions);
  const { theme, setTheme } = useTheme();
  // The check moves on the tap itself, before the app has recoloured (Oct 16,
  // owner: "instant responsiveness"). It follows the theme again once that has
  // landed; a second quick tap simply moves it on.
  const [picked, setPicked] = useState<ThemeName | null>(null);
  useEffect(() => { if (picked === theme) setPicked(null); }, [picked, theme]);
  const shown = picked ?? theme;

  return (
    <Screen title="Theme" compactTitle onBack={() => goBack()}>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.lead}>Applies everywhere straight away. Pick the court you would rather be on.</Text>
      <View style={styles.list}>
        {themeList.map((option) => (
          <ThemeCard key={option.name} option={option} active={shown === option.name} onPick={(from) => { haptics.tap(); setPicked(option.name); setTheme(option.name, from); }} styles={styles} />
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
  // The court as a tiny page: its ground with its wash faintly on it, nothing else.
  swatch: { width: 56, height: 48, borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  name: { ...typography.bodyStrong, color: colors.text },
  blurb: { ...typography.small, color: colors.textMuted },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong },
});

/**
 * One theme to pick. Choosing it is a small moment: the card gives a little
 * push and its edge warms to the brand colour, the empty ring fills with a
 * check that pops in. Everything runs on the
 * animation thread, so it is smooth even as the whole app recolours.
 */
function ThemeCard({ option, active, onPick, styles }: { option: (typeof themeList)[number]; active: boolean; onPick: (from?: TapPoint) => void; styles: ReturnType<typeof useThemedStyles<typeof styleDefinitions>> }) {
  const palette = themes[option.name];
  const on = useSharedValue(active ? 1 : 0);
  const push = useSharedValue(1);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: 140, easing: Easing.out(Easing.quad) });
  }, [active, on]);
  // The card answers the tap itself with a little push, before the rest of the app has recoloured.
  // The check is there at once, on the very next frame, rather than easing in after the redraw.
  // The new court spreads out from the tap itself (Oct 21).
  const pick = (event: GestureResponderEvent) => {
    if (!active) {
      push.value = withSequence(withTiming(0.992, { duration: 50 }), withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }));
      on.value = 1;
    }
    onPick(tapPoint(event));
  };
  // The edge and the check take this theme's own colour, not the one the app is wearing now.
  // No outline change at all: the check alone says which one is on.
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: push.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ scale: 0.8 + 0.2 * on.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  return (
    <Pressable accessibilityRole="radio" aria-checked={active} accessibilityLabel={`${option.label} theme`} onPress={pick}>
      <Animated.View style={[styles.card, cardStyle]}>
        <View style={[styles.swatch, { backgroundColor: palette.bg, borderColor: palette.border }]}>
          <Wash theme={option.name} height={48} strength={0.7} fade={palette.bg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name}>{option.label}</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.blurb}>{option.blurb}</Text>
        </View>
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute' }, ringStyle]}><View style={styles.ring} /></Animated.View>
          <Animated.View style={[{ position: 'absolute' }, checkStyle]}><Ionicons name="checkmark-circle" size={24} color={palette.brand} /></Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
