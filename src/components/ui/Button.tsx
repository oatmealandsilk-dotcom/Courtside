import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Tappable } from '@/components/Tappable';
import { colors, radius, spacing, typography } from '@/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  full = false,
}: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const palette = paletteFor(variant);
  const inactive = disabled || loading;

  return (
    <Tappable
      disabled={inactive}
      onPress={onPress}
      // A wide button travelling as far as a small icon looks wobbly.
      scaleTo={0.97}
      hoverTo={1.04}
      accessibilityLabel={label}
      style={[
        styles.base,
        full && styles.full,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.5 : 1 },
        style,
      ]}
    >
      <View style={styles.inner}>
        {loading ? <ActivityIndicator size="small" color={palette.fg} /> : null}
        <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
      </View>
    </Tappable>
  );
}

function paletteFor(variant: Variant): { bg: string; fg: string; border: string } {
  switch (variant) {
    case 'secondary':
      return { bg: colors.surfaceAlt, fg: colors.text, border: colors.borderStrong };
    case 'ghost':
      return { bg: 'transparent', fg: colors.textMuted, border: 'transparent' };
    case 'danger':
      return { bg: 'transparent', fg: colors.danger, border: colors.danger };
    default:
      return { bg: colors.brand, fg: colors.brandInk, border: 'transparent' };
  }
}

const styleDefinitions = StyleSheet.create({
  base: {
    paddingVertical: 13,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
  },
  full: { alignSelf: 'stretch' },
  inner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.bodyStrong },
});
