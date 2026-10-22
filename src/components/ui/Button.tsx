import { PRESS_SHRINK } from '@/theme/press';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { CourtSpinner } from '@/components/CourtSpinner';
import { Tappable } from '@/components/Tappable';
import { BrandWash } from '@/components/ui/BrandWash';
import { buttonShape, colors, pageIsDark, spacing, typography } from '@/theme';
import { TextScale, oneLine } from '@/theme/textScale';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  /** Looks greyed out like `disabled`, but still takes a tap (to say what is missing). */
  dim?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
  /**
   * 'sm': a compact button (34pt tall, a touch more to the finger), as
   * Instagram's Edit profile and Follow, for a row of actions on a card or a
   * profile, where full-size buttons wrap and weigh it down.
   */
  size?: 'md' | 'sm';
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  dim = false,
  loading = false,
  style,
  full = false,
  size = 'md',
}: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const palette = paletteFor(variant);
  const inactive = disabled || loading;
  const faded = inactive || dim;

  return (
    <Tappable
      disabled={inactive}
      onPress={onPress}
      // A wide button travelling as far as a small icon looks wobbly.
      scaleTo={PRESS_SHRINK}
      hoverTo={1.04}
      accessibilityLabel={label}
      hitSlop={size === 'sm' ? 4 : undefined}
      style={[
        styles.base,
        size === 'sm' && styles.small,
        variant === 'primary' && !faded && (pageIsDark() ? styles.liftDark : styles.lift),
        full && styles.full,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: faded ? 0.5 : 1 },
        style,
      ]}
    >
      {variant === 'primary' ? <BrandWash radius={size === 'sm' ? buttonShape.smallRadius : buttonShape.radius} /> : null}
      <View style={styles.inner}>
        {loading ? <CourtSpinner size={size === 'sm' ? 15 : 18} ink={palette.fg} /> : null}
        <Text {...(size === 'sm' ? oneLine(TextScale.TITLE, 0.8) : { maxFontSizeMultiplier: TextScale.TITLE })} style={[styles.label, size === 'sm' && styles.smallLabel, { color: palette.fg }]} numberOfLines={size === 'sm' ? 1 : undefined}>{label}</Text>
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
  // Instagram's shape (Oct 22): a rounded rectangle with Apple's smooth corner, 44pt tall.
  base: {
    minHeight: buttonShape.height,
    paddingVertical: 10,
    paddingHorizontal: spacing.xl,
    borderRadius: buttonShape.radius,
    ...buttonShape.curve,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  full: { alignSelf: 'stretch' },
  small: { paddingVertical: 0, minHeight: buttonShape.smallHeight, borderRadius: buttonShape.smallRadius, paddingHorizontal: spacing.lg },
  smallLabel: { ...typography.smallStrong, fontSize: buttonShape.smallLabel },
  // The one shadow on the page: the primary action, in its own colour, soft.
  lift: { shadowColor: colors.brand, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  // On a dark page a shadow in the button's own colour turns into a halo; a plain dark one just lifts it.
  liftDark: { shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.bodyStrong },
});
