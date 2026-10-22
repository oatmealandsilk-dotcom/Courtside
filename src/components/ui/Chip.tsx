import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, radius, spacing, typography } from '@/theme';
import { BrandWash } from './BrandWash';
import { TextScale } from '@/theme/textScale';
import { CALM_SHEETS } from '@/design/sendToPreview';

interface Props {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tint?: string;
  ink?: string;
  small?: boolean;
  /** A small icon before the words while chosen (a tick on a match's result). */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

export function Chip({ label, selected = false, onPress, tint, ink, small = false, icon }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const background = selected ? (tint ?? colors.brand) : colors.surfaceAlt;
  const color = selected ? (ink ?? colors.brandInk) : colors.textMuted;

  const body = (
    <View
      style={[
        styles.chip,
        small && styles.small,
        // The calm preview's sheets (?ss=b, web): no outline on a chip, the grey well is enough.
        { backgroundColor: background, borderColor: selected || CALM_SHEETS ? 'transparent' : colors.border },
      ]}
    >
      {selected && !tint ? <BrandWash /> : null}
      {selected && icon ? <Ionicons name={icon} size={small ? 12 : 15} color={color} /> : null}
      <Text maxFontSizeMultiplier={TextScale.TITLE} style={[small ? styles.textSmall : styles.text, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return body;
  // A small chip is well under a finger's 44 points: a wider reach than it looks
  // (no visual change), and a screen reader hears which one is on.
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={small ? { top: 10, bottom: 10, left: 4, right: 4 } : 6}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {body}
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  small: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  text: { ...typography.smallStrong },
  textSmall: { ...typography.caption },
});
