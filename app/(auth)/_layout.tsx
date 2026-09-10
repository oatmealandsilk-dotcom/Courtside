import { useTheme } from '@/theme/ThemeProvider';
import React from 'react';
import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function AuthLayout() {
  useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
  );
}
