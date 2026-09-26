import { useTheme } from '@/theme/ThemeProvider';
import React from 'react';
import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function AuthLayout() {
  useTheme();
  return (
    // The sign-in steps (sign in, birthday, terms, setup) fade into one another rather than sliding like pages.
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade', animationDuration: 280 }} />
  );
}
