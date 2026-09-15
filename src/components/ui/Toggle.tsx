import { useTheme } from '@/theme/ThemeProvider';
import React from 'react';
import { Platform, Switch } from 'react-native';

import { colors } from '@/theme';

/**
 * A Switch in the theme's colours on every platform.
 *
 * On web, react-native-web's Switch ignores `thumbColor` once it is on and
 * paints its own teal thumb and track, which is why toggles looked like they
 * belonged to a different app. It listens to `activeThumbColor` and
 * `activeTrackColor` instead, so both are passed here.
 */
export function Toggle({ value, onChange, disabled = false, accessibilityLabel }: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  useTheme();
  const webOnly = Platform.OS === 'web'
    ? ({ activeThumbColor: colors.brandInk, activeTrackColor: colors.brand } as Record<string, string>)
    : {};
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ true: colors.brand, false: colors.borderStrong }}
      thumbColor={value ? colors.brandInk : colors.bg}
      ios_backgroundColor={colors.borderStrong}
      // The stock switch is oversized next to a row of small text; scaled
      // down a touch, with the thumb along with it.
      style={{ transform: [{ scale: 0.9 }], marginVertical: -2, marginRight: -2 }}
      {...webOnly}
    />
  );
}
