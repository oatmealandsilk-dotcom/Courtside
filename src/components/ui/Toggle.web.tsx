import { useTheme } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { colors } from '@/theme';

const W = 46;
const H = 28;
const KNOB = 22;
const PAD = (H - KNOB) / 2;
/** A browser can ease these itself; react-native-web passes them straight through. */
const ease = (props: string) => ({ transitionProperty: props, transitionDuration: '220ms', transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }) as unknown as ViewStyle;

/**
 * The switch, drawn by us in a browser. The browser's own is a thin blue
 * track that reads "on" even when it is off. This one is a soft pill in
 * the page's own greys when off and the court colour when on, with a white
 * knob that glides across and a small shadow, like a phone's switch.
 */
export function Toggle({ value, onChange, disabled = false, accessibilityLabel }: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onChange(!value)}
      hitSlop={6}
      style={(state) => [
        {
          width: W, height: H, borderRadius: H / 2, padding: PAD,
          backgroundColor: value ? colors.brand : colors.surfaceAlt,
          borderWidth: 1, borderColor: value ? colors.brand : colors.border,
          opacity: disabled ? 0.45 : (state as { hovered?: boolean }).hovered ? 0.92 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        } as ViewStyle,
        ease('background-color, border-color, opacity'),
      ]}
    >
      <View
        style={[
          {
            width: KNOB, height: KNOB, borderRadius: KNOB / 2, marginTop: -1, marginLeft: -1,
            // White on every court, the way a phone's switch knob is.
            backgroundColor: '#FFFFFF',
            boxShadow: '0 1px 3px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
            transform: [{ translateX: value ? W - KNOB - PAD * 2 : 0 }],
          } as unknown as ViewStyle,
          ease('transform'),
        ]}
      />
    </Pressable>
  );
}
