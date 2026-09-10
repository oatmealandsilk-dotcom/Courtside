import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

export default function Index() {
  const styles = useThemedStyles(styleDefinitions);
  const { ready, currentUserId, onboardingComplete } = useApp();

  if (!ready) {
    return (
      <View style={styles.splash}>
        <Text style={styles.wordmark}>CourtSide</Text>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!currentUserId) return <Redirect href="/sign-in" />;
  if (!onboardingComplete) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}

const styleDefinitions = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  wordmark: { ...typography.display, color: colors.brand, letterSpacing: -1 },
});
