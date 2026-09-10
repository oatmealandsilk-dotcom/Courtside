import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

interface Props {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tint?: string;
  ink?: string;
  small?: boolean;
}

export function Chip({ label, selected = false, onPress, tint, ink, small = false }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const background = selected ? (tint ?? colors.brand) : colors.surfaceAlt;
  const color = selected ? (ink ?? colors.brandInk) : colors.textMuted;

  const body = (
    <View
      style={[
        styles.chip,
        small && styles.small,
        { backgroundColor: background, borderColor: selected ? 'transparent' : colors.border },
      ]}
    >
      <Text style={[small ? styles.textSmall : styles.text, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}>
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
  },
  small: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  text: { ...typography.smallStrong },
  textSmall: { ...typography.caption },
});
