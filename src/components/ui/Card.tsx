import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

interface Props {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

export function Card({ children, onPress, style, padded = true }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const content = (
    <View style={[styles.card, padded && styles.padded, style]}>{children}</View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [pressed ? styles.pressed : undefined, hovered && !pressed ? styles.hovered : undefined]}>
      {content}
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  padded: { padding: spacing.lg },
  pressed: { opacity: 0.72 },
  // Pointer devices only: a touch lighter under the mouse. (Not a scale: a card that fills the page would shift its words.)
  hovered: { opacity: 0.9 },
});
