import { PRESS_SHRINK } from '@/theme/press';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { SwipePressable } from '@/components/SwipePressable';

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
    // SwipePressable: on a page that swipes sideways, a finger that is swiping never shrinks the card.
    <SwipePressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {content}
    </SwipePressable>
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
  // A card shrinks slightly while held, like a button (Oct 20 sweep: one press feel).
  pressed: { transform: [{ scale: PRESS_SHRINK }] },
});
