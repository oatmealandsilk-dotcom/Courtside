import React from 'react';
import { Platform, type StyleProp, type TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { isOfficial } from '@/features/players/official';
import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/**
 * The official check after a CourtSide account's name (features/players/official): a solid green check in a
 * circle, about as tall as the name's capital letters. Never the coach shield (the shield means coach). Draws
 * nothing for anyone else. Pass `size` as roughly the name's font size times 0.8.
 */
export function OfficialCheck({ userId, size = 13, onMedia = false, style }: { userId?: string | null; size?: number; onMedia?: boolean; style?: StyleProp<TextStyle> }) {
  useTheme();
  if (!isOfficial(userId)) return null;
  return (
    <Ionicons
      name="checkmark-circle"
      size={size}
      color={onMedia ? colors.brandBright : colors.success}
      accessibilityLabel="Official account"
      // A browser reads a labelled icon only as an image; a phone reads the label as it is.
      role={Platform.OS === 'web' ? 'img' : undefined}
      style={style}
    />
  );
}
